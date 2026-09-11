using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Application.Identity;
using OpsBoard.Infrastructure.Identity;
using OpsBoard.Infrastructure.Persistence.Seed;

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
        services.AddScoped<ICurrentUser, DemoCurrentUser>();
        services.AddScoped<DemoSeedRunner>();

        return services;
    }
}
