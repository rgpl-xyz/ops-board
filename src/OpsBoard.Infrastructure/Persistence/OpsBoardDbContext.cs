using Microsoft.EntityFrameworkCore;
using OpsBoard.Domain.Entities;
using OpsBoard.Infrastructure.Persistence.Seed;

namespace OpsBoard.Infrastructure.Persistence;

public sealed class OpsBoardDbContext(DbContextOptions<OpsBoardDbContext> options) : DbContext(options)
{
    public DbSet<Organization> Organizations => Set<Organization>();

    public DbSet<Team> Teams => Set<Team>();

    public DbSet<User> Users => Set<User>();

    public DbSet<Service> Services => Set<Service>();

    public DbSet<Incident> Incidents => Set<Incident>();

    public DbSet<IncidentResponder> IncidentResponders => Set<IncidentResponder>();

    public DbSet<IncidentTimelineEntry> IncidentTimelineEntries => Set<IncidentTimelineEntry>();

    public DbSet<Postmortem> Postmortems => Set<Postmortem>();

    public DbSet<DemoSeedRun> DemoSeedRuns => Set<DemoSeedRun>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(OpsBoardDbContext).Assembly);
    }
}
