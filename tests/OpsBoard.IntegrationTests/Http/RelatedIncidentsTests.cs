using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class RelatedIncidentsTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public async Task A_viewer_sees_what_a_seeded_incident_has_in_common_with_others()
    {
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString, SeedIds.D(3, 5));
        await SeedAsync(factory);
        var client = factory.CreateClient();
        var found = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?search=Card%20payments%20failing%20in%20the%20EU",
            JsonOptions);
        var id = found.GetProperty("items")[0].GetProperty("id").GetGuid();

        var response = await client.GetAsync($"/api/incidents/{id}/related");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var items = (await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions))
            .GetProperty("items").EnumerateArray().ToList();
        Assert.InRange(items.Count, 1, 5);
        var first = items[0];
        Assert.Equal("Card authorizations timing out at the payment provider", first.GetProperty("title").GetString());
        Assert.Equal("Payment Processor", first.GetProperty("serviceName").GetString());
        Assert.True(first.GetProperty("sameService").GetBoolean());
        Assert.Equal(
            ["Card", "payments"],
            first.GetProperty("sharedWords").EnumerateArray().Select(w => w.GetString()));
        Assert.DoesNotContain(items, item => item.GetProperty("id").GetGuid() == id);
    }

    private static async Task SeedAsync(OpsBoardWebApplicationFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
    }
}
