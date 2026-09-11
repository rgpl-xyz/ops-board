using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;

namespace OpsBoard.Infrastructure.Identity;

public sealed class DemoCurrentUser(
    OpsBoardDbContext db,
    IConfiguration configuration) : ICurrentUser
{
    private CurrentUser? _cached;

    public async Task<CurrentUser> GetAsync(CancellationToken cancellationToken)
    {
        if (_cached is not null)
        {
            return _cached;
        }

        var enabledText = configuration["Demo:Enabled"];
        var enabled = enabledText is null || bool.TryParse(enabledText, out var flag) && flag;
        if (!enabled)
        {
            throw new IdentityUnavailableException();
        }

        var userIdText = configuration["Demo:UserId"];
        if (!Guid.TryParse(userIdText, out var userId) || userId == Guid.Empty)
        {
            throw new IdentityUnavailableException();
        }

        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            throw new IdentityUnavailableException();
        }

        var teamOk = await db.Teams.AsNoTracking()
            .AnyAsync(x => x.Id == user.TeamId && x.OrganizationId == user.OrganizationId, cancellationToken);
        if (!teamOk)
        {
            throw new IdentityUnavailableException();
        }

        _cached = new CurrentUser(user.Id, user.OrganizationId, user.Role);
        return _cached;
    }
}
