namespace OpsBoard.Application.Realtime;

public interface IIncidentRealtimePublisher
{
    Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken);
}
