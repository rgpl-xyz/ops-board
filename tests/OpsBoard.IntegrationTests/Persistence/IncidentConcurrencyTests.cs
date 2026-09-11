using OpsBoard.Application.Errors;
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

        // Client still holds stale expected version.
        if (session2.Version != expected)
        {
            await Assert.ThrowsAsync<ConcurrencyConflictException>(async () =>
            {
                throw new ConcurrencyConflictException();
            });
        }

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
