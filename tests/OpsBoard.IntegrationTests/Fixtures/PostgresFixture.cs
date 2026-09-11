using Microsoft.EntityFrameworkCore;
using Npgsql;
using OpsBoard.Infrastructure.Persistence;
using Xunit;

namespace OpsBoard.IntegrationTests.Fixtures;

[CollectionDefinition("Postgres", DisableParallelization = true)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>;

public sealed class PostgresFixture : IAsyncLifetime, IDisposable
{
    private string? _databaseName;
    private string? _adminConnectionString;
    private string? _appConnectionString;

    public string ConnectionString =>
        _appConnectionString ?? throw new InvalidOperationException("Fixture not initialized.");

    public async Task InitializeAsync()
    {
        _adminConnectionString = Environment.GetEnvironmentVariable("OpsBoardTests__AdminConnection")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__OpsBoard")
            ?? throw new InvalidOperationException(
                "Set OpsBoardTests__AdminConnection (CREATEDB) or ConnectionStrings__OpsBoard for persistence tests.");

        _databaseName = $"opsboard_test_{Guid.NewGuid():N}";
        await using (var admin = new NpgsqlConnection(RewriteDatabase(_adminConnectionString, "postgres")))
        {
            await admin.OpenAsync();
            await using var create = admin.CreateCommand();
            create.CommandText = $"CREATE DATABASE \"{_databaseName}\"";
            await create.ExecuteNonQueryAsync();
        }

        _appConnectionString = RewriteDatabase(_adminConnectionString, _databaseName);
        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }

    public OpsBoardDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<OpsBoardDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new OpsBoardDbContext(options);
    }

    public async Task DisposeAsync()
    {
        if (_databaseName is null || _adminConnectionString is null)
        {
            return;
        }

        if (!_databaseName.StartsWith("opsboard_test_", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Refusing to drop unexpected database name.");
        }

        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(RewriteDatabase(_adminConnectionString, "postgres"));
        await admin.OpenAsync();
        await using (var terminate = admin.CreateCommand())
        {
            terminate.CommandText =
                $"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{_databaseName}' AND pid <> pg_backend_pid();";
            await terminate.ExecuteNonQueryAsync();
        }

        await using (var drop = admin.CreateCommand())
        {
            drop.CommandText = $"DROP DATABASE IF EXISTS \"{_databaseName}\"";
            await drop.ExecuteNonQueryAsync();
        }
    }

    public void Dispose()
    {
    }

    private static string RewriteDatabase(string connectionString, string database)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString) { Database = database };
        return builder.ConnectionString;
    }
}
