using OpsBoard.Application.Common;
using OpsBoard.Application.Lookups;

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

        return app;
    }
}
