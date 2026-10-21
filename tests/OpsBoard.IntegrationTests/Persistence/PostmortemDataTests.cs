using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Incidents;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

[Collection("Postgres")]
[Trait("Category", "Persistence")]
public sealed class PostmortemDataTests(PostgresFixture fixture)
{
    [Fact]
    public async Task An_incident_postmortem_is_read_only_within_its_organization()
    {
        var at = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);
        var organization = Organization.Create(Guid.NewGuid(), "Postmortem organization");
        var team = Team.Create(Guid.NewGuid(), organization.Id, "Postmortem team");
        var actor = User.Create(Guid.NewGuid(), organization.Id, team.Id, "Postmortem actor", UserRole.IncidentManager);
        var service = Service.Create(Guid.NewGuid(), organization.Id, team.Id, "Postmortem service", "desc", at);
        var written = Incident.Create(Guid.NewGuid(), organization.Id, service.Id, actor.Id, "With a postmortem", "desc", IncidentSeverity.High, at);
        var bare = Incident.Create(Guid.NewGuid(), organization.Id, service.Id, actor.Id, "Without one", "desc", IncidentSeverity.Low, at);
        var postmortem = Postmortem.Create(
            Guid.NewGuid(),
            organization.Id,
            written.Id,
            "A pricing rule broke checkout.",
            "Checkout failed for 40 minutes.",
            "The rule shipped without a canary.",
            "Rolled back the rule.",
            ["Add a canary stage.", "Alert on checkout errors."]);
        await using (var db = fixture.CreateContext())
        {
            db.AddRange(organization, team, actor, service, written, bare, postmortem);
            await db.SaveChangesAsync();
        }

        await using var context = fixture.CreateContext();
        var data = new PostmortemData(context);
        var found = await data.GetAsync(organization.Id, written.Id, CancellationToken.None);
        var none = await data.GetAsync(organization.Id, bare.Id, CancellationToken.None);
        var elsewhere = await data.GetAsync(Guid.NewGuid(), written.Id, CancellationToken.None);

        Assert.NotNull(found);
        Assert.Equal("A pricing rule broke checkout.", found.Summary);
        Assert.Equal("Checkout failed for 40 minutes.", found.Impact);
        Assert.Equal("The rule shipped without a canary.", found.RootCause);
        Assert.Equal("Rolled back the rule.", found.Resolution);
        Assert.Equal(["Add a canary stage.", "Alert on checkout errors."], found.ActionItems);
        Assert.Null(none);
        Assert.Null(elsewhere);
    }
}
