using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// An answered client error is not a server fault: it must not reach the logs as
/// an error, while a genuine failure still must, with its exception.
[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class ErrorLoggingTests(PostgresFixture fixture)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false) }
    };

    [Fact]
    public async Task A_malformed_request_is_not_logged_as_an_error()
    {
        var logs = new CapturingLoggerProvider();
        var client = await ClientAsync(logs);

        var response = await client.GetAsync("/api/incidents?page=notanumber");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(logs.AtLeast(LogLevel.Error));
        Assert.Contains(logs.Entries, e => e.Level == LogLevel.Information && e.Message.Contains("validation_failed"));
    }

    [Fact]
    public async Task A_concurrency_conflict_is_not_logged_as_an_error()
    {
        var logs = new CapturingLoggerProvider();
        var client = await ClientAsync(logs);
        var incidentId = await AnActiveIncidentIdAsync(client);

        var response = await client.PatchAsJsonAsync(
            $"/api/incidents/{incidentId}/severity",
            new { severity = "Low", expectedVersion = "999999" },
            JsonOptions);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Empty(logs.AtLeast(LogLevel.Error));
    }

    [Fact]
    public async Task A_server_failure_is_still_logged_as_an_error_with_its_exception()
    {
        var logs = new CapturingLoggerProvider();
        var seeded = await ClientAsync(logs);
        var incidentId = await AnActiveIncidentIdAsync(seeded);
        var incident = await seeded.GetFromJsonAsync<JsonElement>($"/api/incidents/{incidentId}", JsonOptions);

        var interceptor = new FailOnNthSaveInterceptor(failOnCall: 1);
        var failing = Factory(logs, services =>
        {
            services.RemoveAll<DbContextOptions<OpsBoardDbContext>>();
            services.RemoveAll<DbContextOptions>();
            services.AddDbContext<OpsBoardDbContext>(options =>
                options.UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor));
        }).CreateClient();

        var response = await failing.PatchAsJsonAsync(
            $"/api/incidents/{incidentId}/severity",
            new
            {
                severity = incident.GetProperty("severity").GetString() == "Low" ? "High" : "Low",
                expectedVersion = incident.GetProperty("version").GetString()
            },
            JsonOptions);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Contains(logs.AtLeast(LogLevel.Error), e => e.Exception is InvalidOperationException);
    }

    private OpsBoardWebApplicationFactory Factory(
        CapturingLoggerProvider logs,
        Action<IServiceCollection>? configure = null) =>
        new(
            fixture.ConnectionString,
            configureServices: services =>
            {
                services.AddSingleton<ILoggerProvider>(logs);
                configure?.Invoke(services);
            },
            environment: "Production");

    private async Task<HttpClient> ClientAsync(CapturingLoggerProvider logs)
    {
        var factory = Factory(logs);
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DemoSeedRunner>().RunAsync(CancellationToken.None);
        return factory.CreateClient();
    }

    private static async Task<string> AnActiveIncidentIdAsync(HttpClient client)
    {
        var page = await client.GetFromJsonAsync<JsonElement>(
            "/api/incidents?status=Investigating&pageSize=1", JsonOptions);
        return page.GetProperty("items")[0].GetProperty("id").GetString()!;
    }
}

internal sealed record CapturedLog(string Category, LogLevel Level, string Message, Exception? Exception);

internal sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentQueue<CapturedLog> _entries = new();

    public IReadOnlyCollection<CapturedLog> Entries => _entries.ToArray();

    public IReadOnlyCollection<CapturedLog> AtLeast(LogLevel level) =>
        _entries.Where(e => e.Level >= level).ToArray();

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, _entries);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(string category, ConcurrentQueue<CapturedLog> sink) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            sink.Enqueue(new CapturedLog(category, logLevel, formatter(state, exception), exception));
    }
}
