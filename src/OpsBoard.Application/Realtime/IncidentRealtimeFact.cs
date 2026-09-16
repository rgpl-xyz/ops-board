namespace OpsBoard.Application.Realtime;

public sealed record IncidentRealtimeFact(
    Guid OrganizationId,
    Guid IncidentId,
    IncidentRealtimeFactKind Kind,
    string? Version,
    string? LifecycleVersion,
    DateTimeOffset OccurredAtUtc);
