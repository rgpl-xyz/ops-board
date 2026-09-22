using Xunit;

namespace OpsBoard.IntegrationTests.Fixtures;

[Collection("Postgres")]
public sealed class PostgresFixtureTests(PostgresFixture fixture)
{
    /// Proves the fast path: a supplied server is used as is and nothing is started.
    [Fact]
    public void Fixture_owns_its_server_only_when_none_was_supplied()
    {
        var supplied = Environment.GetEnvironmentVariable("OpsBoardTests__AdminConnection")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__OpsBoard");
        var wasSupplied = !string.IsNullOrWhiteSpace(supplied);

        Assert.Equal(!wasSupplied, fixture.OwnsServer);
    }

    [Fact]
    public void Fixture_runs_against_its_own_scratch_database()
    {
        Assert.Contains("opsboard_test_", fixture.ConnectionString, StringComparison.Ordinal);
    }
}
