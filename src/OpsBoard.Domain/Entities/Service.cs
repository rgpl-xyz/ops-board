using OpsBoard.Domain.Enums;

namespace OpsBoard.Domain.Entities;

public sealed class Service
{
    private Service()
    {
    }

    private Service(
        Guid id,
        Guid organizationId,
        Guid teamId,
        string name,
        string description,
        ServiceHealth health,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt)
    {
        Id = id;
        OrganizationId = organizationId;
        TeamId = teamId;
        Name = name;
        Description = description;
        Health = health;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        Version = 1;
    }

    public Guid Id { get; private set; }

    public Guid OrganizationId { get; private set; }

    public Guid TeamId { get; private set; }

    public string Name { get; private set; } = null!;

    public string Description { get; private set; } = null!;

    public ServiceHealth Health { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public long Version { get; private set; }

    internal void SetVersion(long version)
    {
        if (version < 1)
        {
            throw new DomainException("Version must be positive.");
        }

        Version = version;
    }

    internal void AdvanceVersion() => Version++;

    public static Service Create(
        Guid id,
        Guid organizationId,
        Guid teamId,
        string name,
        string description,
        DateTimeOffset now)
    {
        var createdAt = Guards.RequireUtc(now, nameof(now));
        return new Service(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(teamId, nameof(teamId)),
            Guards.RequireText(name, nameof(name), 120),
            Guards.RequireText(description, nameof(description), 2000),
            ServiceHealth.Operational,
            createdAt,
            createdAt);
    }

    public void Update(
        string name,
        string description,
        Guid teamId,
        ServiceHealth health,
        DateTimeOffset now)
    {
        var updatedAt = Guards.RequireUtc(now, nameof(now));
        Guards.RequireNotBefore(updatedAt, UpdatedAt, nameof(now));
        Guards.RequireNotBefore(updatedAt, CreatedAt, nameof(now));

        Name = Guards.RequireText(name, nameof(name), 120);
        Description = Guards.RequireText(description, nameof(description), 2000);
        TeamId = Guards.RequireId(teamId, nameof(teamId));
        Health = Guards.RequireDefined(health, nameof(health));
        UpdatedAt = updatedAt;
    }
}
