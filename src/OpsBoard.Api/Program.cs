using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Diagnostics;
using OpsBoard.Api.Errors;
using OpsBoard.Application;
using OpsBoard.Infrastructure;
using OpsBoard.Infrastructure.Persistence.Seed;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddSignalR();
builder.Services.AddProblemDetails();
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

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature?.Error is not null)
        {
            await ExceptionMapping.WriteProblemAsync(context, feature.Error);
        }
    });
});
app.UseStatusCodePages();
app.UseCors("Frontend");
app.UseHttpsRedirection();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "Healthy",
    service = "OpsBoard.Api",
    environment = app.Environment.EnvironmentName,
    utc = DateTime.UtcNow
}))
.WithName("GetHealth");

app.Run();

public partial class Program;
