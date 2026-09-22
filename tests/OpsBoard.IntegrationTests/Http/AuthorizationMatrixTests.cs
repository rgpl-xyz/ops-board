using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// Authorization is a server concern, so it is asserted over HTTP for every
/// delivered role rather than at the service boundary alone.
[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class AuthorizationMatrixTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) }
    };

    /// Seeded users, in declaration order: 1 IncidentManager, 2 Administrator,
    /// 3 Responder, 5 Viewer. The flags are may-respond and may-manage.
    public static TheoryData<string, int, bool, bool> Roles => new()
    {
        { "IncidentManager", 1, true, true },
        { "Administrator", 2, true, true },
        { "Responder", 3, true, false },
        { "Viewer", 5, false, false },
    };

    [Theory]
    [MemberData(nameof(Roles))]
    public async Task Every_role_may_read_and_is_gated_on_respond_and_manage(
        string expectedRole,
        int seedUserNumber,
        bool mayRespond,
        bool mayManage)
    {
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            SeedIds.D(3, seedUserNumber));
        await SeedAsync(factory);
        var client = factory.CreateClient();

        var me = await client.GetFromJsonAsync<JsonElement>("/api/current-user", JsonOptions);
        Assert.Equal(expectedRole, me.GetProperty("role").GetString());

        var list = await client.GetAsync("/api/incidents?status=Investigating");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);

        var incident = (await list.Content.ReadFromJsonAsync<JsonElement>(JsonOptions))
            .GetProperty("items")[0];
        var id = incident.GetProperty("id").GetGuid();

        var update = await client.PostAsJsonAsync(
            $"/api/incidents/{id}/updates",
            new
            {
                body = $"Authorization probe for {expectedRole}.",
                expectedLifecycleVersion = incident.GetProperty("lifecycleVersion").GetString()
            },
            JsonOptions);
        await AssertGateAsync(update, mayRespond);

        var severity = await client.PatchAsJsonAsync(
            $"/api/incidents/{id}/severity",
            new
            {
                severity = "Critical",
                expectedVersion = incident.GetProperty("version").GetString()
            },
            JsonOptions);
        await AssertGateAsync(severity, mayManage);
    }

    [Theory]
    [MemberData(nameof(Roles))]
    public async Task Service_writes_are_gated_on_manage(
        string expectedRole,
        int seedUserNumber,
        bool mayRespond,
        bool mayManage)
    {
        _ = mayRespond;
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            SeedIds.D(3, seedUserNumber));
        await SeedAsync(factory);
        var client = factory.CreateClient();

        var teams = await client.GetFromJsonAsync<JsonElement>("/api/lookups/teams", JsonOptions);
        var created = await client.PostAsJsonAsync(
            "/api/services",
            new
            {
                name = $"Authorization probe {expectedRole} {Guid.NewGuid():N}",
                description = "Created by the authorization matrix.",
                teamId = teams.GetProperty("items")[0].GetProperty("id").GetGuid()
            },
            JsonOptions);

        await AssertGateAsync(created, mayManage);
    }

    /// A caller must not be able to claim authority in the request itself.
    [Fact]
    public async Task Role_comes_from_the_server_not_from_the_request()
    {
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            SeedIds.D(3, 5));
        await SeedAsync(factory);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-OpsBoard-Role", "Administrator");
        client.DefaultRequestHeaders.Add("X-Role", "Administrator");

        var me = await client.GetFromJsonAsync<JsonElement>("/api/current-user", JsonOptions);
        Assert.Equal("Viewer", me.GetProperty("role").GetString());

        var list = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?status=Investigating",
            JsonOptions);
        var incident = list.GetProperty("items")[0];

        var severity = await client.PatchAsJsonAsync(
            $"/api/incidents/{incident.GetProperty("id").GetGuid()}/severity",
            new
            {
                severity = "Critical",
                expectedVersion = incident.GetProperty("version").GetString(),
                role = "Administrator"
            },
            JsonOptions);

        await AssertGateAsync(severity, allowed: false);
    }

    /// Another organization's records must be invisible, and invisible in the same
    /// way a record that does not exist is: the response may not disclose which.
    [Fact]
    public async Task Another_organizations_incident_is_indistinguishable_from_a_missing_one()
    {
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(factory);
        var foreign = await ArrangeForeignOrganizationAsync(factory);
        var client = factory.CreateClient();

        var all = await client.GetFromJsonAsync<JsonElement>("/api/incidents?pageSize=100", JsonOptions);
        var visibleIds = all.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToList();
        Assert.DoesNotContain(foreign.IncidentId, visibleIds);
        Assert.Equal(visibleIds.Count, all.GetProperty("totalCount").GetInt32());

        var foreignRead = await client.GetAsync($"/api/incidents/{foreign.IncidentId}");
        var missingRead = await client.GetAsync($"/api/incidents/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, foreignRead.StatusCode);
        Assert.Equal(missingRead.StatusCode, foreignRead.StatusCode);
        Assert.Equal(
            await ProblemCodeAsync(missingRead),
            await ProblemCodeAsync(foreignRead));

        var foreignWrite = await client.PatchAsJsonAsync(
            $"/api/incidents/{foreign.IncidentId}/severity",
            new { severity = "Critical", expectedVersion = "1" },
            JsonOptions);
        Assert.Equal(HttpStatusCode.NotFound, foreignWrite.StatusCode);

        var foreignResponders = await client.GetAsync($"/api/incidents/{foreign.IncidentId}/responders");
        var foreignTimeline = await client.GetAsync($"/api/incidents/{foreign.IncidentId}/timeline");
        Assert.Equal(HttpStatusCode.NotFound, foreignResponders.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, foreignTimeline.StatusCode);

        var foreignService = await client.GetAsync($"/api/services/{foreign.ServiceId}");
        Assert.Equal(HttpStatusCode.NotFound, foreignService.StatusCode);
    }

    [Fact]
    public async Task A_user_of_another_organization_sees_only_its_own_incidents()
    {
        await using var acmeFactory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(acmeFactory);
        var foreign = await ArrangeForeignOrganizationAsync(acmeFactory);

        var acmeIncidents = await acmeFactory.CreateClient()
            .GetFromJsonAsync<JsonElement>("/api/incidents?pageSize=100", JsonOptions);
        var anAcmeIncident = acmeIncidents.GetProperty("items")[0].GetProperty("id").GetGuid();

        await using var foreignFactory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            foreign.UserId);
        var foreignClient = foreignFactory.CreateClient();

        var visible = await foreignClient.GetFromJsonAsync<JsonElement>(
            "/api/incidents?pageSize=100",
            JsonOptions);
        var visibleIds = visible.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToList();

        Assert.Contains(foreign.IncidentId, visibleIds);
        Assert.DoesNotContain(anAcmeIncident, visibleIds);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await foreignClient.GetAsync($"/api/incidents/{anAcmeIncident}")).StatusCode);
    }

    [Fact]
    public async Task An_unknown_identity_is_refused_before_any_data_is_read()
    {
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            Guid.NewGuid());
        await SeedAsync(factory);
        var client = factory.CreateClient();

        var me = await client.GetAsync("/api/current-user");
        var list = await client.GetAsync("/api/incidents");

        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
        Assert.Equal("identity_unavailable", await ProblemCodeAsync(me));
        Assert.Equal(HttpStatusCode.Unauthorized, list.StatusCode);
    }

    private async Task<ForeignOrganization> ArrangeForeignOrganizationAsync(
        OpsBoardWebApplicationFactory factory)
    {
        var organizationId = Guid.NewGuid();
        var teamId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var serviceId = Guid.NewGuid();
        var incidentId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<OpsBoardDbContext>();
        db.AddRange(
            Organization.Create(organizationId, $"Globex {organizationId:N}"),
            Team.Create(teamId, organizationId, "Globex Platform"),
            User.Create(userId, organizationId, teamId, "Globex Manager", UserRole.IncidentManager),
            Service.Create(serviceId, organizationId, teamId, "Globex Billing", "Foreign service", now),
            Incident.Create(
                incidentId,
                organizationId,
                serviceId,
                userId,
                "Globex billing outage",
                "Belongs to another organization.",
                IncidentSeverity.High,
                now));
        await db.SaveChangesAsync();

        return new ForeignOrganization(organizationId, userId, serviceId, incidentId);
    }

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        return problem.GetProperty("code").GetString();
    }

    private sealed record ForeignOrganization(
        Guid OrganizationId,
        Guid UserId,
        Guid ServiceId,
        Guid IncidentId);

    private static async Task AssertGateAsync(HttpResponseMessage response, bool allowed)
    {
        if (allowed)
        {
            Assert.True(
                response.IsSuccessStatusCode,
                $"Expected the operation to be permitted but it returned {(int)response.StatusCode}.");
            return;
        }

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal("forbidden", problem.GetProperty("code").GetString());
    }

    private static async Task SeedAsync(OpsBoardWebApplicationFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
    }
}
