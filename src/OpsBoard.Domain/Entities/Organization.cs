namespace OpsBoard.Domain.Entities;

public sealed class Organization
{
    private Organization()
    {
    }

    private Organization(Guid id, string name)
    {
        Id = id;
        Name = name;
    }

    public Guid Id { get; private set; }

    public string Name { get; private set; } = null!;

    public static Organization Create(Guid id, string name)
    {
        return new Organization(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireText(name, nameof(name), 120));
    }
}
