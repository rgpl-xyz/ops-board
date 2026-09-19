using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Application.Identity;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class VerticalSliceTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) }
    };

    [Fact]
    public async Task Primary_demo_flow_persists()
    {
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(factory);

        var client = factory.CreateClient();
        var me = await client.GetFromJsonAsync<JsonElement>("/api/current-user", JsonOptions);
        Assert.Equal("IncidentManager", me.GetProperty("role").GetString());

        var teams = await client.GetFromJsonAsync<JsonElement>("/api/lookups/teams", JsonOptions);
        var teamId = teams.GetProperty("items")[0].GetProperty("id").GetGuid();

        var createService = await client.PostAsJsonAsync("/api/services", new
        {
            name = "Slice Service",
            description = "Created in vertical slice",
            teamId
        }, JsonOptions);
        createService.EnsureSuccessStatusCode();
        Assert.NotNull(createService.Headers.Location);
        var service = await createService.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var serviceId = service.GetProperty("id").GetGuid();

        var createIncident = await client.PostAsJsonAsync("/api/incidents", new
        {
            title = "Slice incident",
            description = "Flow coverage",
            serviceId,
            severity = "High"
        }, JsonOptions);
        createIncident.EnsureSuccessStatusCode();
        var incident = await createIncident.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var incidentId = incident.GetProperty("id").GetGuid();
        var version = incident.GetProperty("version").GetString();
        var lifecycle = incident.GetProperty("lifecycleVersion").GetString();

        var join = await client.PostAsJsonAsync($"/api/incidents/{incidentId}/responders/join", new
        {
            expectedLifecycleVersion = lifecycle
        }, JsonOptions);
        join.EnsureSuccessStatusCode();

        var update = await client.PostAsJsonAsync($"/api/incidents/{incidentId}/updates", new
        {
            body = "Investigating root cause",
            expectedLifecycleVersion = lifecycle
        }, JsonOptions);
        update.EnsureSuccessStatusCode();

        var severity = await client.PatchAsJsonAsync($"/api/incidents/{incidentId}/severity", new
        {
            severity = "Critical",
            expectedVersion = version
        }, JsonOptions);
        severity.EnsureSuccessStatusCode();
        incident = await severity.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        version = incident.GetProperty("version").GetString();

        var status = await client.PatchAsJsonAsync($"/api/incidents/{incidentId}/status", new
        {
            status = "Identified",
            expectedVersion = version
        }, JsonOptions);
        status.EnsureSuccessStatusCode();
        incident = await status.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        version = incident.GetProperty("version").GetString();

        var resolve = await client.PostAsJsonAsync($"/api/incidents/{incidentId}/resolve", new
        {
            expectedVersion = version
        }, JsonOptions);
        resolve.EnsureSuccessStatusCode();
        incident = await resolve.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        version = incident.GetProperty("version").GetString();
        Assert.Equal("Resolved", incident.GetProperty("status").GetString());

        var reopen = await client.PostAsJsonAsync($"/api/incidents/{incidentId}/reopen", new
        {
            expectedVersion = version
        }, JsonOptions);
        reopen.EnsureSuccessStatusCode();
        incident = await reopen.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        version = incident.GetProperty("version").GetString();
        Assert.Equal("Investigating", incident.GetProperty("status").GetString());

        var resolve2 = await client.PostAsJsonAsync($"/api/incidents/{incidentId}/resolve", new
        {
            expectedVersion = version
        }, JsonOptions);
        resolve2.EnsureSuccessStatusCode();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<OpsBoardDbContext>();
        var persisted = await db.Incidents.AsNoTracking().SingleAsync(x => x.Id == incidentId);
        Assert.Equal(IncidentStatus.Resolved, persisted.Status);
        Assert.NotNull(persisted.ResolvedAt);
    }

    [Theory]
    [InlineData("createdAt", "asc")]
    [InlineData("createdAt", "desc")]
    [InlineData("severity", "asc")]
    [InlineData("severity", "desc")]
    [InlineData("status", "asc")]
    [InlineData("status", "desc")]
    public async Task Incident_list_endpoint_returns_success_for_each_supported_sort(string sort, string direction)
    {
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(factory);

        var response = await factory.CreateClient().GetAsync(
            $"/api/incidents?page=1&pageSize=3&sort={sort}&direction={direction}");

        response.EnsureSuccessStatusCode();
        var page = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.True(page.GetProperty("totalCount").GetInt32() > 0);
        Assert.True(page.GetProperty("items").GetArrayLength() <= 3);
    }

    private static async Task SeedAsync(OpsBoardWebApplicationFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
    }
}
