using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;

namespace OpsBoard.Application.Incidents;

public sealed class RelatedIncidentService(ICurrentUser currentUser, IRelatedIncidentData data)
{
    /// Enough to see a pattern at a glance; this is not a search.
    private const int Limit = 5;

    public async Task<RelatedIncidentsDto> ListAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        var items = await data.ListAsync(user.OrganizationId, id, Limit, cancellationToken)
            ?? throw new UnavailableException();
        return new RelatedIncidentsDto(items);
    }
}
