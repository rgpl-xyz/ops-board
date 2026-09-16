namespace OpsBoard.Application.Realtime;

public enum IncidentRealtimeFactKind
{
    IncidentCreated,
    IncidentDetailsChanged,
    IncidentSeverityChanged,
    IncidentStatusChanged,
    IncidentResolved,
    IncidentReopened,
    ResponderJoined,
    ResponderLeft,
    WrittenUpdateAdded,
}
