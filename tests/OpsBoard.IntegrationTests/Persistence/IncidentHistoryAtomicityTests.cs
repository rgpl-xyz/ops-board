using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using OpsBoard.IntegrationTests.Http;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

/// A failure between a domain operation and its commit must leave nothing
/// behind: no field change, no history entry, no advanced counter.
[Collection("Postgres")]
[Trait("Category", "Persistence")]
public sealed class IncidentHistoryAtomicityTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) }
    };

    [Fact]
    public async Task A_failure_before_commit_changes_nothing_and_writes_no_history()
    {
        await using var plain = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(plain);
        var incidentId = await AnActiveIncidentIdAsync(plain);
        var before = await SnapshotAsync(incidentId);

        var interceptor = new FailOnNthSaveInterceptor(failOnCall: 1);
        await using var failing = FactoryWith(interceptor);
        var response = await failing.CreateClient().PatchAsJsonAsync(
            $"/api/incidents/{incidentId}/severity",
            new { severity = OtherSeverity(before.Severity), expectedVersion = before.Version.ToString() },
            JsonOptions);

        Assert.False(response.IsSuccessStatusCode);
        Assert.True(interceptor.Calls > 0, "The interceptor never saw a save; the test would prove nothing.");

        var after = await SnapshotAsync(incidentId);
        Assert.Equal(before, after);
    }

    /// The disarmed run proves the assertions above are not satisfied by an
    /// operation that never happened.
    [Fact]
    public async Task The_same_operation_succeeds_when_the_failure_is_disarmed()
    {
        await using var plain = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(plain);
        var incidentId = await AnActiveIncidentIdAsync(plain);
        var before = await SnapshotAsync(incidentId);

        var interceptor = new FailOnNthSaveInterceptor(failOnCall: 1) { Armed = false };
        await using var working = FactoryWith(interceptor);
        var response = await working.CreateClient().PatchAsJsonAsync(
            $"/api/incidents/{incidentId}/severity",
            new { severity = OtherSeverity(before.Severity), expectedVersion = before.Version.ToString() },
            JsonOptions);

        response.EnsureSuccessStatusCode();

        var after = await SnapshotAsync(incidentId);
        Assert.NotEqual(before.Severity, after.Severity);
        Assert.True(after.Version > before.Version, "A committed change must advance the version.");
        Assert.Equal(before.HistoryCount + 1, after.HistoryCount);
    }

    [Fact]
    public async Task Resolving_then_reopening_leaves_exactly_one_entry_each()
    {
        await using var factory = new OpsBoardWebApplicationFactory(fixture.ConnectionString);
        await SeedAsync(factory);
        var client = factory.CreateClient();
        var incidentId = await AnActiveIncidentIdAsync(factory);

        var before = await SnapshotAsync(incidentId);
        var resolve = await client.PostAsJsonAsync(
            $"/api/incidents/{incidentId}/resolve",
            new { expectedVersion = before.Version.ToString() },
            JsonOptions);
        resolve.EnsureSuccessStatusCode();
        var resolved = await SnapshotAsync(incidentId);

        var reopen = await client.PostAsJsonAsync(
            $"/api/incidents/{incidentId}/reopen",
            new { expectedVersion = resolved.Version.ToString() },
            JsonOptions);
        reopen.EnsureSuccessStatusCode();
        var reopened = await SnapshotAsync(incidentId);

        Assert.Equal(before.HistoryCount + 1, resolved.HistoryCount);
        Assert.Equal(resolved.HistoryCount + 1, reopened.HistoryCount);
        Assert.Equal(1, await EntryCountAsync(incidentId, TimelineEntryType.Resolved));
        Assert.Equal(1, await EntryCountAsync(incidentId, TimelineEntryType.Reopened));
        Assert.Equal(0, await EntryCountAsync(incidentId, TimelineEntryType.StatusChanged));
    }

    private OpsBoardWebApplicationFactory FactoryWith(FailOnNthSaveInterceptor interceptor) =>
        new(
            fixture.ConnectionString,
            configureServices: services =>
            {
                services.RemoveAll<DbContextOptions<OpsBoardDbContext>>();
                services.RemoveAll<DbContextOptions>();
                services.AddDbContext<OpsBoardDbContext>(options =>
                    options.UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor));
            });

    private async Task<Snapshot> SnapshotAsync(Guid incidentId)
    {
        await using var db = fixture.CreateContext();
        var incident = await db.Incidents.AsNoTracking().SingleAsync(x => x.Id == incidentId);
        var history = await db.IncidentTimelineEntries.AsNoTracking()
            .CountAsync(x => x.IncidentId == incidentId);
        return new Snapshot(
            incident.Severity.ToString(),
            incident.Status.ToString(),
            incident.Version,
            incident.LifecycleVersion,
            incident.LastHistorySequence,
            incident.UpdatedAt,
            history);
    }

    /// Compared as the enum, not its name: `Type.ToString()` does not translate.
    private async Task<int> EntryCountAsync(Guid incidentId, TimelineEntryType type)
    {
        await using var db = fixture.CreateContext();
        return await db.IncidentTimelineEntries.AsNoTracking()
            .CountAsync(x => x.IncidentId == incidentId && x.Type == type);
    }

    private static string OtherSeverity(string current) =>
        current == "Critical" ? "Low" : "Critical";

    private static async Task<Guid> AnActiveIncidentIdAsync(OpsBoardWebApplicationFactory factory)
    {
        var list = await factory.CreateClient().GetFromJsonAsync<JsonElement>(
            "/api/incidents?status=Investigating",
            JsonOptions);
        return list.GetProperty("items")[0].GetProperty("id").GetGuid();
    }

    private static async Task SeedAsync(OpsBoardWebApplicationFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
    }

    private sealed record Snapshot(
        string Severity,
        string Status,
        long Version,
        long LifecycleVersion,
        long LastHistorySequence,
        DateTimeOffset UpdatedAt,
        int HistoryCount);
}
