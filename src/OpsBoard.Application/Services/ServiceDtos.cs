using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Services;

public sealed record CreateServiceRequest(string Name, string Description, Guid TeamId);

public sealed record UpdateServiceRequest(
    string Name,
    string Description,
    Guid TeamId,
    ServiceHealth Health,
    string ExpectedVersion);

public sealed record ServiceDto(
    Guid Id,
    string Name,
    string Description,
    Guid TeamId,
    string TeamName,
    ServiceHealth Health,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string Version);

public sealed record ServiceQuery(
    int Page = 1,
    int PageSize = 25,
    Guid? TeamId = null,
    ServiceHealth? Health = null,
    string? Search = null,
    string Sort = "name",
    string Direction = "asc");
