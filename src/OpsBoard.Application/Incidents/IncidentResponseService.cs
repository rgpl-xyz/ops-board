using FluentValidation;
using OpsBoard.Application.Common;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Lookups;
using OpsBoard.Domain;
using OpsBoard.Domain.Entities;

namespace OpsBoard.Application.Incidents;

public sealed class IncidentResponseService(
    ICurrentUser currentUser,
    IIncidentData data,
    IIncidentReadData readData,
    ILookupData lookupData,
    IValidator<LifecycleVersionRequest> lifecycleValidator,
    IValidator<WrittenUpdateRequest> updateValidator,
    TimeProvider timeProvider)
{
    public async Task<ResponseMutationDto> JoinAsync(
        Guid id,
        LifecycleVersionRequest request,
        CancellationToken cancellationToken)
    {
        await lifecycleValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireResponse(user.Role);
        var expected = RevisionFormatting.ParseRequired(
            request.ExpectedLifecycleVersion,
            nameof(request.ExpectedLifecycleVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureLifecycle(session, expected);
        try
        {
            session.Incident.EnsureActive();
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        if (await session.HasResponderAsync(user.UserId, cancellationToken))
        {
            throw new ResponderConflictException("Already joined.");
        }

        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        var membership = IncidentResponder.Create(user.OrganizationId, id, user.UserId, now);
        session.AddResponder(membership);
        var sequence = session.PeekNextHistorySequence();
        var entry = IncidentTimelineEntry.ResponderJoined(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now);
        session.AppendHistory(entry);
        var committed = await session.CommitAsync(cancellationToken);
        var dto = await MapEntryAsync(user.OrganizationId, committed!, cancellationToken);
        var display = await DisplayNameAsync(user.OrganizationId, user.UserId, cancellationToken);
        return new ResponseMutationDto(
            id,
            RevisionFormatting.ToWire(session.Version),
            RevisionFormatting.ToWire(session.LifecycleVersion),
            dto,
            new ResponderDto(user.UserId, display, now));
    }

    public async Task<ResponseMutationDto> LeaveAsync(
        Guid id,
        LifecycleVersionRequest request,
        CancellationToken cancellationToken)
    {
        await lifecycleValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireResponse(user.Role);
        var expected = RevisionFormatting.ParseRequired(
            request.ExpectedLifecycleVersion,
            nameof(request.ExpectedLifecycleVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureLifecycle(session, expected);
        try
        {
            session.Incident.EnsureActive();
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        if (!await session.HasResponderAsync(user.UserId, cancellationToken))
        {
            throw new ResponderConflictException("Not a current responder.");
        }

        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        session.RemoveResponder(user.UserId);
        var sequence = session.PeekNextHistorySequence();
        var entry = IncidentTimelineEntry.ResponderLeft(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now);
        session.AppendHistory(entry);
        var committed = await session.CommitAsync(cancellationToken);
        var dto = await MapEntryAsync(user.OrganizationId, committed!, cancellationToken);
        return new ResponseMutationDto(
            id,
            RevisionFormatting.ToWire(session.Version),
            RevisionFormatting.ToWire(session.LifecycleVersion),
            dto,
            Responder: null);
    }

    public async Task<ResponseMutationDto> AddUpdateAsync(
        Guid id,
        WrittenUpdateRequest request,
        CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireResponse(user.Role);
        var expected = RevisionFormatting.ParseRequired(
            request.ExpectedLifecycleVersion,
            nameof(request.ExpectedLifecycleVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureLifecycle(session, expected);
        try
        {
            session.Incident.EnsureActive();
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        var sequence = session.PeekNextHistorySequence();
        var entry = IncidentTimelineEntry.WrittenUpdate(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now,
            request.Body);
        session.AppendHistory(entry);
        var committed = await session.CommitAsync(cancellationToken);
        var dto = await MapEntryAsync(user.OrganizationId, committed!, cancellationToken);
        return new ResponseMutationDto(
            id,
            RevisionFormatting.ToWire(session.Version),
            RevisionFormatting.ToWire(session.LifecycleVersion),
            dto,
            Responder: null);
    }

    public async Task<Bounded<ResponderDto>> ListRespondersAsync(
        Guid id,
        ContinuationQuery query,
        CancellationToken cancellationToken)
    {
        if (query.Limit is < 1 or > 100)
        {
            throw new ValidationFailedException("limit", "Limit must be between 1 and 100.");
        }

        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        _ = await data.GetAsync(user.OrganizationId, id, cancellationToken)
            ?? throw new UnavailableException();
        var (items, next) = await readData.ListRespondersAsync(
            user.OrganizationId,
            id,
            query.Limit,
            query.After,
            cancellationToken);
        return new Bounded<ResponderDto>(items, next);
    }

    public async Task<PageResult<TimelineEntryDto>> ListTimelineAsync(
        Guid id,
        PageQuery query,
        CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100)
        {
            throw new ValidationFailedException("page", "Invalid paging.");
        }

        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        _ = await data.GetAsync(user.OrganizationId, id, cancellationToken)
            ?? throw new UnavailableException();
        var (items, total) = await readData.ListTimelineAsync(
            user.OrganizationId,
            id,
            query.Page,
            query.PageSize,
            cancellationToken);
        return new PageResult<TimelineEntryDto>(
            items,
            query.Page,
            query.PageSize,
            total,
            PageMath.TotalPages(total, query.PageSize));
    }

    private async Task<TimelineEntryDto> MapEntryAsync(
        Guid organizationId,
        IncidentTimelineEntry entry,
        CancellationToken cancellationToken)
    {
        var (items, _) = await readData.ListTimelineAsync(organizationId, entry.IncidentId, 1, 1000, cancellationToken);
        return items.First(x => x.Id == entry.Id);
    }

    private async Task<string> DisplayNameAsync(
        Guid organizationId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var (users, _) = await lookupData.ListUsersAsync(organizationId, 100, null, cancellationToken);
        return users.FirstOrDefault(x => x.Id == userId)?.DisplayName
            ?? throw new UnavailableException();
    }

    private static void EnsureLifecycle(IIncidentWriteSession session, long expected)
    {
        if (session.LifecycleVersion != expected)
        {
            throw new ConcurrencyConflictException();
        }
    }

    private static DateTimeOffset Normalize(DateTimeOffset now, DateTimeOffset lowerBound)
    {
        var utc = now.ToOffset(TimeSpan.Zero);
        var ticks = utc.UtcTicks - (utc.UtcTicks % 10);
        var normalized = new DateTimeOffset(ticks, TimeSpan.Zero);
        return normalized < lowerBound ? lowerBound : normalized;
    }
}
