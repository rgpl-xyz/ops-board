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
        "/api/services?sort=createdAt",
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

    // Enum filters are part of the contract by name only; the framework's own
    // binding would also accept a number such as severity=1.
    [Theory]
    [InlineData("/api/incidents?severity=1", "severity")]
    [InlineData("/api/incidents?status=0", "status")]
    [InlineData("/api/services?health=1", "health")]
    public async Task A_numeric_enum_value_is_rejected_naming_its_field(string url, string field)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal("validation_failed", problem.GetProperty("code").GetString());
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _), $"errors should name {field}");
    }

    [Theory]
    [InlineData("/api/incidents?severity=Critical")]
    [InlineData("/api/incidents?status=Investigating")]
    [InlineData("/api/services?health=Degraded")]
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

    /// The seed holds 27 incidents and continuation caps at 100, so a continuation
    /// past the cap needs data of its own. Paging must return every member once
    /// and then stop.
    [Fact]
    public async Task A_continuation_past_the_limit_returns_every_member_exactly_once()
    {
        const int memberCount = 120;
        const int pageLimit = 50;

        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(factory);
        var arranged = await ArrangeCrowdedIncidentAsync(factory, memberCount);

        await using var memberFactory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            arranged.MemberIds[0]);
        var client = memberFactory.CreateClient();

        var collected = new List<Guid>();
        Guid? after = null;
        var requests = 0;
        do
        {
            var url = after is null
                ? $"/api/incidents/{arranged.IncidentId}/responders?limit={pageLimit}"
                : $"/api/incidents/{arranged.IncidentId}/responders?limit={pageLimit}&after={after}";
            var page = await client.GetFromJsonAsync<JsonElement>(url, JsonOptions);

            var items = page.GetProperty("items").EnumerateArray()
                .Select(item => item.GetProperty("userId").GetGuid())
                .ToList();
            collected.AddRange(items);

            after = page.TryGetProperty("nextAfter", out var next) && next.ValueKind != JsonValueKind.Null
                ? next.GetGuid()
                : null;

            Assert.True(items.Count <= pageLimit, "A page returned more members than its limit.");
            requests++;
            Assert.True(requests <= 10, "The continuation did not terminate.");
        }
        while (after is not null);

        Assert.Equal(memberCount, collected.Count);
        Assert.Equal(memberCount, collected.Distinct().Count());
        Assert.Equal(
            arranged.MemberIds.OrderBy(id => id).ToList(),
            collected.OrderBy(id => id).ToList());
        Assert.True(requests >= 3, "120 members at 50 per page must take more than two requests.");
    }

    private static async Task<CrowdedIncident> ArrangeCrowdedIncidentAsync(
        OpsBoardWebApplicationFactory factory,
        int memberCount)
    {
        var organizationId = Guid.NewGuid();
        var teamId = Guid.NewGuid();
        var serviceId = Guid.NewGuid();
        var incidentId = Guid.NewGuid();
        var creatorId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<OpsBoardDbContext>();

        db.AddRange(
            Organization.Create(organizationId, $"Continuation {organizationId:N}"),
            Team.Create(teamId, organizationId, "Continuation Team"),
            // The incident's author must exist: created_by_user_id is a foreign key.
            User.Create(creatorId, organizationId, teamId, "Continuation Author", UserRole.IncidentManager),
            Service.Create(serviceId, organizationId, teamId, "Continuation Service", "Arranged", now),
            Incident.Create(
                incidentId,
                organizationId,
                serviceId,
                creatorId,
                "Continuation incident",
                "Arranged for continuation coverage.",
                IncidentSeverity.Low,
                now));

        var memberIds = new List<Guid>();
        for (var i = 0; i < memberCount; i++)
        {
            var userId = Guid.NewGuid();
            memberIds.Add(userId);
            db.AddRange(
                User.Create(userId, organizationId, teamId, $"Member {i:D3}", UserRole.Responder),
                IncidentResponder.Create(organizationId, incidentId, userId, now));
        }

        await db.SaveChangesAsync();
        return new CrowdedIncident(incidentId, memberIds);
    }

    private sealed record CrowdedIncident(Guid IncidentId, List<Guid> MemberIds);

    private static async Task SeedAsync(OpsBoardWebApplicationFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
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

    // Health is stored as text, so this proves the domain ranking, not the alphabet.
    [Theory]
    [InlineData("desc")]
    [InlineData("asc")]
    public async Task Services_sort_by_health_in_domain_order(string direction)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync($"/api/services?sort=health&direction={direction}&pageSize=100");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var rank = new Dictionary<string, int> { ["Operational"] = 0, ["Degraded"] = 1, ["Outage"] = 2 };
        var ranks = page.GetProperty("items").EnumerateArray()
            .Select(item => rank[item.GetProperty("health").GetString()!])
            .ToList();
        Assert.True(ranks.Distinct().Count() > 1, "the seed should hold more than one health state");
        var expected = direction == "desc"
            ? ranks.OrderByDescending(r => r).ToList()
            : ranks.OrderBy(r => r).ToList();
        Assert.Equal(expected, ranks);
    }

    [Theory]
    [InlineData("desc")]
    [InlineData("asc")]
    public async Task Services_sort_by_last_update(string direction)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync($"/api/services?sort=updatedAt&direction={direction}&pageSize=100");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var times = page.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("updatedAt").GetDateTimeOffset())
            .ToList();
        var expected = direction == "desc"
            ? times.OrderByDescending(t => t).ToList()
            : times.OrderBy(t => t).ToList();
        Assert.Equal(expected, times);
    }

    // The database collation compares bytes on Alpine, so this pins case-insensitive order.
    [Theory]
    [InlineData("desc")]
    [InlineData("asc")]
    public async Task Services_sort_by_name_ignoring_case(string direction)
    {
        var client = await ClientAsync();

        var response = await client.GetAsync($"/api/services?sort=name&direction={direction}&pageSize=100");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var names = page.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("name").GetString()!)
            .ToList();
        var byCase = names.Order(StringComparer.Ordinal).ToList();
        var ignoringCase = names.OrderBy(n => n.ToLowerInvariant(), StringComparer.Ordinal).ToList();
        Assert.NotEqual(byCase, ignoringCase);
        var expected = direction == "desc"
            ? names.OrderByDescending(n => n.ToLowerInvariant(), StringComparer.Ordinal)
                .Select(n => n.ToLowerInvariant()).ToList()
            : ignoringCase.Select(n => n.ToLowerInvariant()).ToList();
        Assert.Equal(expected, names.Select(n => n.ToLowerInvariant()).ToList());
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
