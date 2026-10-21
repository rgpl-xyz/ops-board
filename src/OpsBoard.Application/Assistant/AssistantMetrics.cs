using System.Diagnostics.Metrics;

namespace OpsBoard.Application.Assistant;

/// Usage and cost of AI assistance. Tags carry outcomes and model names only,
/// never incident data or generated text.
public sealed class AssistantMetrics : IDisposable
{
    public const string MeterName = "OpsBoard.Assistant";

    private readonly Counter<long> _requests;
    private readonly Counter<long> _tokens;
    private readonly Counter<double> _cost;
    private readonly Histogram<double> _duration;
    private readonly Counter<long> _questions;
    private readonly Histogram<double> _questionDuration;
    private readonly Counter<long> _lookups;

    public AssistantMetrics()
    {
        Meter = new Meter(MeterName);
        _requests = Meter.CreateCounter<long>("opsboard.assistant.requests", description: "Brief requests by outcome.");
        _tokens = Meter.CreateCounter<long>("opsboard.assistant.tokens", "{token}", "Provider tokens by direction.");
        _cost = Meter.CreateCounter<double>("opsboard.assistant.estimated_cost", "USD", "Estimated provider cost.");
        _duration = Meter.CreateHistogram<double>("opsboard.assistant.duration", "s", "Time to answer a brief request.");
        _questions = Meter.CreateCounter<long>("opsboard.assistant.questions", description: "Questions by outcome.");
        _questionDuration = Meter.CreateHistogram<double>(
            "opsboard.assistant.question_duration", "s", "Time to answer a question.");
        _lookups = Meter.CreateCounter<long>(
            "opsboard.assistant.lookups", "{lookup}", "Related incidents read to answer questions.");
    }

    /// One instance per registration, so a test can listen to its own meter.
    public Meter Meter { get; }

    public void Record(string outcome, string provider, string model, TimeSpan elapsed)
    {
        var tags = Tags(provider, model, ("outcome", outcome));
        _requests.Add(1, tags);
        _duration.Record(elapsed.TotalSeconds, tags);
    }

    public void RecordQuestion(string outcome, string provider, string model, int lookups, TimeSpan elapsed)
    {
        var tags = Tags(provider, model, ("outcome", outcome));
        _questions.Add(1, tags);
        _questionDuration.Record(elapsed.TotalSeconds, tags);
        if (lookups > 0)
        {
            _lookups.Add(lookups, Tags(provider, model));
        }
    }

    public void RecordUsage(string provider, string model, int inputTokens, int outputTokens, decimal estimatedCostUsd)
    {
        _tokens.Add(inputTokens, Tags(provider, model, ("direction", "input")));
        _tokens.Add(outputTokens, Tags(provider, model, ("direction", "output")));
        _cost.Add((double)estimatedCostUsd, Tags(provider, model));
    }

    public void Dispose() => Meter.Dispose();

    private static KeyValuePair<string, object?>[] Tags(
        string provider,
        string model,
        params (string Key, string Value)[] extra) =>
        [
            new("provider", provider),
            new("model", model),
            .. extra.Select(e => new KeyValuePair<string, object?>(e.Key, e.Value)),
        ];
}
