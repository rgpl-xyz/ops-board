using OpsBoard.Application.Assistant;

namespace OpsBoard.Api.Endpoints;

public static class AssistantEndpoints
{
    public static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/assistant", async (IncidentBriefService briefs, CancellationToken ct) =>
            Results.Ok(await briefs.GetStatusAsync(ct)));

        // POST: it spends provider allowance, so it must not be prefetched or
        // replayed like a read. It takes no body: the incident comes from the
        // route and everything else from the server.
        app.MapPost("/api/incidents/{id:guid}/assistant/brief", async (Guid id, IncidentBriefService briefs, CancellationToken ct) =>
            Results.Ok(await briefs.GenerateAsync(id, ct)));

        return app;
    }
}
