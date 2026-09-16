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

namespace OpsBoard.UnitTests.Application;

public sealed class IncidentRealtimePublishServiceTests
{
    private static readonly Guid OrgId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ServiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-16T12:00:00Z");

    [Fact]
    public async Task CreateAsync_publishes_IncidentCreated_after_commit()
    {
        var clock = new SharedClock();
        var publisher = new RecordingPublisher(clock);
        var session = new FakeWriteSession(mode: SessionMode.Create, clock: clock);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        var detail = await sut.CreateAsync(
            new CreateIncidentRequest("Title", "Description body", ServiceId, IncidentSeverity.High),
            CancellationToken.None);

        Assert.True(session.CommitCompleted);
        var fact = Assert.Single(publisher.Facts);
        Assert.Equal(IncidentRealtimeFactKind.IncidentCreated, fact.Kind);
        Assert.Equal(detail.Id, fact.IncidentId);
        Assert.Equal(OrgId, fact.OrganizationId);
        Assert.True(session.CommitSequence < publisher.PublishSequences[0]);
    }

    [Fact]
    public async Task ChangeSeverityAsync_no_op_does_not_publish()
    {
        var publisher = new RecordingPublisher();
        var incident = Incident.Reconstitute(
            Guid.NewGuid(),
            OrgId,
            ServiceId,
            UserId,
            "Title",
            "Description body",
            IncidentSeverity.High,
            IncidentStatus.Investigating,
            Now,
            Now,
            null,
            version: 1,
            lifecycleVersion: 1,
            lastHistorySequence: 0);
        var session = new FakeWriteSession(mode: SessionMode.Mutation, incident);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        await sut.ChangeSeverityAsync(
            incident.Id,
            new SeverityRequest(IncidentSeverity.High, "1"),
            CancellationToken.None);

        Assert.True(session.CommitCompleted);
        Assert.Empty(publisher.Facts);
    }

    [Fact]
    public async Task ChangeSeverityAsync_publishes_when_changed()
    {
        var publisher = new RecordingPublisher();
        var incident = Incident.Reconstitute(
            Guid.NewGuid(),
            OrgId,
            ServiceId,
            UserId,
            "Title",
            "Description body",
            IncidentSeverity.High,
            IncidentStatus.Investigating,
            Now,
            Now,
            null,
            1,
            1,
            0);
        var session = new FakeWriteSession(mode: SessionMode.Mutation, incident);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        await sut.ChangeSeverityAsync(
            incident.Id,
            new SeverityRequest(IncidentSeverity.Critical, "1"),
            CancellationToken.None);

        var fact = Assert.Single(publisher.Facts);
        Assert.Equal(IncidentRealtimeFactKind.IncidentSeverityChanged, fact.Kind);
    }

    [Theory]
    [InlineData(nameof(IncidentService.UpdateDetailsAsync), IncidentRealtimeFactKind.IncidentDetailsChanged)]
    [InlineData(nameof(IncidentService.ChangeActiveStatusAsync), IncidentRealtimeFactKind.IncidentStatusChanged)]
    [InlineData(nameof(IncidentService.ResolveAsync), IncidentRealtimeFactKind.IncidentResolved)]
    public async Task Scalar_mutations_publish_expected_kind(string method, IncidentRealtimeFactKind kind)
    {
        var publisher = new RecordingPublisher();
        var status = method == nameof(IncidentService.ResolveAsync)
            ? IncidentStatus.Investigating
            : IncidentStatus.Investigating;
        var incident = Incident.Reconstitute(
            Guid.NewGuid(),
            OrgId,
            ServiceId,
            UserId,
            "Title",
            "Description body",
            IncidentSeverity.Medium,
            status,
            Now,
            Now,
            null,
            1,
            1,
            0);
        var session = new FakeWriteSession(mode: SessionMode.Mutation, incident);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        switch (method)
        {
            case nameof(IncidentService.UpdateDetailsAsync):
                await sut.UpdateDetailsAsync(
                    incident.Id,
                    new UpdateIncidentRequest("New title", "New description body", ServiceId, "1"),
                    CancellationToken.None);
                break;
            case nameof(IncidentService.ChangeActiveStatusAsync):
                await sut.ChangeActiveStatusAsync(
                    incident.Id,
                    new StatusRequest(IncidentStatus.Identified, "1"),
                    CancellationToken.None);
                break;
            case nameof(IncidentService.ResolveAsync):
                await sut.ResolveAsync(incident.Id, new VersionRequest("1"), CancellationToken.None);
                break;
        }

        Assert.Equal(kind, Assert.Single(publisher.Facts).Kind);
    }

    [Fact]
    public async Task ReopenAsync_publishes_IncidentReopened()
    {
        var publisher = new RecordingPublisher();
        var incident = Incident.Reconstitute(
            Guid.NewGuid(),
            OrgId,
            ServiceId,
            UserId,
            "Title",
            "Description body",
            IncidentSeverity.Medium,
            IncidentStatus.Resolved,
            Now.AddHours(-2),
            Now.AddHours(-1),
            Now.AddHours(-1),
            2,
            2,
            1);
        var session = new FakeWriteSession(mode: SessionMode.Mutation, incident);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        await sut.ReopenAsync(incident.Id, new VersionRequest("2"), CancellationToken.None);

        Assert.Equal(IncidentRealtimeFactKind.IncidentReopened, Assert.Single(publisher.Facts).Kind);
    }

    [Fact]
    public async Task CreateAsync_succeeds_when_publisher_throws()
    {
        var publisher = new ThrowingPublisher();
        var session = new FakeWriteSession(mode: SessionMode.Create);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        var detail = await sut.CreateAsync(
            new CreateIncidentRequest("Title", "Description body", ServiceId, IncidentSeverity.Low),
            CancellationToken.None);

        Assert.NotEqual(Guid.Empty, detail.Id);
    }

    [Fact]
    public async Task JoinAsync_publishes_ResponderJoined_after_commit()
    {
        var clock = new SharedClock();
        var publisher = new RecordingPublisher(clock);
        var incident = Incident.Reconstitute(
            Guid.NewGuid(),
            OrgId,
            ServiceId,
            UserId,
            "Title",
            "Description body",
            IncidentSeverity.High,
            IncidentStatus.Investigating,
            Now,
            Now,
            null,
            1,
            1,
            0);
        var session = new FakeWriteSession(mode: SessionMode.Mutation, incident, clock);
        var data = new FakeIncidentData(session);
        var read = new FakeReadData(session);
        var lookups = new FakeLookups();
        var sut = CreateResponseService(data, read, lookups, publisher);

        await sut.JoinAsync(incident.Id, new LifecycleVersionRequest("1"), CancellationToken.None);

        Assert.True(session.CommitCompleted);
        var fact = Assert.Single(publisher.Facts);
        Assert.Equal(IncidentRealtimeFactKind.ResponderJoined, fact.Kind);
        Assert.True(session.CommitSequence < publisher.PublishSequences[0]);
    }

    [Fact]
    public async Task LeaveAsync_and_AddUpdateAsync_publish_expected_kinds()
    {
        var publisher = new RecordingPublisher();
        var incident = Incident.Reconstitute(
            Guid.NewGuid(),
            OrgId,
            ServiceId,
            UserId,
            "Title",
            "Description body",
            IncidentSeverity.High,
            IncidentStatus.Investigating,
            Now,
            Now,
            null,
            1,
            1,
            1);
        var session = new FakeWriteSession(mode: SessionMode.Mutation, incident)
        {
            HasResponder = true,
        };
        var data = new FakeIncidentData(session);
        var read = new FakeReadData(session);
        var sut = CreateResponseService(data, read, new FakeLookups(), publisher);

        await sut.LeaveAsync(incident.Id, new LifecycleVersionRequest("1"), CancellationToken.None);
        Assert.Equal(IncidentRealtimeFactKind.ResponderLeft, publisher.Facts[^1].Kind);

        session.HasResponder = false;
        session.LifecycleVersion = 2;
        session.Version = 1;
        await sut.AddUpdateAsync(
            incident.Id,
            new WrittenUpdateRequest("Still investigating the outage.", "2"),
            CancellationToken.None);
        Assert.Equal(IncidentRealtimeFactKind.WrittenUpdateAdded, publisher.Facts[^1].Kind);
    }

    [Fact]
    public async Task Validation_failure_before_commit_does_not_publish()
    {
        var publisher = new RecordingPublisher();
        var session = new FakeWriteSession(mode: SessionMode.Create);
        var data = new FakeIncidentData(session);
        var sut = CreateIncidentService(data, publisher);

        await Assert.ThrowsAnyAsync<Exception>(() =>
            sut.CreateAsync(
                new CreateIncidentRequest("", "Description body", ServiceId, IncidentSeverity.High),
                CancellationToken.None));

        Assert.False(session.CommitCompleted);
        Assert.Empty(publisher.Facts);
    }

    private static IncidentService CreateIncidentService(FakeIncidentData data, IIncidentRealtimePublisher publisher) =>
        new(
            new FakeCurrentUser(),
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

    private static IncidentResponseService CreateResponseService(
        FakeIncidentData data,
        FakeReadData read,
        FakeLookups lookups,
        IIncidentRealtimePublisher publisher) =>
        new(
            new FakeCurrentUser(),
            data,
            read,
            lookups,
            publisher,
            NullLogger<IncidentResponseService>.Instance,
            new LifecycleVersionRequestValidator(),
            new WrittenUpdateRequestValidator(),
            new FixedTimeProvider(Now));

    private enum SessionMode
    {
        Create,
        Mutation,
    }

    private sealed class SharedClock
    {
        private int _n;
        public int Next() => ++_n;
    }

    private sealed class RecordingPublisher(SharedClock? clock = null) : IIncidentRealtimePublisher
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

    private sealed class ThrowingPublisher : IIncidentRealtimePublisher
    {
        public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("notify failed");
    }

    private sealed class FakeCurrentUser : ICurrentUser
    {
        public Task<CurrentUser> GetAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new CurrentUser(UserId, OrgId, UserRole.IncidentManager));
    }

    private sealed class FakeServiceData : IServiceData
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

    private sealed class FakeIncidentData(FakeWriteSession session) : IIncidentData
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

    private sealed class FakeWriteSession : IIncidentWriteSession
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

        public void AppendHistory(IncidentTimelineEntry entry) => LastEntry = entry;

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

    private sealed class FakeReadData(FakeWriteSession session) : IIncidentReadData
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

    private sealed class FakeLookups : ILookupData
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

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
