using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using OpsBoard.Application.Assistant;

namespace OpsBoard.Infrastructure.Assistant;

/// Reads the Assistant section. The feature is off unless Assistant:Enabled is
/// true, and turning it on requires an explicit provider, so production never
/// falls back to the fake by accident.
public static class AssistantRegistration
{
    public const string FakeKind = "Fake";
    public const string OpenAiCompatibleKind = "OpenAiCompatible";

    public static IServiceCollection AddAssistant(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("Assistant");
        var settings = new AssistantSettings(
            Enabled: ReadBool(section, "Enabled", fallback: false),
            DailyRequestLimit: ReadInt(section, "DailyRequestLimit", fallback: 50, minimum: 0),
            MaxConcurrentRequests: ReadInt(section, "MaxConcurrentRequests", fallback: 2, minimum: 1),
            RequestTimeout: TimeSpan.FromSeconds(ReadInt(section, "RequestTimeoutSeconds", fallback: 30, minimum: 1)),
            InputUsdPerMillionTokens: ReadDecimal(section, "Provider:InputUsdPerMillionTokens"),
            OutputUsdPerMillionTokens: ReadDecimal(section, "Provider:OutputUsdPerMillionTokens"));

        services.AddSingleton(settings);
        services.AddSingleton<IncidentBriefCache>();
        services.AddSingleton<AssistantUsageGate>();
        services.AddSingleton<AssistantMetrics>();
        services.AddScoped<IncidentBriefService>();

        var provider = section.GetSection("Provider");
        var kind = provider["Kind"];
        if (string.Equals(kind, OpenAiCompatibleKind, StringComparison.Ordinal))
        {
            var options = ReadProvider(provider);
            services.AddSingleton<IInferenceClient>(sp => new OpenAiCompatibleInferenceClient(
                CreateHttpClient(),
                options,
                sp.GetRequiredService<ILogger<OpenAiCompatibleInferenceClient>>()));
        }
        else if (string.Equals(kind, FakeKind, StringComparison.Ordinal) || (string.IsNullOrEmpty(kind) && !settings.Enabled))
        {
            // With the feature off nothing calls it; it only completes the service graph.
            services.AddSingleton<IInferenceClient, FakeInferenceClient>();
        }
        else
        {
            throw new InvalidOperationException(
                $"Assistant:Provider:Kind must be {FakeKind} or {OpenAiCompatibleKind} when Assistant:Enabled is true.");
        }

        return services;
    }

    private static OpenAiCompatibleOptions ReadProvider(IConfigurationSection provider)
    {
        var baseUrlText = provider["BaseUrl"];
        if (!Uri.TryCreate(baseUrlText, UriKind.Absolute, out var baseUrl)
            || (baseUrl.Scheme != Uri.UriSchemeHttps && !baseUrl.IsLoopback))
        {
            throw new InvalidOperationException("Assistant:Provider:BaseUrl must be an absolute https URL.");
        }

        if (!baseUrl.AbsoluteUri.EndsWith('/'))
        {
            baseUrl = new Uri(baseUrl.AbsoluteUri + "/");
        }

        var model = provider["Model"];
        if (string.IsNullOrWhiteSpace(model))
        {
            throw new InvalidOperationException("Assistant:Provider:Model is required.");
        }

        // Required for hosted providers; a local server on loopback may not use one.
        var apiKey = provider["ApiKey"] ?? "";
        if (apiKey.Length == 0 && !baseUrl.IsLoopback)
        {
            throw new InvalidOperationException("Assistant:Provider:ApiKey is required for a hosted provider.");
        }

        return new OpenAiCompatibleOptions(
            string.IsNullOrWhiteSpace(provider["Name"]) ? baseUrl.Host : provider["Name"]!,
            baseUrl,
            model,
            apiKey,
            ReadBool(provider, "SupportsStrictSchema", fallback: false),
            provider["ReasoningEffort"],
            TimeSpan.FromSeconds(ReadInt(provider, "TimeoutSeconds", fallback: 20, minimum: 1)));
    }

    /// One long-lived client; the handler recycles connections so DNS changes are seen.
    private static HttpClient CreateHttpClient() =>
        new(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) })
        {
            // The client applies its own deadline per call.
            Timeout = Timeout.InfiniteTimeSpan,
        };

    private static bool ReadBool(IConfiguration section, string key, bool fallback) =>
        section[key] is { } text
            ? bool.TryParse(text, out var value)
                ? value
                : throw new InvalidOperationException($"Assistant setting {key} must be true or false.")
            : fallback;

    private static int ReadInt(IConfiguration section, string key, int fallback, int minimum) =>
        section[key] is { } text
            ? int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) && value >= minimum
                ? value
                : throw new InvalidOperationException($"Assistant setting {key} must be a whole number of at least {minimum}.")
            : fallback;

    private static decimal ReadDecimal(IConfiguration section, string key) =>
        section[key] is { } text
            ? decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) && value >= 0
                ? value
                : throw new InvalidOperationException($"Assistant setting {key} must be a non-negative number.")
            : 0;
}
