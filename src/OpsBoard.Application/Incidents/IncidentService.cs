using FluentValidation;
using Microsoft.Extensions.Logging;
using OpsBoard.Application.Common;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Realtime;
using OpsBoard.Application.Services;
using OpsBoard.Domain;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Incidents;

public sealed class IncidentService(
    ICurrentUser currentUser,
    IIncidentData data,
    IServiceData serviceData,
    IIncidentRealtimePublisher realtimePublisher,
    ILogger<IncidentService> logger,
    IValidator<CreateIncidentRequest> createValidator,
    IValidator<UpdateIncidentRequest> updateValidator,
    IValidator<SeverityRequest> severityValidator,
    IValidator<StatusRequest> statusValidator,
    IValidator<VersionRequest> versionValidator,
    IValidator<IncidentQuery> queryValidator,
    TimeProvider timeProvider)
{
    public async Task<PageResult<IncidentSummaryDto>> ListAsync(IncidentQuery query, CancellationToken cancellationToken)
    {
        await queryValidator.ValidateAndThrowAsync(query, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        await EnsureFilterTargetsExistAsync(user.OrganizationId, query, cancellationToken);
        var (items, total) = await data.ListAsync(user.OrganizationId, query, cancellationToken);
        return new PageResult<IncidentSummaryDto>(
            items,
            query.Page,
            query.PageSize,
            total,
            PageMath.TotalPages(total, query.PageSize));
    }

    public async Task<IncidentDetailDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        return await data.GetAsync(user.OrganizationId, id, cancellationToken)
            ?? throw new UnavailableException();
    }

    public async Task<IncidentDetailDto> CreateAsync(CreateIncidentRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);

        await using var session = await data.BeginCreateAsync(user.OrganizationId, cancellationToken);
        if (!await session.ServiceExistsAsync(request.ServiceId, cancellationToken)
            || !await session.ActorExistsAsync(user.UserId, cancellationToken))
        {
            throw new UnavailableException();
        }

        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        var incident = Incident.Create(
            Guid.NewGuid(),
            user.OrganizationId,
            request.ServiceId,
            user.UserId,
            request.Title,
            request.Description,
            request.Severity,
            now);
        session.AddIncident(incident);
        var sequence = session.PeekNextHistorySequence();
        session.AppendHistory(IncidentTimelineEntry.IncidentCreated(
            Guid.NewGuid(),
            user.OrganizationId,
            incident.Id,
            user.UserId,
            sequence,
            now,
            request.Severity));
        await session.CommitAsync(cancellationToken);
        await PublishAsync(
            user.OrganizationId,
            incident.Id,
            IncidentRealtimeFactKind.IncidentCreated,
            session.Version,
            session.LifecycleVersion,
            now,
            cancellationToken);
        return await GetAsync(incident.Id, cancellationToken);
    }

    public async Task<IncidentDetailDto> UpdateDetailsAsync(
        Guid id,
        UpdateIncidentRequest request,
        CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);
        var expected = RevisionFormatting.ParseRequired(request.ExpectedVersion, nameof(request.ExpectedVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureVersion(session, expected);
        if (!await session.ServiceExistsAsync(request.ServiceId, cancellationToken))
        {
            throw new UnavailableException();
        }

        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        try
        {
            session.Incident.UpdateDetails(request.Title, request.Description, request.ServiceId, now);
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        session.AdvanceScalarRevision(lifecycleChanged: false);
        await session.CommitAsync(cancellationToken);
        await PublishAsync(
            user.OrganizationId,
            id,
            IncidentRealtimeFactKind.IncidentDetailsChanged,
            session.Version,
            session.LifecycleVersion,
            now,
            cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<IncidentDetailDto> ChangeSeverityAsync(
        Guid id,
        SeverityRequest request,
        CancellationToken cancellationToken)
    {
        await severityValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);
        var expected = RevisionFormatting.ParseRequired(request.ExpectedVersion, nameof(request.ExpectedVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureVersion(session, expected);
        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        var from = session.Incident.Severity;
        bool changed;
        try
        {
            changed = session.Incident.ChangeSeverity(request.Severity, now);
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        if (!changed)
        {
            await session.CommitAsync(cancellationToken);
            return await GetAsync(id, cancellationToken);
        }

        session.AdvanceScalarRevision(lifecycleChanged: false);
        var sequence = session.PeekNextHistorySequence();
        session.AppendHistory(IncidentTimelineEntry.SeverityChanged(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now,
            from,
            request.Severity));
        await session.CommitAsync(cancellationToken);
        await PublishAsync(
            user.OrganizationId,
            id,
            IncidentRealtimeFactKind.IncidentSeverityChanged,
            session.Version,
            session.LifecycleVersion,
            now,
            cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<IncidentDetailDto> ChangeActiveStatusAsync(
        Guid id,
        StatusRequest request,
        CancellationToken cancellationToken)
    {
        await statusValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);
        var expected = RevisionFormatting.ParseRequired(request.ExpectedVersion, nameof(request.ExpectedVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureVersion(session, expected);
        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        var from = session.Incident.Status;
        try
        {
            session.Incident.ChangeActiveStatus(request.Status, now);
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        session.AdvanceScalarRevision(lifecycleChanged: false);
        var sequence = session.PeekNextHistorySequence();
        session.AppendHistory(IncidentTimelineEntry.StatusChanged(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now,
            from,
            request.Status));
        await session.CommitAsync(cancellationToken);
        await PublishAsync(
            user.OrganizationId,
            id,
            IncidentRealtimeFactKind.IncidentStatusChanged,
            session.Version,
            session.LifecycleVersion,
            now,
            cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<IncidentDetailDto> ResolveAsync(Guid id, VersionRequest request, CancellationToken cancellationToken)
    {
        await versionValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);
        var expected = RevisionFormatting.ParseRequired(request.ExpectedVersion, nameof(request.ExpectedVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureVersion(session, expected);
        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        var from = session.Incident.Status;
        try
        {
            session.Incident.Resolve(now);
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        session.AdvanceScalarRevision(lifecycleChanged: true);
        var sequence = session.PeekNextHistorySequence();
        session.AppendHistory(IncidentTimelineEntry.Resolved(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now,
            from));
        await session.CommitAsync(cancellationToken);
        await PublishAsync(
            user.OrganizationId,
            id,
            IncidentRealtimeFactKind.IncidentResolved,
            session.Version,
            session.LifecycleVersion,
            now,
            cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<IncidentDetailDto> ReopenAsync(Guid id, VersionRequest request, CancellationToken cancellationToken)
    {
        await versionValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);
        var expected = RevisionFormatting.ParseRequired(request.ExpectedVersion, nameof(request.ExpectedVersion));

        await using var session = await data.BeginMutationAsync(user.OrganizationId, id, cancellationToken);
        EnsureVersion(session, expected);
        var now = Normalize(timeProvider.GetUtcNow(), session.TimestampLowerBound);
        try
        {
            session.Incident.Reopen(now);
        }
        catch (DomainException ex)
        {
            throw new LifecycleConflictException(ex.Message);
        }

        session.AdvanceScalarRevision(lifecycleChanged: true);
        var sequence = session.PeekNextHistorySequence();
        session.AppendHistory(IncidentTimelineEntry.Reopened(
            Guid.NewGuid(),
            user.OrganizationId,
            id,
            user.UserId,
            sequence,
            now));
        await session.CommitAsync(cancellationToken);
        await PublishAsync(
            user.OrganizationId,
            id,
            IncidentRealtimeFactKind.IncidentReopened,
            session.Version,
            session.LifecycleVersion,
            now,
            cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    private Task PublishAsync(
        Guid organizationId,
        Guid incidentId,
        IncidentRealtimeFactKind kind,
        long version,
        long lifecycleVersion,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken) =>
        IncidentRealtimePublication.TryPublishAsync(
            realtimePublisher,
            logger,
            organizationId,
            incidentId,
            kind,
            version,
            lifecycleVersion,
            occurredAtUtc,
            cancellationToken);

    private async Task EnsureFilterTargetsExistAsync(
        Guid organizationId,
        IncidentQuery query,
        CancellationToken cancellationToken)
    {
        if (query.ServiceId is Guid serviceId
            && !await serviceData.ServiceExistsAsync(organizationId, serviceId, cancellationToken))
        {
            throw new UnavailableException();
        }

        if (query.TeamId is Guid teamId
            && !await serviceData.TeamExistsAsync(organizationId, teamId, cancellationToken))
        {
            throw new UnavailableException();
        }
    }

    private static void EnsureVersion(IIncidentWriteSession session, long expected)
    {
        if (session.Version != expected)
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
