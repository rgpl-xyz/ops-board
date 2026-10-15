using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// Behind a proxy, a missing proxy setting fails nothing: every visitor just
/// shares one allowance. The API says so in its startup log instead.
[Collection("Postgres")]
[Trait("Category", "Http")]
public sealed class ProxyWarningTests(PostgresFixture fixture)
{
    [Theory]
    [InlineData("Production", "true", null, true)]
    [InlineData("Production", "true", "10.0.0.0/8", false)]
    [InlineData("Production", "false", null, false)]
    [InlineData("Development", "true", null, false)]
    public async Task Startup_warns_when_the_assistant_is_on_but_no_proxy_is_trusted(
        string environment,
        string assistantEnabled,
        string? knownNetworks,
        bool warns)
    {
        var logs = new CapturingLoggerProvider();
        var settings = new Dictionary<string, string?>
        {
            ["Assistant:Enabled"] = assistantEnabled,
            ["Assistant:Provider:Kind"] = "Fake",
        };
        if (knownNetworks is not null)
        {
            settings["ForwardedHeaders:KnownNetworks"] = knownNetworks;
        }

        await using var factory = new OpsBoardWebApplicationFactory(
            fixture.ConnectionString,
            configureServices: services => services.AddSingleton<ILoggerProvider>(logs),
            environment: environment,
            settings: settings);

        factory.CreateClient();

        Assert.Equal(
            warns,
            logs.AtLeast(LogLevel.Warning).Any(e => e.Message.Contains("ForwardedHeaders:KnownNetworks", StringComparison.Ordinal)));
    }
}
