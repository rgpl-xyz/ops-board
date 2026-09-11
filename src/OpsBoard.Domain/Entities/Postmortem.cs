namespace OpsBoard.Domain.Entities;

public sealed class Postmortem
{
    private readonly List<string> _actionItems = [];

    private Postmortem()
    {
    }

    private Postmortem(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        string summary,
        string impact,
        string rootCause,
        string resolution,
        IEnumerable<string> actionItems)
    {
        Id = id;
        OrganizationId = organizationId;
        IncidentId = incidentId;
        Summary = summary;
        Impact = impact;
        RootCause = rootCause;
        Resolution = resolution;
        _actionItems.AddRange(actionItems);
    }

    public Guid Id { get; private set; }

    public Guid OrganizationId { get; private set; }

    public Guid IncidentId { get; private set; }

    public string Summary { get; private set; } = null!;

    public string Impact { get; private set; } = null!;

    public string RootCause { get; private set; } = null!;

    public string Resolution { get; private set; } = null!;

    public IReadOnlyList<string> ActionItems => _actionItems;

    public static Postmortem Create(
        Guid id,
        Guid organizationId,
        Guid incidentId,
        string summary,
        string impact,
        string rootCause,
        string resolution,
        IEnumerable<string> actionItems)
    {
        return new Postmortem(
            Guards.RequireId(id, nameof(id)),
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(incidentId, nameof(incidentId)),
            Guards.RequireText(summary, nameof(summary), 10000),
            Guards.RequireText(impact, nameof(impact), 10000),
            Guards.RequireText(rootCause, nameof(rootCause), 10000),
            Guards.RequireText(resolution, nameof(resolution), 10000),
            Guards.RequireActionItems(actionItems));
    }
}
