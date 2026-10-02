using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// The health response names the commit the API was built from, so a
/// deployment can be checked against what was meant to ship.
[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class HealthTests(PostgresFixture fixture)
{
    [Fact]
    public async Task Health_reports_the_built_commit()
    {
        const string commit = "188b12b3f0c94a1e8d2b7c6a5f4e3d2c1b0a9f8e";
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString)
            .WithWebHostBuilder(builder => builder.UseSetting("Build:Commit", commit));

        var health = await HealthAsync(factory.CreateClient());

        Assert.Equal(commit, health.GetProperty("commit").GetString());
    }

    [Fact]
    public async Task Health_reports_dev_when_no_commit_was_built_in()
    {
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);

        var health = await HealthAsync(factory.CreateClient());

        Assert.Equal("dev", health.GetProperty("commit").GetString());
    }

    private static async Task<JsonElement> HealthAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
