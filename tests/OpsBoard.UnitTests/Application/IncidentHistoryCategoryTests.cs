using OpsBoard.Application.Errors;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

/// Each lifecycle operation must write its own history entry and nothing else.
/// A second, overlapping entry would misreport the incident timeline.
public sealed class IncidentHistoryCategoryTests
{
    [Fact]
    public async Task ResolveAsync_appends_a_resolved_entry_and_no_status_change()
    {
        var session = ActiveSession();
        var sut = IncidentServiceHarness.CreateIncidentService(
            new FakeIncidentData(session),
            new RecordingPublisher());

        await sut.ResolveAsync(
            session.Incident.Id,
            new VersionRequest("1"),
            CancellationToken.None);

        var entry = Assert.Single(session.Entries);
        Assert.Equal(TimelineEntryType.Resolved, entry.Type);
        Assert.DoesNotContain(session.Entries, e => e.Type == TimelineEntryType.StatusChanged);
    }

    [Fact]
    public async Task ReopenAsync_appends_a_reopened_entry_and_no_status_change()
    {
        var session = ResolvedSession();
        var sut = IncidentServiceHarness.CreateIncidentService(
            new FakeIncidentData(session),
            new RecordingPublisher());

        await sut.ReopenAsync(
            session.Incident.Id,
            new VersionRequest("1"),
            CancellationToken.None);

        var entry = Assert.Single(session.Entries);
        Assert.Equal(TimelineEntryType.Reopened, entry.Type);
        Assert.DoesNotContain(session.Entries, e => e.Type == TimelineEntryType.StatusChanged);
    }

    [Fact]
    public async Task ChangeActiveStatusAsync_appends_exactly_one_status_change()
    {
        var session = ActiveSession();
        var sut = IncidentServiceHarness.CreateIncidentService(
            new FakeIncidentData(session),
            new RecordingPublisher());

        await sut.ChangeActiveStatusAsync(
            session.Incident.Id,
            new StatusRequest(IncidentStatus.Identified, "1"),
            CancellationToken.None);

        var entry = Assert.Single(session.Entries);
        Assert.Equal(TimelineEntryType.StatusChanged, entry.Type);
    }

    [Fact]
    public async Task ChangeSeverityAsync_to_the_same_value_appends_nothing()
    {
        var session = ActiveSession();
        var sut = IncidentServiceHarness.CreateIncidentService(
            new FakeIncidentData(session),
            new RecordingPublisher());

        await sut.ChangeSeverityAsync(
            session.Incident.Id,
            new SeverityRequest(IncidentSeverity.High, "1"),
            CancellationToken.None);

        Assert.Empty(session.Entries);
    }

    [Fact]
    public async Task AddUpdateAsync_appends_only_a_written_update_entry()
    {
        var session = ActiveSession();
        var data = new FakeIncidentData(session);
        var sut = IncidentServiceHarness.CreateResponseService(
            data,
            new FakeReadData(session),
            new FakeLookups(),
            new RecordingPublisher());

        await sut.AddUpdateAsync(
            session.Incident.Id,
            new WrittenUpdateRequest("Still investigating the outage.", "1"),
            CancellationToken.None);

        var entry = Assert.Single(session.Entries);
        Assert.Equal(TimelineEntryType.WrittenUpdate, entry.Type);
    }

    [Fact]
    public async Task ResolveAsync_refused_for_a_viewer_appends_nothing()
    {
        var session = ActiveSession();
        var sut = IncidentServiceHarness.CreateIncidentService(
            new FakeIncidentData(session),
            new RecordingPublisher(),
            UserRole.Viewer);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            sut.ResolveAsync(session.Incident.Id, new VersionRequest("1"), CancellationToken.None));

        Assert.Empty(session.Entries);
        Assert.False(session.CommitCompleted);
    }

    [Fact]
    public async Task AddUpdateAsync_refused_for_a_viewer_appends_nothing()
    {
        var session = ActiveSession();
        var sut = IncidentServiceHarness.CreateResponseService(
            new FakeIncidentData(session),
            new FakeReadData(session),
            new FakeLookups(),
            new RecordingPublisher(),
            UserRole.Viewer);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            sut.AddUpdateAsync(
                session.Incident.Id,
                new WrittenUpdateRequest("Blocked update.", "1"),
                CancellationToken.None));

        Assert.Empty(session.Entries);
        Assert.False(session.CommitCompleted);
    }

    private static FakeWriteSession ActiveSession() =>
        new(SessionMode.Mutation, Incident(IncidentStatus.Investigating, resolvedAt: null));

    private static FakeWriteSession ResolvedSession() =>
        new(SessionMode.Mutation, Incident(IncidentStatus.Resolved, IncidentServiceHarness.Now));

    private static Incident Incident(IncidentStatus status, DateTimeOffset? resolvedAt) =>
        OpsBoard.Domain.Entities.Incident.Reconstitute(
            Guid.NewGuid(),
            IncidentServiceHarness.OrgId,
            IncidentServiceHarness.ServiceId,
            IncidentServiceHarness.UserId,
            "Title",
            "Description body",
            IncidentSeverity.High,
            status,
            IncidentServiceHarness.Now,
            IncidentServiceHarness.Now,
            resolvedAt,
            version: 1,
            lifecycleVersion: 1,
            lastHistorySequence: 0);
}
