using System.Diagnostics;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using OpsBoard.Application.Errors;

namespace OpsBoard.Api.Errors;

public static class ExceptionMapping
{
    public static async Task WriteProblemAsync(HttpContext httpContext, Exception exception)
    {
        var (status, code, title, detail, errors) = Map(exception);
        httpContext.Response.StatusCode = status;
        httpContext.Response.ContentType = "application/problem+json";

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path,
            Type = $"urn:opsboard:problem:{code}"
        };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier;
        if (errors is not null)
        {
            problem.Extensions["errors"] = errors;
        }

        await httpContext.Response.WriteAsJsonAsync(problem);
    }

    public static (int Status, string Code, string Title, string Detail, IDictionary<string, string[]>? Errors) Map(
        Exception exception) =>
        exception switch
        {
            ValidationFailedException v => (
                StatusCodes.Status400BadRequest,
                v.Code,
                "Validation failed",
                v.Message,
                v.Errors.ToDictionary(x => x.Key, x => x.Value)),
            ValidationException fv => (
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Validation failed",
                "One or more validation errors occurred.",
                fv.Errors.GroupBy(e => e.PropertyName)
                    .ToDictionary(g => ToCamel(g.Key), g => g.Select(e => e.ErrorMessage).ToArray())),
            // A value the framework could not bind is a client error, not a server
            // fault: without this case it reaches the catch-all below as a 500.
            BadHttpRequestException => (
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Validation failed",
                "A request value could not be read.",
                null),
            IdentityUnavailableException e => (StatusCodes.Status401Unauthorized, e.Code, "Identity unavailable", e.Message, null),
            ForbiddenException e => (StatusCodes.Status403Forbidden, e.Code, "Forbidden", e.Message, null),
            UnavailableException e => (StatusCodes.Status404NotFound, e.Code, "Unavailable", e.Message, null),
            LifecycleConflictException e => (StatusCodes.Status409Conflict, e.Code, "Lifecycle conflict", e.Message, null),
            ResponderConflictException e => (StatusCodes.Status409Conflict, e.Code, "Responder conflict", e.Message, null),
            ConcurrencyConflictException e => (StatusCodes.Status409Conflict, e.Code, "Concurrency conflict", e.Message, null),
            PersistenceUnavailableException e => (StatusCodes.Status503ServiceUnavailable, e.Code, "Persistence unavailable", e.Message, null),
            PersistenceFailureException e => (StatusCodes.Status500InternalServerError, e.Code, "Persistence failure", e.Message, null),
            _ => (StatusCodes.Status500InternalServerError, "persistence_failure", "Unexpected error", "The operation could not be completed.", null)
        };

    private static string ToCamel(string name) =>
        string.IsNullOrEmpty(name) ? name : char.ToLowerInvariant(name[0]) + name[1..];
}
