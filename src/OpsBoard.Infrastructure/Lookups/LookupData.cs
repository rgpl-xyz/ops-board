using Microsoft.EntityFrameworkCore;
using OpsBoard.Application.Lookups;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;

namespace OpsBoard.Infrastructure.Lookups;

public sealed class LookupData(OpsBoardDbContext db) : ILookupData
{
    public async Task<(IReadOnlyList<TeamDto> Items, Guid? NextAfter)> ListTeamsAsync(
        Guid organizationId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken)
    {
        var query = db.Teams.AsNoTracking().Where(x => x.OrganizationId == organizationId);
        if (after is not null)
        {
            query = query.Where(x => x.Id.CompareTo(after.Value) > 0);
        }

        var rows = await query.OrderBy(x => x.Id).Take(limit + 1)
            .Select(x => new TeamDto(x.Id, x.Name))
            .ToListAsync(cancellationToken);
        return Slice(rows, limit);
    }

    public async Task<(IReadOnlyList<LookupUserDto> Items, Guid? NextAfter)> ListUsersAsync(
        Guid organizationId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken)
    {
        var query = db.Users.AsNoTracking().Where(x => x.OrganizationId == organizationId);
        if (after is not null)
        {
            query = query.Where(x => x.Id.CompareTo(after.Value) > 0);
        }

        var rows = await query.OrderBy(x => x.Id).Take(limit + 1)
            .Select(x => new LookupUserDto(x.Id, x.DisplayName, x.TeamId))
            .ToListAsync(cancellationToken);
        return Slice(rows, limit);
    }

    public async Task<OrganizationDto?> GetOrganizationAsync(Guid organizationId, CancellationToken cancellationToken)
    {
        return await db.Organizations.AsNoTracking()
            .Where(x => x.Id == organizationId)
            .Select(x => new OrganizationDto(x.Id, x.Name))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<(Guid UserId, Guid OrganizationId, string DisplayName, UserRole Role)?> GetUserBootstrapAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        return user is null
            ? null
            : (user.Id, user.OrganizationId, user.DisplayName, user.Role);
    }

    private static (IReadOnlyList<T> Items, Guid? NextAfter) Slice<T>(List<T> rows, int limit)
        where T : class
    {
        Guid? next = null;
        if (rows.Count > limit)
        {
            rows = rows.Take(limit).ToList();
            next = rows[^1] switch
            {
                TeamDto t => t.Id,
                LookupUserDto u => u.Id,
                _ => null
            };
        }

        return (rows, next);
    }
}
