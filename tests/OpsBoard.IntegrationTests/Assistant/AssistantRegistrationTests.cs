using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using OpsBoard.Application.Assistant;
using OpsBoard.Infrastructure.Assistant;
using Xunit;

namespace OpsBoard.IntegrationTests.Assistant;

/// Configuration mistakes fail at startup rather than at the first brief.
[Trait("Category", "Assistant")]
public sealed class AssistantRegistrationTests
{
    [Fact]
    public void Without_settings_the_assistant_is_off()
    {
        var provider = Build([]);

        Assert.False(provider.GetRequiredService<AssistantSettings>().Enabled);
    }

    [Fact]
    public void Turning_it_on_without_naming_a_provider_is_refused()
    {
        var error = Assert.Throws<InvalidOperationException>(() => Build(new() { ["Assistant:Enabled"] = "true" }));

        Assert.Contains("Assistant:Provider:Kind", error.Message);
    }

    [Theory]
    [InlineData("https://api.groq.com/openai/v1", "", "ApiKey")]
    [InlineData("http://api.groq.com/openai/v1", "key", "https")]
    [InlineData("not a url", "key", "BaseUrl")]
    public void A_hosted_provider_needs_https_and_a_key(string baseUrl, string apiKey, string named)
    {
        var error = Assert.Throws<InvalidOperationException>(() => Build(Hosted(baseUrl, apiKey)));

        Assert.Contains(named, error.Message);
        Assert.DoesNotContain("key-value", error.Message);
    }

    [Fact]
    public void A_complete_provider_is_used_with_its_display_name_and_model()
    {
        var client = Build(Hosted("https://api.groq.com/openai/v1", "key-value"))
            .GetRequiredService<IInferenceClient>();

        Assert.IsType<OpenAiCompatibleInferenceClient>(client);
        Assert.Equal("Groq", client.ProviderName);
        Assert.Equal("openai/gpt-oss-120b", client.Model);
        Assert.False(client.IsSimulated);
    }

    [Fact]
    public void The_fake_provider_is_used_only_when_asked_for_and_says_it_is_simulated()
    {
        var client = Build(new() { ["Assistant:Enabled"] = "true", ["Assistant:Provider:Kind"] = "Fake" })
            .GetRequiredService<IInferenceClient>();

        Assert.True(client.IsSimulated);
    }

    private static Dictionary<string, string?> Hosted(string baseUrl, string apiKey) => new()
    {
        ["Assistant:Enabled"] = "true",
        ["Assistant:Provider:Kind"] = "OpenAiCompatible",
        ["Assistant:Provider:Name"] = "Groq",
        ["Assistant:Provider:BaseUrl"] = baseUrl,
        ["Assistant:Provider:Model"] = "openai/gpt-oss-120b",
        ["Assistant:Provider:ApiKey"] = apiKey,
    };

    private static ServiceProvider Build(Dictionary<string, string?> settings)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var services = new ServiceCollection();
        services.AddSingleton<ILoggerFactory>(NullLoggerFactory.Instance);
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        services.AddAssistant(configuration);
        return services.BuildServiceProvider();
    }
}
