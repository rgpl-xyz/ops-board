using System.Globalization;
using System.Text.Json;

namespace OpsBoard.Application.Assistant;

/// Fills in a fact's references where the model left one out. When a fact
/// repeats a number, clock time or person's name that none of its cited
/// records holds, and exactly one record the model was sent does, that record
/// is added to the fact's references. The text is never changed and only
/// records the model was sent can be added, so a hostile reply gains nothing:
/// at worst a fact points at one more record the reader can already see.
public static class IncidentBriefCitations
{
    /// <returns>The brief with completed references, and how many were added.</returns>
    public static (ParsedBrief Brief, int Added) Complete(ParsedBrief brief, IncidentBriefContext context)
    {
        var (records, people) = ReadRecords(context.DataJson);
        var order = context.Sources
            .Select((source, index) => (source.Ref, index))
            .ToDictionary(x => x.Ref, x => x.index, StringComparer.Ordinal);
        var added = 0;

        IReadOnlyList<BriefStatementDto> Fill(IReadOnlyList<BriefStatementDto> statements) =>
            statements.Select(statement =>
            {
                var refs = statement.Refs.ToList();
                foreach (var detail in RecordDetails.Details(statement.Text, people, distinctiveNumbersOnly: true))
                {
                    if (refs.Any(r => records.TryGetValue(r, out var held) && held.Contains(detail)))
                    {
                        continue;
                    }

                    var holders = records.Where(r => r.Value.Contains(detail)).Select(r => r.Key).Take(2).ToList();
                    if (holders.Count == 1 && refs.Count < IncidentBriefPrompt.MaxRefsPerStatement)
                    {
                        refs.Add(holders[0]);
                        added++;
                    }
                }

                return refs.Count == statement.Refs.Count
                    ? statement
                    : statement with { Refs = refs.OrderBy(r => order.GetValueOrDefault(r, int.MaxValue)).ToList() };
            }).ToList();

        var completed = brief with { WhatHappened = Fill(brief.WhatHappened), CurrentState = Fill(brief.CurrentState) };
        return (completed, added);
    }

    /// The details each record holds, keyed by its reference, read from the
    /// same data document the model was sent.
    private static (Dictionary<string, HashSet<string>> Records, IReadOnlyList<string> People) ReadRecords(string dataJson)
    {
        using var document = JsonDocument.Parse(dataJson);
        var root = document.RootElement;
        var incident = root.GetProperty("incident");
        var timeline = root.GetProperty("timeline").EnumerateArray().ToList();
        var people = timeline
            .Select(entry => Text(entry, "actor"))
            .OfType<string>()
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var records = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal)
        {
            [IncidentBriefContext.IncidentRef] = RecordDetails.Held(
                [Text(incident, "title"), Text(incident, "description"), Text(incident, "service"), Text(incident, "team")],
                Times(Text(incident, "openedAt"), Text(incident, "resolvedAt")),
                [],
                people),
        };
        foreach (var entry in timeline)
        {
            records[Text(entry, "ref")!] = RecordDetails.Held(
                [Text(entry, "text"), Text(entry, "change")],
                Times(Text(entry, "at")),
                Text(entry, "actor") is { } actor ? [actor] : [],
                people);
        }

        return (records, people);
    }

    private static IEnumerable<DateTimeOffset> Times(params string?[] timestamps)
    {
        foreach (var timestamp in timestamps.OfType<string>())
        {
            if (DateTimeOffset.TryParse(timestamp, CultureInfo.InvariantCulture, DateTimeStyles.None, out var at))
            {
                yield return at;
            }
        }
    }

    private static string? Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
