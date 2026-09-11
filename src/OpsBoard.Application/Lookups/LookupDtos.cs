using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Lookups;

public sealed record TeamDto(Guid Id, string Name);

public sealed record LookupUserDto(Guid Id, string DisplayName, Guid TeamId);

public sealed record OrganizationDto(Guid Id, string Name);

public sealed record CurrentUserDto(
    Guid UserId,
    Guid OrganizationId,
    string DisplayName,
    UserRole Role,
    bool Demo);

public interface ILookupData
{
    Task<(IReadOnlyList<TeamDto> Items, Guid? NextAfter)> ListTeamsAsync(
        Guid organizationId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken);

    Task<(IReadOnlyList<LookupUserDto> Items, Guid? NextAfter)> ListUsersAsync(
        Guid organizationId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken);

    Task<OrganizationDto?> GetOrganizationAsync(Guid organizationId, CancellationToken cancellationToken);

    Task<(Guid UserId, Guid OrganizationId, string DisplayName, UserRole Role)?> GetUserBootstrapAsync(
        Guid userId,
        CancellationToken cancellationToken);
}
