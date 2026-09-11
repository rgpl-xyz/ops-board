using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Identity;

public sealed record CurrentUser(Guid UserId, Guid OrganizationId, UserRole Role);

public interface ICurrentUser
{
    Task<CurrentUser> GetAsync(CancellationToken cancellationToken);
}
