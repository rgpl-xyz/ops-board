using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// The list and mutation contracts promise specific behaviour at their edges.
/// This class owns what a client observes; atomicity and races are asserted
/// elsewhere, against the database.
[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class QueryEdgeTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) }
    };

    public static TheoryData<string> RejectedQueries => new()
    {
        "/api/incidents?sort=title",
        "/api/incidents?sort=createdAt&direction=sideways",
        "/api/incidents?severity=Catastrophic",
        "/api/incidents?status=Pondering",
        "/api/incidents?pageSize=0",
        "/api/incidents?pageSize=101",
        "/api/incidents?page=0",
    };

    [Theory]
    [MemberData(nameof(RejectedQueries))]
    public async Task Invalid_query_values_are_rejected_as_validation_failures(string url)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", await ProblemCodeAsync(response));
    }

    [Theory]
    [InlineData("/api/incidents?pageSize=1")]
    [InlineData("/api/incidents?pageSize=100")]
    [InlineData("/api/incidents?sort=severity&direction=asc")]
    [InlineData("/api/incidents?sort=status&direction=desc")]
    public async Task Accepted_query_bounds_succeed(string url)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_page_offset_beyond_the_supported_range_is_rejected()
    {
        var client = await ClientAsync();

        var response = await client.GetAsync($"/api/incidents?page={int.MaxValue}&pageSize=100");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation_failed", await ProblemCodeAsync(response));
    }

    [Fact]
    public async Task An_out_of_range_page_returns_an_empty_envelope_rather_than_a_missing_resource()
    {
        var client = await ClientAsync();

        var page = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?page=999&pageSize=25",
            JsonOptions);

        Assert.Empty(page.GetProperty("items").EnumerateArray());
        Assert.True(page.GetProperty("totalCount").GetInt32() > 0);
        Assert.Equal(999, page.GetProperty("page").GetInt32());
    }

    [Fact]
    public async Task A_search_with_no_matches_returns_an_empty_envelope()
    {
        var client = await ClientAsync();

        var page = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?search=zzzznomatchzzzz",
            JsonOptions);

        Assert.Empty(page.GetProperty("items").EnumerateArray());
        Assert.Equal(0, page.GetProperty("totalCount").GetInt32());
    }

    /// A wildcard must be matched literally, not expanded into "everything".
    [Theory]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("%%")]
    public async Task Wildcard_characters_in_search_are_treated_as_literals(string search)
    {
        var client = await ClientAsync();
        var all = await client.GetFromJsonAsync<JsonElement>("/api/incidents", JsonOptions);
        var total = all.GetProperty("totalCount").GetInt32();

        var searched = await client.GetFromJsonAsync<JsonElement>(
            $"/api/incidents?search={Uri.EscapeDataString(search)}",
            JsonOptions);

        Assert.True(total > 0, "The seed must contain incidents for this to mean anything.");
        Assert.True(
            searched.GetProperty("totalCount").GetInt32() < total,
            "A literal wildcard search must not match every incident.");
    }

    [Fact]
    public async Task An_empty_search_is_ignored_rather_than_matching_nothing()
    {
        var client = await ClientAsync();

        var unfiltered = await client.GetFromJsonAsync<JsonElement>("/api/incidents", JsonOptions);
        var emptySearch = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?search=",
            JsonOptions);
        var whitespaceSearch = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?search=%20%20",
            JsonOptions);

        var total = unfiltered.GetProperty("totalCount").GetInt32();
        Assert.Equal(total, emptySearch.GetProperty("totalCount").GetInt32());
        Assert.Equal(total, whitespaceSearch.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Equal_sort_values_are_broken_by_id_so_pages_do_not_overlap()
    {
        var client = await ClientAsync();

        var first = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?sort=severity&direction=asc&page=1&pageSize=10",
            JsonOptions);
        var second = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?sort=severity&direction=asc&page=2&pageSize=10",
            JsonOptions);
        var firstAgain = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?sort=severity&direction=asc&page=1&pageSize=10",
            JsonOptions);

        var firstIds = Ids(first);
        var secondIds = Ids(second);

        Assert.Equal(firstIds, Ids(firstAgain));
        Assert.Empty(firstIds.Intersect(secondIds));

        foreach (var group in first.GetProperty("items").EnumerateArray()
            .GroupBy(item => item.GetProperty("severity").GetString()))
        {
            var ids = group.Select(item => item.GetProperty("id").GetGuid()).ToList();
            Assert.Equal(ids.OrderBy(id => id).ToList(), ids);
        }
    }

    [Fact]
    public async Task A_stale_expected_version_conflicts_and_writes_no_history()
    {
        var client = await ClientAsync();
        var incident = await ActiveIncidentAsync(client);
        var id = incident.GetProperty("id").GetGuid();

        var before = await TimelineCountAsync(client, id);
        var accepted = await client.PatchAsJsonAsync(
            $"/api/incidents/{id}/severity",
            new { severity = "Low", expectedVersion = incident.GetProperty("version").GetString() },
            JsonOptions);
        accepted.EnsureSuccessStatusCode();
        var afterAccepted = await TimelineCountAsync(client, id);

        var stale = await client.PatchAsJsonAsync(
            $"/api/incidents/{id}/severity",
            new { severity = "Critical", expectedVersion = incident.GetProperty("version").GetString() },
            JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("concurrency_conflict", await ProblemCodeAsync(stale));
        Assert.Equal(before + 1, afterAccepted);
        Assert.Equal(afterAccepted, await TimelineCountAsync(client, id));
    }

    [Fact]
    public async Task Reopening_an_active_incident_is_a_lifecycle_conflict()
    {
        var client = await ClientAsync();
        var incident = await ActiveIncidentAsync(client);
        var id = incident.GetProperty("id").GetGuid();

        var before = await TimelineCountAsync(client, id);
        var response = await client.PostAsJsonAsync(
            $"/api/incidents/{id}/reopen",
            new { expectedVersion = incident.GetProperty("version").GetString() },
            JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("lifecycle_conflict", await ProblemCodeAsync(response));
        Assert.Equal(before, await TimelineCountAsync(client, id));
    }

    [Theory]
    [InlineData(0, HttpStatusCode.BadRequest)]
    [InlineData(101, HttpStatusCode.BadRequest)]
    [InlineData(1, HttpStatusCode.OK)]
    [InlineData(100, HttpStatusCode.OK)]
    public async Task Continuation_limits_are_bounded(int limit, HttpStatusCode expected)
    {
        var client = await ClientAsync();
        var incident = await ActiveIncidentAsync(client);

        var response = await client.GetAsync(
            $"/api/incidents/{incident.GetProperty("id").GetGuid()}/responders?limit={limit}");

        Assert.Equal(expected, response.StatusCode);
    }

    private static List<Guid> Ids(JsonElement page) =>
        page.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToList();

    private static async Task<JsonElement> ActiveIncidentAsync(HttpClient client)
    {
        var list = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?status=Investigating",
            JsonOptions);
        return list.GetProperty("items")[0];
    }

    private static async Task<int> TimelineCountAsync(HttpClient client, Guid id)
    {
        var timeline = await client.GetFromJsonAsync<JsonElement>(
            $"/api/incidents/{id}/timeline",
            JsonOptions);
        return timeline.GetProperty("totalCount").GetInt32();
    }

    private static async Task<string?> ProblemCodeAsync(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        return problem.GetProperty("code").GetString();
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
