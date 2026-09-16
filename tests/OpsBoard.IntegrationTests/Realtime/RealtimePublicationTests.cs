using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OpsBoard.Application.Realtime;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using OpsBoard.IntegrationTests.Http;

namespace OpsBoard.IntegrationTests.Realtime;

[Collection("Postgres")]
[Trait("Category", "Realtime")]
public sealed class RealtimePublicationTests(PostgresFixture fixture)
{
    [Fact]
    public async Task Successful_mutation_publishes_an_incident_created_fact_for_its_organization()
    {
        var publisher = new RecordingRealtimePublisher();
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            configureServices: services =>
            {
                services.RemoveAll<IIncidentRealtimePublisher>();
                services.AddSingleton<IIncidentRealtimePublisher>(publisher);
            });
        await SeedAsync(factory);
        var client = factory.CreateClient();
        var serviceId = await GetFirstServiceIdAsync(client);
        var response = await client.PostAsJsonAsync("/api/incidents", new
        {
            title = "Realtime delivery test",
            description = "Committed mutations must publish a thin fact.",
            serviceId,
            severity = "High"
        });
        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<CreatedIncident>();
        Assert.NotNull(created);

        var fact = Assert.Single(publisher.Facts);
        Assert.Equal(SeedIds.Acme, fact.OrganizationId);
        Assert.Equal(created.Id, fact.IncidentId);
        Assert.Equal(IncidentRealtimeFactKind.IncidentCreated, fact.Kind);
    }

    [Fact]
    public async Task Failed_mutation_does_not_publish_a_fact()
    {
        var publisher = new RecordingRealtimePublisher();
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            configureServices: services =>
            {
                services.RemoveAll<IIncidentRealtimePublisher>();
                services.AddSingleton<IIncidentRealtimePublisher>(publisher);
            });
        await SeedAsync(factory);

        var response = await factory.CreateClient().PostAsJsonAsync("/api/incidents", new
        {
            title = "",
            description = "Invalid request must not publish.",
            serviceId = Guid.NewGuid(),
            severity = "High"
        });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(publisher.Facts);
    }

    [Fact]
    public async Task Publisher_failure_after_commit_keeps_http_success()
    {
        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            configureServices: services =>
            {
                services.RemoveAll<IIncidentRealtimePublisher>();
                services.AddSingleton<IIncidentRealtimePublisher, ThrowingRealtimePublisher>();
            });
        await SeedAsync(factory);

        var client = factory.CreateClient();
        var serviceId = await GetFirstServiceIdAsync(client);
        var response = await client.PostAsJsonAsync("/api/incidents", new
        {
            title = "Notify failure still persists",
            description = "The durable command must remain successful.",
            serviceId,
            severity = "High"
        });

        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<CreatedIncident>();
        Assert.NotNull(created);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<OpsBoardDbContext>();
        Assert.True(await db.Incidents.AnyAsync(incident => incident.Id == created.Id));
    }

    private static async Task SeedAsync(OpsBoardWebApplicationFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
        await runner.RunAsync(CancellationToken.None);
    }

    private static async Task<Guid> GetFirstServiceIdAsync(HttpClient client)
    {
        var page = await client.GetFromJsonAsync<ServicePage>("/api/services");
        return Assert.Single(page!.Items.Take(1)).Id;
    }

    private sealed record CreatedIncident(Guid Id);
    private sealed record ServicePage(IReadOnlyList<ServiceItem> Items);
    private sealed record ServiceItem(Guid Id);
}
