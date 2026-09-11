using OpsBoard.Domain.Enums;

namespace OpsBoard.Domain.Entities;

public sealed class Incident
{
    private Incident()
    {
    }

    private Incident(
        Guid id,
        Guid organizationId,
        Guid serviceId,
        Guid createdByUserId,
        string title,
        string description,
        IncidentSeverity severity,
        IncidentStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        DateTimeOffset? resolvedAt)
    {
        Id = id;
        OrganizationId = organizationId;
        ServiceId = serviceId;
        CreatedByUserId = createdByUserId;
        Title = title;
        Description = description;
        Severity = severity;
        Status = status;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        ResolvedAt = resolvedAt;
        Version = 1;
        LifecycleVersion = 1;
        LastHistorySequence = 0;
    }

    public Guid Id { get; private set; }

    public Guid OrganizationId { get; private set; }

    public Guid ServiceId { get; private set; }

    public Guid CreatedByUserId { get; private set; }

    public string Title { get; private set; } = null!;

    public string Description { get; private set; } = null!;

    public IncidentSeverity Severity { get; private set; }

    public IncidentStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public DateTimeOffset? ResolvedAt { get; private set; }

    /// <summary>Persistence concurrency token for scalar incident state.</summary>
    public long Version { get; private set; }

    /// <summary>Persistence token for collaboration validity.</summary>
    public long LifecycleVersion { get; private set; }

    /// <summary>Last assigned timeline sequence for this incident.</summary>
    public long LastHistorySequence { get; private set; }

    internal void SetPersistenceCounters(long version, long lifecycleVersion, long lastHistorySequence)
    {
        if (version < 1 || lifecycleVersion < 1 || lastHistorySequence < 0)
        {
            throw new DomainException("Persistence counters are invalid.");
        }

        Version = version;
        LifecycleVersion = lifecycleVersion;
        LastHistorySequence = lastHistorySequence;
    }

    internal void AdvanceScalarRevision(bool lifecycleChanged)
    {
        Version++;
        if (lifecycleChanged)
        {
            LifecycleVersion++;
        }
    }

    internal long AllocateNextHistorySequence()
    {
        LastHistorySequence++;
        return LastHistorySequence;
    }

    public static Incident Create(
        Guid id,
        Guid organizationId,
        Guid serviceId,
        Guid actorId,
        string title,
        string description,
        IncidentSeverity severity,
        DateTimeOffset now)
    {
        var createdAt = Guards.RequireUtc(now, nameof(now));
        return new Incident(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(serviceId, nameof(serviceId)),
            Guards.RequireId(actorId, nameof(actorId)),
            Guards.RequireText(title, nameof(title), 200),
            Guards.RequireText(description, nameof(description), 10000),
            Guards.RequireDefined(severity, nameof(severity)),
            IncidentStatus.Investigating,
            createdAt,
            createdAt,
            resolvedAt: null);
    }

    /// <summary>Hydrate a persistence-loaded incident without replaying lifecycle transitions.</summary>
    internal static Incident Reconstitute(
        Guid id,
        Guid organizationId,
        Guid serviceId,
        Guid createdByUserId,
        string title,
        string description,
        IncidentSeverity severity,
        IncidentStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        DateTimeOffset? resolvedAt,
        long version,
        long lifecycleVersion,
        long lastHistorySequence)
    {
        var incident = new Incident(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(serviceId, nameof(serviceId)),
            Guards.RequireId(createdByUserId, nameof(createdByUserId)),
            Guards.RequireText(title, nameof(title), 200),
            Guards.RequireText(description, nameof(description), 10000),
            Guards.RequireDefined(severity, nameof(severity)),
            Guards.RequireDefined(status, nameof(status)),
            Guards.RequireUtc(createdAt, nameof(createdAt)),
            Guards.RequireUtc(updatedAt, nameof(updatedAt)),
            resolvedAt is null ? null : Guards.RequireUtc(resolvedAt.Value, nameof(resolvedAt)));
        incident.SetPersistenceCounters(version, lifecycleVersion, lastHistorySequence);
        return incident;
    }

    public void UpdateDetails(string title, string description, Guid serviceId, DateTimeOffset now)
    {
        var updatedAt = RequireMutableTime(now);
        Title = Guards.RequireText(title, nameof(title), 200);
        Description = Guards.RequireText(description, nameof(description), 10000);
        ServiceId = Guards.RequireId(serviceId, nameof(serviceId));
        UpdatedAt = updatedAt;
    }

    public void ChangeActiveStatus(IncidentStatus target, DateTimeOffset now)
    {
        var updatedAt = RequireMutableTime(now);
        target = Guards.RequireDefined(target, nameof(target));

        if (Status == IncidentStatus.Resolved)
        {
            throw new DomainException("Resolved incidents can only be reopened.");
        }

        if (target == IncidentStatus.Resolved)
        {
            throw new DomainException("Use Resolve to mark an incident resolved.");
        }

        if (target == Status)
        {
            throw new DomainException("Status is unchanged.");
        }

        if (!IsActive(target))
        {
            throw new DomainException("Target status is not an active status.");
        }

        Status = target;
        UpdatedAt = updatedAt;
    }

    public bool ChangeSeverity(IncidentSeverity severity, DateTimeOffset now)
    {
        var updatedAt = RequireMutableTime(now);
        severity = Guards.RequireDefined(severity, nameof(severity));

        if (severity == Severity)
        {
            return false;
        }

        Severity = severity;
        UpdatedAt = updatedAt;
        return true;
    }

    public void Resolve(DateTimeOffset now)
    {
        var updatedAt = RequireMutableTime(now);
        EnsureActive();
        Status = IncidentStatus.Resolved;
        ResolvedAt = updatedAt;
        UpdatedAt = updatedAt;
    }

    public void Reopen(DateTimeOffset now)
    {
        var updatedAt = RequireMutableTime(now);
        if (Status != IncidentStatus.Resolved)
        {
            throw new DomainException("Only resolved incidents can be reopened.");
        }

        Status = IncidentStatus.Investigating;
        ResolvedAt = null;
        UpdatedAt = updatedAt;
    }

    public void EnsureActive()
    {
        if (Status == IncidentStatus.Resolved)
        {
            throw new DomainException("Incident must be active.");
        }
    }

    private DateTimeOffset RequireMutableTime(DateTimeOffset now)
    {
        var updatedAt = Guards.RequireUtc(now, nameof(now));
        Guards.RequireNotBefore(updatedAt, CreatedAt, nameof(now));
        Guards.RequireNotBefore(updatedAt, UpdatedAt, nameof(now));
        return updatedAt;
    }

    private static bool IsActive(IncidentStatus status) =>
        status is IncidentStatus.Investigating or IncidentStatus.Identified or IncidentStatus.Monitoring;
}
