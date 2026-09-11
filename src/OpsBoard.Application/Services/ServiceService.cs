using FluentValidation;
using OpsBoard.Application.Common;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Lookups;
using OpsBoard.Domain.Entities;

namespace OpsBoard.Application.Services;

public sealed class ServiceService(
    ICurrentUser currentUser,
    IServiceData data,
    IValidator<CreateServiceRequest> createValidator,
    IValidator<UpdateServiceRequest> updateValidator,
    IValidator<ServiceQuery> queryValidator,
    TimeProvider timeProvider)
{
    public async Task<PageResult<ServiceDto>> ListAsync(ServiceQuery query, CancellationToken cancellationToken)
    {
        await queryValidator.ValidateAndThrowAsync(query, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);

        if (query.TeamId is Guid teamId)
        {
            if (!await data.TeamExistsAsync(user.OrganizationId, teamId, cancellationToken))
            {
                throw new UnavailableException();
            }
        }

        var (items, total) = await data.ListAsync(user.OrganizationId, query, cancellationToken);
        return new PageResult<ServiceDto>(items, query.Page, query.PageSize, total, PageMath.TotalPages(total, query.PageSize));
    }

    public async Task<ServiceDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        return await data.GetAsync(user.OrganizationId, id, cancellationToken)
            ?? throw new UnavailableException();
    }

    public async Task<ServiceDto> CreateAsync(CreateServiceRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);

        if (!await data.TeamExistsAsync(user.OrganizationId, request.TeamId, cancellationToken))
        {
            throw new UnavailableException();
        }

        var now = timeProvider.GetUtcNow();
        var service = Service.Create(
            Guid.NewGuid(),
            user.OrganizationId,
            request.TeamId,
            request.Name,
            request.Description,
            now);
        return await data.CreateAsync(service, cancellationToken);
    }

    public async Task<ServiceDto> UpdateAsync(Guid id, UpdateServiceRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireManage(user.Role);

        var expected = RevisionFormatting.ParseRequired(request.ExpectedVersion, nameof(request.ExpectedVersion));
        var service = await data.GetForUpdateAsync(user.OrganizationId, id, cancellationToken)
            ?? throw new UnavailableException();

        if (!await data.TeamExistsAsync(user.OrganizationId, request.TeamId, cancellationToken))
        {
            throw new UnavailableException();
        }

        service.Update(request.Name, request.Description, request.TeamId, request.Health, timeProvider.GetUtcNow());
        return await data.UpdateAsync(service, expected, cancellationToken);
    }
}
