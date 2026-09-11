using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace OpsBoard.Infrastructure.Persistence.Seed;

public sealed class DemoSeedRunner(OpsBoardDbContext db, ILogger<DemoSeedRunner> logger)
{
    // Fixed advisory lock key reserved for seed initialization.
    private const long AdvisoryLockKey = 7462839102;

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock({0})",
            AdvisoryLockKey);

        var existingMarker = await db.DemoSeedRuns
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.SeedKey == SeedIds.SeedKey, cancellationToken);
        if (existingMarker is not null)
        {
            logger.LogInformation("Demo seed marker {SeedKey} already present; skipping.", SeedIds.SeedKey);
            await tx.CommitAsync(cancellationToken);
            return;
        }

        var acmeExists = await db.Organizations.AnyAsync(x => x.Id == SeedIds.Acme, cancellationToken);
        if (acmeExists)
        {
            throw new InvalidOperationException(
                "Acme organization exists without demo seed marker; refusing to merge or overwrite.");
        }

        var model = DemoSeedFixture.Build();
        db.Organizations.Add(model.Organization);
        db.Teams.AddRange(model.Teams);
        db.Users.AddRange(model.Users);
        db.Services.AddRange(model.Services);
        db.Incidents.AddRange(model.Incidents);
        db.IncidentResponders.AddRange(model.Responders);
        db.IncidentTimelineEntries.AddRange(model.History);
        db.Postmortems.AddRange(model.Postmortems);
        db.DemoSeedRuns.Add(new DemoSeedRun
        {
            SeedKey = SeedIds.SeedKey,
            FixtureVersion = SeedIds.FixtureVersion,
            CompletedAt = SeedIds.Epoch
        });

        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        logger.LogInformation("Demo seed {SeedKey} completed.", SeedIds.SeedKey);
    }
}
