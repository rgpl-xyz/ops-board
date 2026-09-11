using OpsBoard.Domain.Enums;

namespace OpsBoard.Domain.Entities;

public sealed class User
{
    private User()
    {
    }

    private User(Guid id, Guid organizationId, Guid teamId, string displayName, UserRole role)
    {
        Id = id;
        OrganizationId = organizationId;
        TeamId = teamId;
        DisplayName = displayName;
        Role = role;
    }

    public Guid Id { get; private set; }

    public Guid OrganizationId { get; private set; }

    public Guid TeamId { get; private set; }

    public string DisplayName { get; private set; } = null!;

    public UserRole Role { get; private set; }

    public static User Create(
        Guid id,
        Guid organizationId,
        Guid teamId,
        string displayName,
        UserRole role)
    {
        return new User(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(teamId, nameof(teamId)),
            Guards.RequireText(displayName, nameof(displayName), 120),
            Guards.RequireDefined(role, nameof(role)));
    }
}
