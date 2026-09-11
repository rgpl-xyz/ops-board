using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Services;

public interface IServiceData
{
    Task<(IReadOnlyList<ServiceDto> Items, int TotalCount)> ListAsync(
        Guid organizationId,
        ServiceQuery query,
        CancellationToken cancellationToken);

    Task<ServiceDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken);

    Task<Service?> GetForUpdateAsync(Guid organizationId, Guid id, CancellationToken cancellationToken);

    Task<bool> TeamExistsAsync(Guid organizationId, Guid teamId, CancellationToken cancellationToken);

    Task<bool> ServiceExistsAsync(Guid organizationId, Guid serviceId, CancellationToken cancellationToken);

    Task<ServiceDto> CreateAsync(Service service, CancellationToken cancellationToken);

    Task<ServiceDto> UpdateAsync(Service service, long expectedVersion, CancellationToken cancellationToken);
}
