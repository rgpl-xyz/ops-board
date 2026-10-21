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

        // The body carries only the question; the incident comes from the route
        // and whatever else is in the body is not read.
        app.MapPost(
            "/api/incidents/{id:guid}/assistant/questions",
            async (Guid id, IncidentQuestionRequest request, HttpContext http, IncidentQuestionService questions, CancellationToken ct) =>
                Results.Ok(await questions.AskAsync(
                    id,
                    request,
                    ClientAddress.VisitorOf(http.Connection.RemoteIpAddress),
                    ct)));

        return app;
    }
}
