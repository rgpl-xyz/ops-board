using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Lookups;
using OpsBoard.Application.Services;
using OpsBoard.Infrastructure.Identity;
using OpsBoard.Infrastructure.Lookups;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Persistence.Seed;
using OpsBoard.Infrastructure.Services;

namespace OpsBoard.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("OpsBoard")
            ?? throw new InvalidOperationException("ConnectionStrings:OpsBoard is required.");

        services.AddDbContext<OpsBoardDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddSingleton(TimeProvider.System);
        services.AddScoped<ICurrentUser, DemoCurrentUser>();
        services.AddScoped<ILookupData, LookupData>();
        services.AddScoped<IServiceData, ServiceData>();
        services.AddScoped<LookupService>();
        services.AddScoped<ServiceService>();
        services.AddScoped<DemoSeedRunner>();

        return services;
    }
}
