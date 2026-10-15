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
        // route, the visitor from the connection, and everything else from the server.
        app.MapPost(
            "/api/incidents/{id:guid}/assistant/brief",
            async (Guid id, HttpContext http, IncidentBriefService briefs, CancellationToken ct) =>
                Results.Ok(await briefs.GenerateAsync(id, ClientAddress.VisitorOf(http.Connection.RemoteIpAddress), ct)));

        return app;
    }
}
