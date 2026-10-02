using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.Extensions.Logging;
using OpsBoard.Api.Endpoints;
using OpsBoard.Api.Errors;
using OpsBoard.Api.Realtime;
using OpsBoard.Application;
using OpsBoard.Application.Realtime;
using OpsBoard.Infrastructure;
using OpsBoard.Infrastructure.Persistence.Seed;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddSignalR().AddJsonProtocol(options =>
{
    options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.PayloadSerializerOptions.Converters.Add(
        new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false));
});
builder.Services.AddProblemDetails();
// Binding failures throw in every environment, not only Development, so they
// reach the problem mapping below instead of the framework's own 400.
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false));
});
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        "Frontend",
        policy =>
        {
            policy
                .WithOrigins(
                    builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
                        ?? ["http://localhost:4200"])
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        });
});

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IIncidentRealtimePublisher, SignalRIncidentRealtimePublisher>();

var app = builder.Build();

if (args.Contains("--seed-demo"))
{
    if (!app.Environment.IsDevelopment())
    {
        throw new InvalidOperationException("Demo seed requires Development environment.");
    }

    if (bool.TryParse(app.Configuration["Demo:Enabled"], out var demoEnabled) && !demoEnabled)
    {
        throw new InvalidOperationException("Demo seed requires Demo:Enabled.");
    }

    await using var scope = app.Services.CreateAsyncScope();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Seed");
    logger.LogInformation("Running demo seed command.");
    var runner = scope.ServiceProvider.GetRequiredService<DemoSeedRunner>();
    await runner.RunAsync(CancellationToken.None);
    return;
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler(new ExceptionHandlerOptions
{
    ExceptionHandler = async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature?.Error is not null)
        {
            await ExceptionMapping.WriteProblemAsync(context, feature.Error);
        }
    },
    // An answered client error is not a fault; only server failures are logged
    // as errors, with their exception.
    SuppressDiagnosticsCallback = context => ExceptionMapping.IsClientError(context.Exception),
});
app.UseStatusCodePages();
app.UseCors("Frontend");
app.UseHttpsRedirection();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "Healthy",
    service = "OpsBoard.Api",
    environment = app.Environment.EnvironmentName,
    // The full commit the image was built from (Build:Commit); `dev` otherwise.
    commit = app.Configuration["Build:Commit"] ?? "dev",
    utc = DateTime.UtcNow
}))
.WithName("GetHealth");

app.MapDomainEndpoints();
app.MapHub<IncidentsHub>("/hubs/incidents");

app.Run();

public partial class Program;
