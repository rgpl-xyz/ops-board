using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace OpsBoard.Infrastructure.Persistence;

public sealed class OpsBoardDbContextFactory : IDesignTimeDbContextFactory<OpsBoardDbContext>
{
    public OpsBoardDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__OpsBoard")
            ?? throw new InvalidOperationException(
                "Set ConnectionStrings__OpsBoard for design-time EF operations.");

        var options = new DbContextOptionsBuilder<OpsBoardDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new OpsBoardDbContext(options);
    }
}
