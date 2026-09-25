using OpsBoard.Application.Common;
using OpsBoard.Application.Incidents;
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
            string? health,
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
                QueryEnum.Parse<ServiceHealth>(health, "health"),
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

        app.MapGet("/api/incidents", async (
            int? page,
            int? pageSize,
            Guid? serviceId,
            Guid? teamId,
            string? severity,
            string? status,
            string? search,
            string? sort,
            string? direction,
            IncidentService incidents,
            CancellationToken ct) =>
        {
            var query = new IncidentQuery(
                page ?? 1,
                pageSize ?? 25,
                serviceId,
                teamId,
                QueryEnum.Parse<IncidentSeverity>(severity, "severity"),
                QueryEnum.Parse<IncidentStatus>(status, "status"),
                search,
                sort ?? "createdAt",
                direction ?? "desc");
            return Results.Ok(await incidents.ListAsync(query, ct));
        });

        app.MapGet("/api/incidents/{id:guid}", async (Guid id, IncidentService incidents, CancellationToken ct) =>
            Results.Ok(await incidents.GetAsync(id, ct)));

        app.MapPost("/api/incidents", async (CreateIncidentRequest request, IncidentService incidents, CancellationToken ct) =>
        {
            var created = await incidents.CreateAsync(request, ct);
            return Results.Created($"/api/incidents/{created.Id}", created);
        });

        app.MapPut("/api/incidents/{id:guid}", async (Guid id, UpdateIncidentRequest request, IncidentService incidents, CancellationToken ct) =>
            Results.Ok(await incidents.UpdateDetailsAsync(id, request, ct)));

        app.MapPatch("/api/incidents/{id:guid}/severity", async (Guid id, SeverityRequest request, IncidentService incidents, CancellationToken ct) =>
            Results.Ok(await incidents.ChangeSeverityAsync(id, request, ct)));

        app.MapPatch("/api/incidents/{id:guid}/status", async (Guid id, StatusRequest request, IncidentService incidents, CancellationToken ct) =>
            Results.Ok(await incidents.ChangeActiveStatusAsync(id, request, ct)));

        app.MapPost("/api/incidents/{id:guid}/resolve", async (Guid id, VersionRequest request, IncidentService incidents, CancellationToken ct) =>
            Results.Ok(await incidents.ResolveAsync(id, request, ct)));

        app.MapPost("/api/incidents/{id:guid}/reopen", async (Guid id, VersionRequest request, IncidentService incidents, CancellationToken ct) =>
            Results.Ok(await incidents.ReopenAsync(id, request, ct)));

        app.MapPost("/api/incidents/{id:guid}/responders/join", async (Guid id, LifecycleVersionRequest request, IncidentResponseService responders, CancellationToken ct) =>
            Results.Ok(await responders.JoinAsync(id, request, ct)));

        app.MapPost("/api/incidents/{id:guid}/responders/leave", async (Guid id, LifecycleVersionRequest request, IncidentResponseService responders, CancellationToken ct) =>
            Results.Ok(await responders.LeaveAsync(id, request, ct)));

        app.MapGet("/api/incidents/{id:guid}/responders", async (Guid id, int? limit, Guid? after, IncidentResponseService responders, CancellationToken ct) =>
            Results.Ok(await responders.ListRespondersAsync(id, new ContinuationQuery(limit ?? 100, after), ct)));

        app.MapPost("/api/incidents/{id:guid}/updates", async (Guid id, WrittenUpdateRequest request, IncidentResponseService responders, CancellationToken ct) =>
        {
            var created = await responders.AddUpdateAsync(id, request, ct);
            return Results.Created($"/api/incidents/{id}/timeline", created);
        });

        app.MapGet("/api/incidents/{id:guid}/timeline", async (Guid id, int? page, int? pageSize, IncidentResponseService responders, CancellationToken ct) =>
            Results.Ok(await responders.ListTimelineAsync(id, new PageQuery(page ?? 1, pageSize ?? 25), ct)));

        return app;
    }
}
