namespace OpsBoard.Application.Realtime;

/// <summary>No-op publisher until the Api SignalR implementation is registered.</summary>
public sealed class NullIncidentRealtimePublisher : IIncidentRealtimePublisher
{
    public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken) =>
        Task.CompletedTask;
}
