namespace OpsBoard.Domain.Entities;

public sealed class Team
{
    private Team()
    {
    }

    private Team(Guid id, Guid organizationId, string name)
    {
        Id = id;
        OrganizationId = organizationId;
        Name = name;
    }

    public Guid Id { get; private set; }

    public Guid OrganizationId { get; private set; }

    public string Name { get; private set; } = null!;

    public static Team Create(Guid id, Guid organizationId, string name)
    {
        return new Team(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireText(name, nameof(name), 120));
    }
}
