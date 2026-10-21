using Microsoft.EntityFrameworkCore;
using OpsBoard.Application.Incidents;
using OpsBoard.Infrastructure.Persistence;

namespace OpsBoard.Infrastructure.Incidents;

public sealed class PostmortemData(OpsBoardDbContext db) : IPostmortemData
{
    public Task<PostmortemDto?> GetAsync(Guid organizationId, Guid incidentId, CancellationToken cancellationToken) =>
        db.Postmortems.AsNoTracking()
            .Where(p => p.OrganizationId == organizationId && p.IncidentId == incidentId)
            .Select(p => new PostmortemDto(
                p.Summary,
                p.Impact,
                p.RootCause,
                p.Resolution,
                EF.Property<List<string>>(p, "_actionItems")))
            .FirstOrDefaultAsync(cancellationToken);
}
