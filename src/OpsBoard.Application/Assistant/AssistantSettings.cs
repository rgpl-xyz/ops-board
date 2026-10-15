namespace OpsBoard.Application.Assistant;

/// Limits for AI assistance. The feature is off unless configuration turns it on.
/// VisitorRequestLimit bounds the new briefs one visitor may start within
/// VisitorWindowMinutes, so no single visitor can spend the shared daily limit.
public sealed record AssistantSettings(
    bool Enabled,
    int DailyRequestLimit,
    int MaxConcurrentRequests,
    TimeSpan RequestTimeout,
    decimal InputUsdPerMillionTokens = 0,
    decimal OutputUsdPerMillionTokens = 0,
    int VisitorRequestLimit = 5,
    int VisitorWindowMinutes = 10)
{
    public TimeSpan VisitorWindow => TimeSpan.FromMinutes(VisitorWindowMinutes);
}
