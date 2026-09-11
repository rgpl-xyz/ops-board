using OpsBoard.Application.Common;
using OpsBoard.Application.Lookups;
using OpsBoard.Application.Services;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Api.Endpoints;

public static class DomainEndpoints
{
    public static IEndpointRouteBuilder MapDomainEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/current-user", async (LookupService lookups, CancellationToken ct) =>
            Results.Ok(await lookups.GetCurrentUserAsync(ct)));

        app.MapGet("/api/organization", async (LookupService lookups, CancellationToken ct) =>
            Results.Ok(await lookups.GetOrganizationAsync(ct)));

        app.MapGet("/api/lookups/teams", async (int? limit, Guid? after, LookupService lookups, CancellationToken ct) =>
            Results.Ok(await lookups.ListTeamsAsync(new ContinuationQuery(limit ?? 100, after), ct)));

        app.MapGet("/api/lookups/users", async (int? limit, Guid? after, LookupService lookups, CancellationToken ct) =>
            Results.Ok(await lookups.ListUsersAsync(new ContinuationQuery(limit ?? 100, after), ct)));

        app.MapGet("/api/services", async (
            int? page,
            int? pageSize,
            Guid? teamId,
            ServiceHealth? health,
            string? search,
            string? sort,
            string? direction,
            ServiceService services,
            CancellationToken ct) =>
        {
            var query = new ServiceQuery(
                page ?? 1,
                pageSize ?? 25,
                teamId,
                health,
                search,
                sort ?? "name",
                direction ?? "asc");
            return Results.Ok(await services.ListAsync(query, ct));
        });

        app.MapGet("/api/services/{id:guid}", async (Guid id, ServiceService services, CancellationToken ct) =>
            Results.Ok(await services.GetAsync(id, ct)));

        app.MapPost("/api/services", async (CreateServiceRequest request, ServiceService services, CancellationToken ct) =>
        {
            var created = await services.CreateAsync(request, ct);
            return Results.Created($"/api/services/{created.Id}", created);
        });

        app.MapPut("/api/services/{id:guid}", async (Guid id, UpdateServiceRequest request, ServiceService services, CancellationToken ct) =>
            Results.Ok(await services.UpdateAsync(id, request, ct)));

        return app;
    }
}
