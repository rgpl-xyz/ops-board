namespace OpsBoard.Infrastructure.Persistence.Seed;

public static class SeedIds
{
    public static Guid D(int kind, int n)
    {
        // UUID 10000000-0000-4000-8000- + 12 hex digits of (kind * 65536 + n)
        var value = (kind * 65536L) + n;
        var hex = value.ToString("x12");
        return Guid.Parse($"10000000-0000-4000-8000-{hex}");
    }

    public static readonly Guid Acme = D(1, 1);
    public static readonly Guid DemoUser = D(3, 1);

    public const string SeedKey = "acme-v1";
    public const string FixtureVersion = "acme-v1";
    public static readonly DateTimeOffset Epoch = new(2026, 8, 1, 8, 0, 0, TimeSpan.Zero);
    public static readonly DateTimeOffset ActiveEpoch = new(2026, 9, 10, 8, 0, 0, TimeSpan.Zero);
}
