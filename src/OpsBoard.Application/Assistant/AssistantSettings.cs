namespace OpsBoard.Application.Assistant;

/// Limits for AI assistance. The feature is off unless configuration turns it on.
public sealed record AssistantSettings(
    bool Enabled,
    int DailyRequestLimit,
    int MaxConcurrentRequests,
    TimeSpan RequestTimeout,
    decimal InputUsdPerMillionTokens = 0,
    decimal OutputUsdPerMillionTokens = 0);
