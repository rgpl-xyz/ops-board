using FluentValidation;
using Microsoft.Extensions.Logging.Abstractions;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Incidents;
using OpsBoard.Application.Lookups;
using OpsBoard.Application.Realtime;
using OpsBoard.Application.Services;
using OpsBoard.Application.Validation;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

using static OpsBoard.UnitTests.Application.IncidentServiceHarness;

namespace OpsBoard.UnitTests.Application;

/// Shared fakes and wiring for Application-level incident tests. Extracted from
/// the realtime publication tests so more than one test class can use them.
internal static class IncidentServiceHarness
{
    internal static readonly Guid OrgId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    internal static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    internal static readonly Guid ServiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    internal static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");

    internal static IncidentService CreateIncidentService(
        FakeIncidentData data,
        IIncidentRealtimePublisher publisher,
        UserRole role = UserRole.IncidentManager) =>
        new(
            new FakeCurrentUser(role),
            data,
            new FakeServiceData(),
            publisher,
            NullLogger<IncidentService>.Instance,
            new CreateIncidentRequestValidator(),
            new UpdateIncidentRequestValidator(),
            new SeverityRequestValidator(),
            new StatusRequestValidator(),
            new VersionRequestValidator(),
            new IncidentQueryValidator(),
            new FixedTimeProvider(Now));

    internal static IncidentResponseService CreateResponseService(
        FakeIncidentData data,
        FakeReadData read,
        FakeLookups lookups,
        IIncidentRealtimePublisher publisher,
        UserRole role = UserRole.IncidentManager) =>
        new(
            new FakeCurrentUser(role),
            data,
            read,
            lookups,
            publisher,
            NullLogger<IncidentResponseService>.Instance,
            new LifecycleVersionRequestValidator(),
            new WrittenUpdateRequestValidator(),
            new FixedTimeProvider(Now));
}

internal enum SessionMode
{
    Create,
    Mutation,
}

internal sealed class SharedClock
{
    private int _n;
    public int Next() => ++_n;
}

internal sealed class RecordingPublisher(SharedClock? clock = null) : IIncidentRealtimePublisher
{
    public List<IncidentRealtimeFact> Facts { get; } = [];

    public List<int> PublishSequences { get; } = [];

    public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken)
    {
        PublishSequences.Add(clock?.Next() ?? Facts.Count + 1);
        Facts.Add(fact);
        return Task.CompletedTask;
    }
}

internal sealed class ThrowingPublisher : IIncidentRealtimePublisher
{
    public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("notify failed");
}

internal sealed class FakeCurrentUser(UserRole role = UserRole.IncidentManager) : ICurrentUser
{
    public Task<CurrentUser> GetAsync(CancellationToken cancellationToken) =>
        Task.FromResult(new CurrentUser(UserId, OrgId, role));
}

internal sealed class FakeServiceData : IServiceData
{
    public Task<(IReadOnlyList<ServiceDto> Items, int TotalCount)> ListAsync(
        Guid organizationId,
        ServiceQuery query,
        CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<ServiceDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<Service?> GetForUpdateAsync(Guid organizationId, Guid id, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<bool> TeamExistsAsync(Guid organizationId, Guid teamId, CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<bool> ServiceExistsAsync(Guid organizationId, Guid serviceId, CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<ServiceDto> CreateAsync(Service service, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<ServiceDto> UpdateAsync(Service service, long expectedVersion, CancellationToken cancellationToken) =>
        throw new NotSupportedException();
}

internal sealed class FakeIncidentData(FakeWriteSession session) : IIncidentData
{
    public Task<(IReadOnlyList<IncidentSummaryDto> Items, int TotalCount)> ListAsync(
        Guid organizationId,
        IncidentQuery query,
        CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<IncidentDetailDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken)
    {
        var incident = session.Incident;
        return Task.FromResult<IncidentDetailDto?>(
            new IncidentDetailDto(
                incident.Id,
                incident.Title,
                incident.Description,
                incident.ServiceId,
                "Svc",
                Guid.NewGuid(),
                "Team",
                incident.CreatedByUserId,
                incident.Severity,
                incident.Status,
                incident.CreatedAt,
                incident.UpdatedAt,
                incident.ResolvedAt,
                incident.Version.ToString(),
                incident.LifecycleVersion.ToString()));
    }

    public Task<IIncidentWriteSession> BeginCreateAsync(Guid organizationId, CancellationToken cancellationToken) =>
        Task.FromResult<IIncidentWriteSession>(session);

    public Task<IIncidentWriteSession> BeginMutationAsync(
        Guid organizationId,
        Guid incidentId,
        CancellationToken cancellationToken) =>
        Task.FromResult<IIncidentWriteSession>(session);
}

internal sealed class FakeWriteSession : IIncidentWriteSession
{
    private readonly SharedClock? _clock;
    private Incident? _incident;
    private long _sequence;

    public FakeWriteSession(SessionMode mode, Incident? incident = null, SharedClock? clock = null)
    {
        Mode = mode;
        _clock = clock;
        _incident = incident;
        if (incident is not null)
        {
            Version = incident.Version;
            LifecycleVersion = incident.LifecycleVersion;
            _sequence = incident.LastHistorySequence;
        }
        else
        {
            Version = 1;
            LifecycleVersion = 1;
        }
    }

    public SessionMode Mode { get; }

    public bool CommitCompleted { get; private set; }

    public int CommitSequence { get; private set; }

    public bool HasResponder { get; set; }

    public Incident Incident =>
        _incident ?? throw new InvalidOperationException("Incident not set.");

    public long Version { get; set; }

    public long LifecycleVersion { get; set; }

    public DateTimeOffset TimestampLowerBound => Now.AddDays(-1);

    public Task<bool> ServiceExistsAsync(Guid serviceId, CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<bool> ActorExistsAsync(Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<bool> HasResponderAsync(Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult(HasResponder);

    public void AddIncident(Incident incident) => _incident = incident;

    public void AddResponder(IncidentResponder membership) => HasResponder = true;

    public void RemoveResponder(Guid userId) => HasResponder = false;

    public IncidentTimelineEntry? LastEntry { get; private set; }

    /// Every entry appended during the session, so a test can assert how many
    /// were written and of which kind, not merely inspect the final one.
    public List<IncidentTimelineEntry> Entries { get; } = [];

    public void AppendHistory(IncidentTimelineEntry entry)
    {
        LastEntry = entry;
        Entries.Add(entry);
    }

    public void AdvanceScalarRevision(bool lifecycleChanged)
    {
        Version += 1;
        if (lifecycleChanged)
        {
            LifecycleVersion += 1;
        }

        if (_incident is not null)
        {
            _incident.SetPersistenceCounters(Version, LifecycleVersion, _sequence);
        }
    }

    public long PeekNextHistorySequence() => _sequence + 1;

    public Task<IncidentTimelineEntry?> CommitAsync(CancellationToken cancellationToken)
    {
        CommitSequence = _clock?.Next() ?? 1;
        CommitCompleted = true;
        if (LastEntry is not null)
        {
            _sequence = LastEntry.Sequence;
            if (_incident is not null)
            {
                _incident.SetPersistenceCounters(Version, LifecycleVersion, _sequence);
            }
        }

        return Task.FromResult(LastEntry);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

internal sealed class FakeReadData(FakeWriteSession session) : IIncidentReadData
{
    public Task<(IReadOnlyList<ResponderDto> Items, Guid? NextAfter)> ListRespondersAsync(
        Guid organizationId,
        Guid incidentIdArg,
        int limit,
        Guid? after,
        CancellationToken cancellationToken) =>
        Task.FromResult<(IReadOnlyList<ResponderDto>, Guid?)>(([], null));

    public Task<(IReadOnlyList<TimelineEntryDto> Items, int TotalCount)> ListTimelineAsync(
        Guid organizationId,
        Guid incidentIdArg,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var last = session.LastEntry ?? throw new InvalidOperationException("No history.");
        var entry = new TimelineEntryDto(
            last.Id,
            last.Sequence.ToString(),
            last.OccurredAt,
            UserId,
            "Avery",
            last.Type,
            last.Type.ToString(),
            last.Body,
            null,
            null,
            null,
            null);
        return Task.FromResult<(IReadOnlyList<TimelineEntryDto>, int)>(([entry], 1));
    }
}

internal sealed class FakeLookups : ILookupData
{
    public Task<(IReadOnlyList<TeamDto> Items, Guid? NextAfter)> ListTeamsAsync(
        Guid organizationId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<(IReadOnlyList<LookupUserDto> Items, Guid? NextAfter)> ListUsersAsync(
        Guid organizationId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken) =>
        Task.FromResult<(IReadOnlyList<LookupUserDto>, Guid?)>(
            ([new LookupUserDto(UserId, "Veyo R", Guid.NewGuid())], null));

    public Task<OrganizationDto?> GetOrganizationAsync(Guid organizationId, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task<(Guid UserId, Guid OrganizationId, string DisplayName, UserRole Role)?> GetUserBootstrapAsync(
        Guid userId,
        CancellationToken cancellationToken) =>
        throw new NotSupportedException();
}

internal sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}
