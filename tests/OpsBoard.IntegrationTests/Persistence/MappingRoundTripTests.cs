using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

[Collection("Postgres")]
[Trait("Category", "Persistence")]
public sealed class MappingRoundTripTests(PostgresFixture fixture)
{
    [Fact]
    public async Task Postmortem_action_items_round_trip_ordered()
    {
        await using var db = fixture.CreateContext();
        var org = Organization.Create(Guid.NewGuid(), "Org");
        var team = Team.Create(Guid.NewGuid(), org.Id, "Team");
        var user = User.Create(Guid.NewGuid(), org.Id, team.Id, "User", UserRole.IncidentManager);
        var service = Service.Create(Guid.NewGuid(), org.Id, team.Id, "Svc", "desc", DateTimeOffset.UtcNow);
        var incident = Incident.Create(
            Guid.NewGuid(), org.Id, service.Id, user.Id, "t", "d", IncidentSeverity.Low, DateTimeOffset.UtcNow);
        incident.SetPersistenceCounters(1, 1, 1);
        var pm = Postmortem.Create(
            Guid.NewGuid(),
            org.Id,
            incident.Id,
            "s",
            "i",
            "r",
            "res",
            ["first", "second"]);

        db.AddRange(org, team, user, service, incident, pm);
        await db.SaveChangesAsync();

        await using var read = fixture.CreateContext();
        var loaded = await read.Postmortems.FindAsync(pm.Id);
        Assert.NotNull(loaded);
        Assert.Equal(["first", "second"], loaded!.ActionItems);
    }
}
