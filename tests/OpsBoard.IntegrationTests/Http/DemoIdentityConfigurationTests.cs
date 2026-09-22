using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Infrastructure.Persistence.Seed;
using Xunit;

namespace OpsBoard.IntegrationTests.Http;

/// The shipped configuration must name a user the seed actually creates.
/// Nothing asserted this before: the frontend specs use fakes and the other
/// integration tests pass a user id explicitly, so a malformed
/// <c>Demo:UserId</c> made every request unauthorized when the application was
/// run as its setup documents.
[Trait("Category", "Configuration")]
public sealed class DemoIdentityConfigurationTests
{
    [Fact]
    public void The_configured_demo_user_is_the_seeded_demo_user()
    {
        using var factory = new WebApplicationFactory<Program>();
        var configured = factory.Services.GetRequiredService<IConfiguration>()["Demo:UserId"];

        Assert.False(
            string.IsNullOrWhiteSpace(configured),
            "Demo:UserId must be configured for the demo identity to resolve.");
        Assert.True(
            Guid.TryParse(configured, out var configuredId),
            $"Demo:UserId must be a GUID but was '{configured}'.");
        Assert.Equal(SeedIds.DemoUser, configuredId);
    }

    [Fact]
    public void The_demo_identity_is_enabled_by_default()
    {
        using var factory = new WebApplicationFactory<Program>();
        var enabled = factory.Services.GetRequiredService<IConfiguration>()["Demo:Enabled"];

        Assert.True(
            bool.TryParse(enabled, out var isEnabled) && isEnabled,
            $"Demo:Enabled must be true for the demo identity to resolve but was '{enabled}'.");
    }
}
