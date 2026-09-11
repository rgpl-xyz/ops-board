namespace OpsBoard.Infrastructure.Persistence.Seed;

public sealed class DemoSeedRun
{
    public string SeedKey { get; set; } = null!;

    public string FixtureVersion { get; set; } = null!;

    public DateTimeOffset CompletedAt { get; set; }
}
