using System.Text.Json;
using OpsBoard.Application.Assistant;

namespace OpsBoard.Infrastructure.Assistant;

/// Answers without a model, for development, browser tests and demos without
/// a provider key. It writes a plain brief from the data it is given and goes
/// through the same checks as a real reply. Briefs from it are marked simulated.
public sealed class FakeInferenceClient : IInferenceClient
{
    private const int MaxExcerptLength = 160;

    public string ProviderName => "Fake provider";

    public string Model => "rule-based";

    public bool IsSimulated => true;

    public Task<InferenceResult> CompleteAsync(InferenceRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var data = JsonDocument.Parse(request.Data);
        var incident = data.RootElement.GetProperty("incident");
        var timeline = data.RootElement.GetProperty("timeline").EnumerateArray().TakeLast(4).ToList();

        object[] whatHappened = timeline.Count == 0
            ? [Statement("The incident was opened; no timeline entries are recorded yet.", "I")]
            : timeline.Select(Happened).ToArray();
        var reply = new
        {
            whatHappened,
            currentState = new[]
            {
                Statement(
                    $"{Excerpt(Text(incident, "title"))} is {Text(incident, "status")} at {Text(incident, "severity")} severity on {Text(incident, "service")}.",
                    "I"),
            },
            openQuestions = new[] { Statement("The timeline does not state a confirmed cause.") },
            suggestedChecks = new[] { Statement($"Confirm the current customer impact with the {Text(incident, "team")} team.") },
        };

        var content = JsonSerializer.Serialize(reply);
        return Task.FromResult(new InferenceResult(
            content,
            Model,
            (request.SystemPrompt.Length + request.Data.Length) / 4,
            content.Length / 4));
    }

    private static object Happened(JsonElement entry)
    {
        var change = Text(entry, "change");
        var text = Text(entry, "text");
        var detail = change.Length > 0 ? $" ({change})" : text.Length > 0 ? $": {Excerpt(text)}" : "";
        return Statement($"{Text(entry, "actor")} — {Text(entry, "event")}{detail}", Text(entry, "ref"));
    }

    private static object Statement(string text, params string[] refs) => new { text, refs };

    private static string Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()!
            : "";

    private static string Excerpt(string text) =>
        text.Length <= MaxExcerptLength ? text : text[..MaxExcerptLength].TrimEnd() + "…";
}
