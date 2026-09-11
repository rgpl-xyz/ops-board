namespace OpsBoard.Domain.Enums;

public enum TimelineEntryType
{
    IncidentCreated,
    StatusChanged,
    SeverityChanged,
    ResponderJoined,
    ResponderLeft,
    Resolved,
    Reopened,
    WrittenUpdate
}
