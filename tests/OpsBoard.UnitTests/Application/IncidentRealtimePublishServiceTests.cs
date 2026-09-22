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
    private static readonly Guid OrgId = IncidentServiceHarness.OrgId;
    private static readonly Guid UserId = IncidentServiceHarness.UserId;
    private static readonly Guid ServiceId = IncidentServiceHarness.ServiceId;
    private static readonly DateTimeOffset Now = IncidentServiceHarness.Now;

    [Fact]
    public async Task CreateAsync_publishes_IncidentCreated_after_commit()
    {
        var clock = new SharedClock();
        var publisher = new RecordingPublisher(clock);
        var session = new FakeWriteSession(mode: SessionMode.Create, clock: clock);
        var data = new FakeIncidentData(session);
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

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
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

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
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

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
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

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
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

        await sut.ReopenAsync(incident.Id, new VersionRequest("2"), CancellationToken.None);

        Assert.Equal(IncidentRealtimeFactKind.IncidentReopened, Assert.Single(publisher.Facts).Kind);
    }

    [Fact]
    public async Task CreateAsync_succeeds_when_publisher_throws()
    {
        var publisher = new ThrowingPublisher();
        var session = new FakeWriteSession(mode: SessionMode.Create);
        var data = new FakeIncidentData(session);
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

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
        var sut = IncidentServiceHarness.CreateResponseService(data, read, lookups, publisher);

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
        var sut = IncidentServiceHarness.CreateResponseService(data, read, new FakeLookups(), publisher);

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
        var sut = IncidentServiceHarness.CreateIncidentService(data, publisher);

        await Assert.ThrowsAnyAsync<Exception>(() =>
            sut.CreateAsync(
                new CreateIncidentRequest("", "Description body", ServiceId, IncidentSeverity.High),
                CancellationToken.None));

        Assert.False(session.CommitCompleted);
        Assert.Empty(publisher.Facts);
    }
}
