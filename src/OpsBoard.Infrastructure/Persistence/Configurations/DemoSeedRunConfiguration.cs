using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Infrastructure.Persistence.Seed;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class DemoSeedRunConfiguration : IEntityTypeConfiguration<DemoSeedRun>
{
    public void Configure(EntityTypeBuilder<DemoSeedRun> builder)
    {
        builder.ToTable("demo_seed_runs");
        builder.HasKey(x => x.SeedKey);
        builder.Property(x => x.SeedKey).HasColumnName("seed_key").HasMaxLength(64);
        builder.Property(x => x.FixtureVersion).HasColumnName("fixture_version").HasMaxLength(32).IsRequired();
        builder.Property(x => x.CompletedAt).HasColumnName("completed_at").IsRequired();
    }
}
