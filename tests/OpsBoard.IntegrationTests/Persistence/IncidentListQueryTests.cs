using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Incidents;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

[Collection("Postgres")]
[Trait("Category", "Persistence")]
public sealed class IncidentListQueryTests(PostgresFixture fixture)
{
    [Fact]
    public async Task ListAsync_sorts_in_database_with_stable_id_tie_breaking_and_pagination()
    {
        var seed = await SeedAsync();
        await using var db = fixture.CreateContext();
        var data = new IncidentData(db);

        await AssertOrderAsync(data, seed.OrganizationId, new IncidentQuery(Sort: "createdAt", Direction: "asc"), [1, 2, 3, 4, 5, 6, 7, 8]);
        await AssertOrderAsync(data, seed.OrganizationId, new IncidentQuery(Sort: "createdAt", Direction: "desc"), [1, 2, 3, 4, 5, 6, 7, 8]);
        await AssertOrderAsync(data, seed.OrganizationId, new IncidentQuery(Sort: "severity", Direction: "desc"), [1, 3, 5, 6, 7, 8, 2, 4]);
        await AssertOrderAsync(data, seed.OrganizationId, new IncidentQuery(Sort: "severity", Direction: "asc"), [2, 4, 7, 8, 5, 6, 1, 3]);
        await AssertOrderAsync(data, seed.OrganizationId, new IncidentQuery(Sort: "status", Direction: "desc"), [1, 7, 4, 8, 3, 5, 2, 6]);
        await AssertOrderAsync(data, seed.OrganizationId, new IncidentQuery(Sort: "status", Direction: "asc"), [2, 6, 3, 5, 4, 8, 1, 7]);

        var page = await data.ListAsync(
            seed.OrganizationId,
            new IncidentQuery(Page: 2, PageSize: 3, Sort: "createdAt", Direction: "asc"),
            CancellationToken.None);
        Assert.Equal(8, page.TotalCount);
        Assert.Equal([4, 5, 6], page.Items.Select(x => x.Id).Select(IdNumber));

        var filtered = await data.ListAsync(
            seed.OrganizationId,
            new IncidentQuery(ServiceId: seed.ServiceId, TeamId: seed.TeamId, Severity: IncidentSeverity.Critical),
            CancellationToken.None);
        Assert.Equal([1, 3], filtered.Items.Select(x => x.Id).Select(IdNumber));
    }

    private static async Task AssertOrderAsync(IncidentData data, Guid organizationId, IncidentQuery query, int[] expected)
    {
        var result = await data.ListAsync(organizationId, query, CancellationToken.None);
        Assert.Equal(expected, result.Items.Select(x => x.Id).Select(IdNumber));
    }

    private async Task<Seed> SeedAsync()
    {
        var organizationId = Guid.NewGuid();
        var teamId = Guid.NewGuid();
        var serviceId = Guid.NewGuid();
        var actorId = Guid.NewGuid();
        var createdAt = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);
        var organization = Organization.Create(organizationId, "List query organization");
        var team = Team.Create(teamId, organizationId, "List query team");
        var actor = User.Create(actorId, organizationId, teamId, "List query actor", UserRole.IncidentManager);
        var service = Service.Create(serviceId, organizationId, teamId, "List query service", "desc", createdAt);
        var incidents = new[]
        {
            CreateIncident(1, IncidentSeverity.Critical, IncidentStatus.Investigating, organizationId, serviceId, actorId, createdAt),
            CreateIncident(2, IncidentSeverity.Low, IncidentStatus.Resolved, organizationId, serviceId, actorId, createdAt),
            CreateIncident(3, IncidentSeverity.Critical, IncidentStatus.Monitoring, organizationId, serviceId, actorId, createdAt),
            CreateIncident(4, IncidentSeverity.Low, IncidentStatus.Identified, organizationId, serviceId, actorId, createdAt),
            CreateIncident(5, IncidentSeverity.High, IncidentStatus.Monitoring, organizationId, serviceId, actorId, createdAt),
            CreateIncident(6, IncidentSeverity.High, IncidentStatus.Resolved, organizationId, serviceId, actorId, createdAt),
            CreateIncident(7, IncidentSeverity.Medium, IncidentStatus.Investigating, organizationId, serviceId, actorId, createdAt),
            CreateIncident(8, IncidentSeverity.Medium, IncidentStatus.Identified, organizationId, serviceId, actorId, createdAt)
        };

        var otherOrganization = Organization.Create(Guid.NewGuid(), "Other organization");
        var otherTeam = Team.Create(Guid.NewGuid(), otherOrganization.Id, "Other team");
        var otherActor = User.Create(Guid.NewGuid(), otherOrganization.Id, otherTeam.Id, "Other actor", UserRole.IncidentManager);
        var otherService = Service.Create(Guid.NewGuid(), otherOrganization.Id, otherTeam.Id, "Other service", "desc", createdAt);
        var otherIncident = CreateIncident(9, IncidentSeverity.Critical, IncidentStatus.Investigating, otherOrganization.Id, otherService.Id, otherActor.Id, createdAt);

        await using var db = fixture.CreateContext();
        db.AddRange(organization, team, actor, service, otherOrganization, otherTeam, otherActor, otherService, otherIncident);
        db.Incidents.AddRange(incidents);
        await db.SaveChangesAsync();
        return new Seed(organizationId, teamId, serviceId);
    }

    private static Incident CreateIncident(
        int number,
        IncidentSeverity severity,
        IncidentStatus status,
        Guid organizationId,
        Guid serviceId,
        Guid actorId,
        DateTimeOffset createdAt)
    {
        var incident = Incident.Create(Id(number), organizationId, serviceId, actorId, $"Incident {number}", "desc", severity, createdAt);
        var changedAt = createdAt.AddMinutes(1);
        if (status == IncidentStatus.Identified)
        {
            incident.ChangeActiveStatus(IncidentStatus.Identified, changedAt);
        }
        else if (status == IncidentStatus.Monitoring)
        {
            incident.ChangeActiveStatus(IncidentStatus.Identified, changedAt);
            incident.ChangeActiveStatus(IncidentStatus.Monitoring, changedAt.AddMinutes(1));
        }
        else if (status == IncidentStatus.Resolved)
        {
            incident.Resolve(changedAt);
        }

        return incident;
    }

    private static Guid Id(int number) => Guid.Parse($"00000000-0000-4000-8000-{number:x12}");

    private static int IdNumber(Guid id) => int.Parse(id.ToString("N")[^12..], System.Globalization.NumberStyles.HexNumber);

    private sealed record Seed(Guid OrganizationId, Guid TeamId, Guid ServiceId);
}
