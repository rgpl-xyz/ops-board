using OpsBoard.Infrastructure;

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

builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseExceptionHandler();
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
