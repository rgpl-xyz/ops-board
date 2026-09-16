using Microsoft.Extensions.Logging;
using OpsBoard.Application.Realtime;

namespace OpsBoard.UnitTests.Application;

public sealed class IncidentRealtimePublicationTests
{
    [Fact]
    public async Task TryPublishAsync_records_fact()
    {
        var publisher = new RecordingPublisher();
        var logger = new CollectingLogger();
        var org = Guid.NewGuid();
        var incident = Guid.NewGuid();
        var at = DateTimeOffset.Parse("2026-09-16T12:00:00Z");

        await IncidentRealtimePublication.TryPublishAsync(
            publisher,
            logger,
            org,
            incident,
            IncidentRealtimeFactKind.IncidentCreated,
            version: 2,
            lifecycleVersion: 3,
            at,
            CancellationToken.None);

        var fact = Assert.Single(publisher.Facts);
        Assert.Equal(org, fact.OrganizationId);
        Assert.Equal(incident, fact.IncidentId);
        Assert.Equal(IncidentRealtimeFactKind.IncidentCreated, fact.Kind);
        Assert.Equal("2", fact.Version);
        Assert.Equal("3", fact.LifecycleVersion);
        Assert.Equal(at, fact.OccurredAtUtc);
        Assert.Empty(logger.Errors);
    }

    [Fact]
    public async Task TryPublishAsync_swallows_publisher_exception_and_logs()
    {
        var publisher = new ThrowingPublisher();
        var logger = new CollectingLogger();

        await IncidentRealtimePublication.TryPublishAsync(
            publisher,
            logger,
            Guid.NewGuid(),
            Guid.NewGuid(),
            IncidentRealtimeFactKind.IncidentResolved,
            1,
            1,
            DateTimeOffset.UtcNow,
            CancellationToken.None);

        Assert.Single(logger.Errors);
    }

    private sealed class RecordingPublisher : IIncidentRealtimePublisher
    {
        public List<IncidentRealtimeFact> Facts { get; } = [];

        public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken)
        {
            Facts.Add(fact);
            return Task.CompletedTask;
        }
    }

    private sealed class ThrowingPublisher : IIncidentRealtimePublisher
    {
        public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("hub down");
    }

    private sealed class CollectingLogger : ILogger
    {
        public List<string> Errors { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (logLevel >= LogLevel.Error)
            {
                Errors.Add(formatter(state, exception));
            }
        }
    }
}
