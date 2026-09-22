using Microsoft.EntityFrameworkCore;
using Npgsql;
using OpsBoard.Infrastructure.Persistence;
using Testcontainers.PostgreSql;
using Xunit;

namespace OpsBoard.IntegrationTests.Fixtures;

[CollectionDefinition("Postgres", DisableParallelization = true)]
public sealed class PostgresCollection : ICollectionFixture<PostgresFixture>;

public sealed class PostgresFixture : IAsyncLifetime, IDisposable
{
    /// Matches docker-compose.yml so migrations meet the engine used in development.
    private const string PostgresImage = "postgres:17-alpine";

    private const string MissingServerMessage =
        "Persistence tests need PostgreSQL. Either set OpsBoardTests__AdminConnection " +
        "(a CREATEDB-capable connection) or ConnectionStrings__OpsBoard, or make a container " +
        "runtime available so the suite can start " + PostgresImage + " itself.";

    private static string SuppliedServerUnreachable(string reason) =>
        OwnsServerNothing + reason;

    /// Named so a broken supplied connection is as legible as a missing one.
    private const string OwnsServerNothing =
        "Could not reach the PostgreSQL server supplied through " +
        "OpsBoardTests__AdminConnection or ConnectionStrings__OpsBoard. Check the value, or unset " +
        "both to let the suite start " + PostgresImage + " itself. Server reported: ";

    private string? _databaseName;
    private string? _adminConnectionString;
    private string? _appConnectionString;
    private PostgreSqlContainer? _ownedContainer;

    public string ConnectionString =>
        _appConnectionString ?? throw new InvalidOperationException("Fixture not initialized.");

    /// True when this fixture started the server it uses, rather than being given one.
    public bool OwnsServer => _ownedContainer is not null;

    public async Task InitializeAsync()
    {
        _adminConnectionString = await ResolveAdminConnectionAsync();

        _databaseName = $"opsboard_test_{Guid.NewGuid():N}";
        await using (var admin = new NpgsqlConnection(RewriteDatabase(_adminConnectionString, "postgres")))
        {
            try
            {
                await admin.OpenAsync();
            }
            catch (Exception error)
            {
                throw new InvalidOperationException(SuppliedServerUnreachable(error.Message), error);
            }

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
        try
        {
            await DropRunDatabaseAsync();
        }
        finally
        {
            if (_ownedContainer is not null)
            {
                await _ownedContainer.DisposeAsync();
                _ownedContainer = null;
            }
        }
    }

    public void Dispose()
    {
    }

    /// An explicitly supplied server is used as is; otherwise this fixture owns one.
    private async Task<string> ResolveAdminConnectionAsync()
    {
        var supplied = Environment.GetEnvironmentVariable("OpsBoardTests__AdminConnection")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__OpsBoard");

        if (!string.IsNullOrWhiteSpace(supplied))
        {
            return supplied;
        }

        var container = new PostgreSqlBuilder(PostgresImage).Build();

        try
        {
            await container.StartAsync();
        }
        catch (Exception error)
        {
            await container.DisposeAsync();
            throw new InvalidOperationException(MissingServerMessage, error);
        }

        _ownedContainer = container;
        return container.GetConnectionString();
    }

    private async Task DropRunDatabaseAsync()
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

    private static string RewriteDatabase(string connectionString, string database)
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString) { Database = database };
        return builder.ConnectionString;
    }
}
