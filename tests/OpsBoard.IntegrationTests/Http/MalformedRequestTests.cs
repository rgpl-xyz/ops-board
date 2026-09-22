using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// A value the client got wrong must come back as a client error. These cases
/// previously reached the unmapped catch-all and answered 500.
[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class MalformedRequestTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) }
    };

    [Theory]
    [InlineData("/api/incidents?severity=Catastrophic")]
    [InlineData("/api/incidents?status=Pondering")]
    [InlineData("/api/incidents?page=notanumber")]
    [InlineData("/api/incidents?serviceId=not-a-guid")]
    [InlineData("/api/incidents/not-a-guid")]
    public async Task An_unreadable_request_value_is_a_client_error(string url)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync(url);

        Assert.True(
            (int)response.StatusCode is >= 400 and < 500,
            $"Expected a client error but received {(int)response.StatusCode}.");
    }

    [Theory]
    [InlineData("/api/incidents?severity=Catastrophic")]
    [InlineData("/api/incidents?page=notanumber")]
    public async Task An_unreadable_query_value_reports_a_validation_failure(string url)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal("validation_failed", problem.GetProperty("code").GetString());
        // Problem bodies are currently served as application/json: WriteAsJsonAsync
        // replaces the problem+json content type set before it. Asserted as it is,
        // rather than changing a public media type from a test-hardening change.
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task An_unreadable_request_body_reports_a_validation_failure()
    {
        var client = await ClientAsync();

        var response = await client.PostAsync(
            "/api/incidents",
            new StringContent("{ this is not json", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal("validation_failed", problem.GetProperty("code").GetString());
    }

    private async Task<HttpClient> ClientAsync()
    {
        var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
        return factory.CreateClient();
    }
}
