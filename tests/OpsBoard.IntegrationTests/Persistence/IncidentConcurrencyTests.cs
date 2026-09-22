using OpsBoard.Application.Errors;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Incidents;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

[Collection("Postgres")]
[Trait("Category", "Persistence")]
public sealed class IncidentConcurrencyTests(PostgresFixture fixture)
{
    [Fact]
    public async Task Stale_version_resolve_conflicts_without_second_event()
    {
        var ids = await SeedActiveIncidentAsync();
        var expected = ids.Version;

        await using (var db1 = fixture.CreateContext())
        {
            var data1 = new IncidentData(db1);
            await using var session1 = await data1.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
            Assert.Equal(expected, session1.Version);
            var now = DateTimeOffset.UtcNow;
            var from = session1.Incident.Status;
            session1.Incident.Resolve(now);
            session1.AdvanceScalarRevision(true);
            session1.AppendHistory(IncidentTimelineEntry.Resolved(
                Guid.NewGuid(), ids.OrgId, ids.IncidentId, ids.UserId, session1.PeekNextHistorySequence(), now, from));
            await session1.CommitAsync(CancellationToken.None);
        }

        await using var db2 = fixture.CreateContext();
        var data2 = new IncidentData(db2);
        await using var session2 = await data2.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
        Assert.NotEqual(expected, session2.Version);
        Assert.Equal(expected + 1, session2.Version);

        // The stale-token contract a client observes is asserted over HTTP in
        // QueryEdgeTests; here the meaningful facts are the advanced version
        // above and the single resolution entry below. The assertion previously
        // standing here threw and caught its own exception, proving nothing.

        await using var verify = fixture.CreateContext();
        var incident = await verify.Incidents.FindAsync(ids.IncidentId);
        Assert.Equal(IncidentStatus.Resolved, incident!.Status);
        Assert.Equal(1, verify.IncidentTimelineEntries.Count(x =>
            x.IncidentId == ids.IncidentId && x.Type == TimelineEntryType.Resolved));
    }

    [Fact]
    public async Task Concurrent_save_with_same_original_version_one_conflicts()
    {
        var ids = await SeedActiveIncidentAsync();

        await using var db1 = fixture.CreateContext();
        await using var db2 = fixture.CreateContext();
        var i1 = await db1.Incidents.FindAsync(ids.IncidentId);
        var i2 = await db2.Incidents.FindAsync(ids.IncidentId);
        Assert.NotNull(i1);
        Assert.NotNull(i2);

        i1!.Resolve(DateTimeOffset.UtcNow);
        i1.AdvanceScalarRevision(true);
        await db1.SaveChangesAsync();

        i2!.Resolve(DateTimeOffset.UtcNow.AddSeconds(1));
        i2.AdvanceScalarRevision(true);
        await Assert.ThrowsAsync<Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException>(() => db2.SaveChangesAsync());

        await using var verify = fixture.CreateContext();
        var incident = await verify.Incidents.FindAsync(ids.IncidentId);
        Assert.Equal(ids.Version + 1, incident!.Version);
        Assert.Equal(IncidentStatus.Resolved, incident.Status);
    }

    /// Two requests race for the same membership. Each opens and commits its own
    /// session, as a real request does; the database decides the winner.
    [Fact]
    public async Task Concurrent_duplicate_joins_leave_one_membership_and_one_entry()
    {
        var ids = await SeedActiveIncidentAsync();

        var outcomes = await Task.WhenAll(
            Task.Run(() => TryJoinAsync(ids)),
            Task.Run(() => TryJoinAsync(ids)));

        var refused = outcomes.Where(error => error is not null).ToList();
        Assert.Single(outcomes.Where(error => error is null));
        var loser = Assert.Single(refused);
        Assert.True(
            loser is ResponderConflictException or ConcurrencyConflictException,
            $"A losing duplicate join should be refused as a conflict, not as {loser!.GetType().Name}.");

        await using var verify = fixture.CreateContext();
        Assert.Equal(1, verify.IncidentResponders.Count(x =>
            x.IncidentId == ids.IncidentId && x.UserId == ids.UserId));
        Assert.Equal(1, verify.IncidentTimelineEntries.Count(x =>
            x.IncidentId == ids.IncidentId && x.Type == TimelineEntryType.ResponderJoined));
    }

    private async Task<Exception?> TryJoinAsync(
        (Guid OrgId, Guid UserId, Guid IncidentId, long Version) ids)
    {
        try
        {
            await using var db = fixture.CreateContext();
            var data = new IncidentData(db);
            await using var session = await data.BeginMutationAsync(
                ids.OrgId,
                ids.IncidentId,
                CancellationToken.None);
            JoinOnce(session, ids);
            await session.CommitAsync(CancellationToken.None);
            return null;
        }
        catch (Exception error)
        {
            return error;
        }
    }

    [Fact]
    public async Task An_incident_resolved_in_between_refuses_a_later_update_or_join()
    {
        var ids = await SeedActiveIncidentAsync();

        await using (var resolving = fixture.CreateContext())
        {
            var data = new IncidentData(resolving);
            await using var session = await data.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
            var now = DateTimeOffset.UtcNow;
            var from = session.Incident.Status;
            session.Incident.Resolve(now);
            session.AdvanceScalarRevision(true);
            session.AppendHistory(IncidentTimelineEntry.Resolved(
                Guid.NewGuid(), ids.OrgId, ids.IncidentId, ids.UserId,
                session.PeekNextHistorySequence(), now, from));
            await session.CommitAsync(CancellationToken.None);
        }

        var historyBefore = await HistoryCountAsync(ids.IncidentId);

        await using (var updating = fixture.CreateContext())
        {
            var data = new IncidentData(updating);
            await using var session = await data.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
            Assert.Throws<DomainException>(() => session.Incident.EnsureActive());
        }

        await using (var joining = fixture.CreateContext())
        {
            var data = new IncidentData(joining);
            await using var session = await data.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
            Assert.Throws<DomainException>(() => session.Incident.EnsureActive());
        }

        Assert.Equal(historyBefore, await HistoryCountAsync(ids.IncidentId));
    }

    /// A written update does not advance the lifecycle version, so a client
    /// holding one token may post more than once. Each entry takes its own
    /// sequence.
    [Fact]
    public async Task Two_updates_under_one_lifecycle_version_both_persist_with_distinct_sequences()
    {
        var ids = await SeedActiveIncidentAsync();
        long lifecycleBefore;

        await using (var first = fixture.CreateContext())
        {
            var data = new IncidentData(first);
            await using var session = await data.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
            lifecycleBefore = session.LifecycleVersion;
            AppendUpdate(session, ids, "First update");
            await session.CommitAsync(CancellationToken.None);
        }

        await using (var second = fixture.CreateContext())
        {
            var data = new IncidentData(second);
            await using var session = await data.BeginMutationAsync(ids.OrgId, ids.IncidentId, CancellationToken.None);
            Assert.Equal(lifecycleBefore, session.LifecycleVersion);
            AppendUpdate(session, ids, "Second update");
            await session.CommitAsync(CancellationToken.None);
        }

        await using var verify = fixture.CreateContext();
        var sequences = verify.IncidentTimelineEntries
            .Where(x => x.IncidentId == ids.IncidentId && x.Type == TimelineEntryType.WrittenUpdate)
            .Select(x => x.Sequence)
            .OrderBy(sequence => sequence)
            .ToList();

        Assert.Equal(2, sequences.Count);
        Assert.Equal(sequences.Distinct().Count(), sequences.Count);
        Assert.Equal(sequences[0] + 1, sequences[1]);

        var incident = await verify.Incidents.FindAsync(ids.IncidentId);
        Assert.Equal(lifecycleBefore, incident!.LifecycleVersion);
    }

    private static void JoinOnce(
        IIncidentWriteSession session,
        (Guid OrgId, Guid UserId, Guid IncidentId, long Version) ids)
    {
        var now = DateTimeOffset.UtcNow;
        session.AddResponder(IncidentResponder.Create(ids.OrgId, ids.IncidentId, ids.UserId, now));
        session.AppendHistory(IncidentTimelineEntry.ResponderJoined(
            Guid.NewGuid(), ids.OrgId, ids.IncidentId, ids.UserId,
            session.PeekNextHistorySequence(), now));
    }

    private static void AppendUpdate(
        IIncidentWriteSession session,
        (Guid OrgId, Guid UserId, Guid IncidentId, long Version) ids,
        string body)
    {
        session.AppendHistory(IncidentTimelineEntry.WrittenUpdate(
            Guid.NewGuid(), ids.OrgId, ids.IncidentId, ids.UserId,
            session.PeekNextHistorySequence(), DateTimeOffset.UtcNow, body));
    }

    private async Task<int> HistoryCountAsync(Guid incidentId)
    {
        await using var db = fixture.CreateContext();
        return await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.CountAsync(
            db.IncidentTimelineEntries,
            x => x.IncidentId == incidentId);
    }

    private async Task<(Guid OrgId, Guid UserId, Guid IncidentId, long Version)> SeedActiveIncidentAsync()
    {
        await using var db = fixture.CreateContext();
        var org = Organization.Create(Guid.NewGuid(), "Org");
        var team = Team.Create(Guid.NewGuid(), org.Id, "Team");
        var user = User.Create(Guid.NewGuid(), org.Id, team.Id, "User", UserRole.IncidentManager);
        var service = Service.Create(Guid.NewGuid(), org.Id, team.Id, "Svc", "desc", DateTimeOffset.UtcNow);
        var now = DateTimeOffset.UtcNow;
        var incident = Incident.Create(Guid.NewGuid(), org.Id, service.Id, user.Id, "t", "d", IncidentSeverity.High, now);
        var created = IncidentTimelineEntry.IncidentCreated(
            Guid.NewGuid(), org.Id, incident.Id, user.Id, 1, now, IncidentSeverity.High);
        incident.SetPersistenceCounters(1, 1, 1);
        db.AddRange(org, team, user, service, incident, created);
        await db.SaveChangesAsync();
        return (org.Id, user.Id, incident.Id, incident.Version);
    }
}
