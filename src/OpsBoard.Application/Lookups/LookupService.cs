using OpsBoard.Application.Common;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Lookups;

namespace OpsBoard.Application.Lookups;

public sealed class LookupService(ICurrentUser currentUser, ILookupData data)
{
    public async Task<CurrentUserDto> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        var bootstrap = await data.GetUserBootstrapAsync(user.UserId, cancellationToken)
            ?? throw new IdentityUnavailableException();
        return new CurrentUserDto(
            bootstrap.UserId,
            bootstrap.OrganizationId,
            bootstrap.DisplayName,
            bootstrap.Role,
            Demo: true);
    }

    public async Task<OrganizationDto> GetOrganizationAsync(CancellationToken cancellationToken)
    {
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        return await data.GetOrganizationAsync(user.OrganizationId, cancellationToken)
            ?? throw new UnavailableException();
    }

    public async Task<Bounded<TeamDto>> ListTeamsAsync(ContinuationQuery query, CancellationToken cancellationToken)
    {
        ValidateContinuation(query);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        var (items, next) = await data.ListTeamsAsync(user.OrganizationId, query.Limit, query.After, cancellationToken);
        return new Bounded<TeamDto>(items, next);
    }

    public async Task<Bounded<LookupUserDto>> ListUsersAsync(ContinuationQuery query, CancellationToken cancellationToken)
    {
        ValidateContinuation(query);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        var (items, next) = await data.ListUsersAsync(user.OrganizationId, query.Limit, query.After, cancellationToken);
        return new Bounded<LookupUserDto>(items, next);
    }

    private static void ValidateContinuation(ContinuationQuery query)
    {
        if (query.Limit is < 1 or > 100)
        {
            throw new ValidationFailedException("limit", "Limit must be between 1 and 100.");
        }
    }
}
