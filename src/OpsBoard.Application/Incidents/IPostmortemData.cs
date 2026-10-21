namespace OpsBoard.Application.Incidents;

public sealed record PostmortemDto(
    string Summary,
    string Impact,
    string RootCause,
    string Resolution,
    IReadOnlyList<string> ActionItems);

public interface IPostmortemData
{
    /// The incident's postmortem; null when it has none or the organization has no such incident.
    Task<PostmortemDto?> GetAsync(Guid organizationId, Guid incidentId, CancellationToken cancellationToken);
}
