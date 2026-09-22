using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
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
