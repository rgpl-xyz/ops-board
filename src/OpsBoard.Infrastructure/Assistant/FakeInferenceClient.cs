using System.Text.Json;
using OpsBoard.Application.Assistant;

namespace OpsBoard.Infrastructure.Assistant;

/// Answers without a model, for development, browser tests and demos without
/// a provider key. It writes a plain brief, or a plain answer to a question,
/// from the data it is given and goes through the same checks as a real
/// reply. Its text is marked simulated.
public sealed class FakeInferenceClient : IInferenceClient
{
    private const int MaxExcerptLength = 160;

    private const int MaxQuotedLength = 240;

    /// Words that send a question to the related incidents.
    private static readonly string[] AboutOtherIncidents =
        ["before", "again", "similar", "previous", "last time", "related", "happened"];

    public string ProviderName => "Fake provider";

    public string Model => "rule-based";

    public bool IsSimulated => true;

    public Task<InferenceResult> CompleteAsync(InferenceRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var data = JsonDocument.Parse(request.Data);
        var content = request.SchemaName == IncidentQuestionPrompt.SchemaName
            ? Answer(data.RootElement)
            : Brief(data.RootElement);
        return Task.FromResult(new InferenceResult(
            content,
            Model,
            (request.SystemPrompt.Length + request.Data.Length) / 4,
            content.Length / 4));
    }

    private static string Brief(JsonElement data)
    {
        var incident = data.GetProperty("incident");
        var timeline = data.GetProperty("timeline").EnumerateArray().TakeLast(4).ToList();

        object[] whatHappened = timeline.Count == 0
            ? [Statement("The incident was opened; no timeline entries are recorded yet.", "I")]
            : timeline.Select(Happened).ToArray();
        return JsonSerializer.Serialize(new
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
        });
    }

    /// A question about earlier or similar incidents reads the strongest
    /// related one, then answers from it; any other question gets the
    /// incident's current state.
    private static string Answer(JsonElement data)
    {
        var question = Text(data, "question").ToLowerInvariant();
        var related = data.GetProperty("relatedIncidents").EnumerateArray().FirstOrDefault();
        if (related.ValueKind == JsonValueKind.Object && AboutOtherIncidents.Any(question.Contains))
        {
            var reference = Text(related, "ref");
            if (related.GetProperty("read").ValueKind != JsonValueKind.Object)
            {
                if (data.GetProperty("lookupsAllowed").GetInt32() > 0)
                {
                    return Reply(
                        lookups: [new { tool = IncidentQuestionPrompt.ReadRelatedIncident, @ref = reference }],
                        answer: []);
                }
            }
            else
            {
                var sentences = new List<object>
                {
                    Statement($"{Quote(Text(related, "title"))} was {Text(related, "status")} on {Text(related, "service")}.", reference),
                };
                var postmortem = related.GetProperty("read").GetProperty("postmortem");
                if (postmortem.ValueKind == JsonValueKind.Object
                    && Text(postmortem, "resolution") is { Length: > 0 and <= MaxQuotedLength } resolution)
                {
                    sentences.Add(Statement($"Its postmortem resolution: {resolution}", reference));
                }

                return Reply(lookups: [], answer: sentences.ToArray());
            }
        }

        var incident = data.GetProperty("incident");
        return Reply(
            lookups: [],
            answer:
            [
                Statement(
                    $"{Quote(Text(incident, "title"))} is {Text(incident, "status")} at {Text(incident, "severity")} severity on {Text(incident, "service")}.",
                    "I"),
            ]);
    }

    private static string Reply(object[] lookups, object[] answer) => JsonSerializer.Serialize(new { lookups, answer });

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

    /// Cut at a word, so no number or name is left half quoted.
    private static string Quote(string text)
    {
        if (text.Length <= MaxExcerptLength)
        {
            return text;
        }

        var cut = text.LastIndexOf(' ', MaxExcerptLength);
        return text[..(cut > 0 ? cut : MaxExcerptLength)] + "…";
    }
}
