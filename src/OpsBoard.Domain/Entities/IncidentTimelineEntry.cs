using OpsBoard.Domain.Enums;

namespace OpsBoard.Domain.Entities;

public sealed class IncidentTimelineEntry
{
    private IncidentTimelineEntry()
    {
    }

    private IncidentTimelineEntry(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        TimelineEntryType type,
        string? body,
        IncidentStatus? fromStatus,
        IncidentStatus? toStatus,
        IncidentSeverity? fromSeverity,
        IncidentSeverity? toSeverity)
    {
        Id = id;
        OrganizationId = organizationId;
        IncidentId = incidentId;
        ActorUserId = actorUserId;
        Sequence = sequence;
        OccurredAt = occurredAt;
        Type = type;
        Body = body;
        FromStatus = fromStatus;
        ToStatus = toStatus;
        FromSeverity = fromSeverity;
        ToSeverity = toSeverity;
    }

    public Guid Id { get; private set; }

    public Guid OrganizationId { get; private set; }

    public Guid IncidentId { get; private set; }

    public Guid ActorUserId { get; private set; }

    public long Sequence { get; private set; }

    public DateTimeOffset OccurredAt { get; private set; }

    public TimelineEntryType Type { get; private set; }

    public string? Body { get; private set; }

    public IncidentStatus? FromStatus { get; private set; }

    public IncidentStatus? ToStatus { get; private set; }

    public IncidentSeverity? FromSeverity { get; private set; }

    public IncidentSeverity? ToSeverity { get; private set; }

    public static IncidentTimelineEntry IncidentCreated(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        IncidentSeverity initialSeverity)
    {
        return CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.IncidentCreated,
            body: null,
            fromStatus: null,
            toStatus: IncidentStatus.Investigating,
            fromSeverity: null,
            toSeverity: Guards.RequireDefined(initialSeverity, nameof(initialSeverity)));
    }

    public static IncidentTimelineEntry StatusChanged(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        IncidentStatus fromStatus,
        IncidentStatus toStatus)
    {
        fromStatus = Guards.RequireDefined(fromStatus, nameof(fromStatus));
        toStatus = Guards.RequireDefined(toStatus, nameof(toStatus));
        RequireActive(fromStatus);
        RequireActive(toStatus);
        if (fromStatus == toStatus)
        {
            throw new DomainException("Status change requires distinct values.");
        }

        return CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.StatusChanged,
            body: null,
            fromStatus,
            toStatus,
            fromSeverity: null,
            toSeverity: null);
    }

    public static IncidentTimelineEntry SeverityChanged(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        IncidentSeverity fromSeverity,
        IncidentSeverity toSeverity)
    {
        fromSeverity = Guards.RequireDefined(fromSeverity, nameof(fromSeverity));
        toSeverity = Guards.RequireDefined(toSeverity, nameof(toSeverity));
        if (fromSeverity == toSeverity)
        {
            throw new DomainException("Severity change requires distinct values.");
        }

        return CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.SeverityChanged,
            body: null,
            fromStatus: null,
            toStatus: null,
            fromSeverity,
            toSeverity);
    }

    public static IncidentTimelineEntry ResponderJoined(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt) =>
        CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.ResponderJoined,
            body: null,
            fromStatus: null,
            toStatus: null,
            fromSeverity: null,
            toSeverity: null);

    public static IncidentTimelineEntry ResponderLeft(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt) =>
        CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.ResponderLeft,
            body: null,
            fromStatus: null,
            toStatus: null,
            fromSeverity: null,
            toSeverity: null);

    public static IncidentTimelineEntry Resolved(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        IncidentStatus fromStatus)
    {
        fromStatus = Guards.RequireDefined(fromStatus, nameof(fromStatus));
        RequireActive(fromStatus);
        return CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.Resolved,
            body: null,
            fromStatus,
            toStatus: IncidentStatus.Resolved,
            fromSeverity: null,
            toSeverity: null);
    }

    public static IncidentTimelineEntry Reopened(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt) =>
        CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.Reopened,
            body: null,
            fromStatus: IncidentStatus.Resolved,
            toStatus: IncidentStatus.Investigating,
            fromSeverity: null,
            toSeverity: null);

    public static IncidentTimelineEntry WrittenUpdate(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        string body) =>
        CreateCore(
            id,
            organizationId,
            incidentId,
            actorUserId,
            sequence,
            occurredAt,
            TimelineEntryType.WrittenUpdate,
            body: Guards.RequireText(body, nameof(body), 4000),
            fromStatus: null,
            toStatus: null,
            fromSeverity: null,
            toSeverity: null);

    private static IncidentTimelineEntry CreateCore(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        Guid actorUserId,
        long sequence,
        DateTimeOffset occurredAt,
        TimelineEntryType type,
        string? body,
        IncidentStatus? fromStatus,
        IncidentStatus? toStatus,
        IncidentSeverity? fromSeverity,
        IncidentSeverity? toSeverity)
    {
        if (sequence < 1)
        {
            throw new DomainException("Sequence must be positive.");
        }

        return new IncidentTimelineEntry(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(incidentId, nameof(incidentId)),
            Guards.RequireId(actorUserId, nameof(actorUserId)),
            sequence,
            Guards.RequireUtc(occurredAt, nameof(occurredAt)),
            Guards.RequireDefined(type, nameof(type)),
            body,
            fromStatus,
            toStatus,
            fromSeverity,
            toSeverity);
    }

    private static void RequireActive(IncidentStatus status)
    {
        if (status is not (IncidentStatus.Investigating or IncidentStatus.Identified or IncidentStatus.Monitoring))
        {
            throw new DomainException("Active status required.");
        }
    }
}
