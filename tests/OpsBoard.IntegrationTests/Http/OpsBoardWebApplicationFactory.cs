using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OpsBoard.Application.Realtime;
using OpsBoard.Infrastructure.Persistence.Seed;

namespace OpsBoard.IntegrationTests.Http;

internal sealed class OpsBoardWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;
    private readonly Guid _demoUserId;
    private readonly Action<IServiceCollection>? _configureServices;

    public OpsBoardWebApplicationFactory(
        string connectionString,
        Guid? demoUserId = null,
        Action<IServiceCollection>? configureServices = null)
    {
        _connectionString = connectionString;
        _demoUserId = demoUserId ?? SeedIds.DemoUser;
        _configureServices = configureServices;
    }


    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:OpsBoard", _connectionString);
        builder.UseSetting("Demo:Enabled", "true");
        builder.UseSetting("Demo:UserId", _demoUserId.ToString());
        builder.UseSetting(Microsoft.AspNetCore.Hosting.WebHostDefaults.EnvironmentKey, "Development");
        if (_configureServices is not null)
        {
            builder.ConfigureServices(_configureServices);
        }
    }
}

internal sealed class RecordingRealtimePublisher : IIncidentRealtimePublisher
{
    private readonly object _gate = new();
    public List<IncidentRealtimeFact> Facts { get; } = [];

    public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            Facts.Add(fact);
        }

        return Task.CompletedTask;
    }
}

internal sealed class ThrowingRealtimePublisher : IIncidentRealtimePublisher
{
    public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("SignalR notify failed");
}
