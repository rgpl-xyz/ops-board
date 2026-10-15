using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace OpsBoard.Application.Assistant;

/// Fills in a fact's references where the model left one out. When a fact
/// repeats a number, clock time or person's name that none of its cited
/// records holds, and exactly one record the model was sent does, that record
/// is added to the fact's references. The text is never changed and only
/// records the model was sent can be added, so a hostile reply gains nothing:
/// at worst a fact points at one more record the reader can already see.
public static partial class IncidentBriefCitations
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
                foreach (var detail in Details(statement.Text, people, distinctiveNumbersOnly: true))
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
            [IncidentBriefContext.IncidentRef] = Held(
                [Text(incident, "title"), Text(incident, "description"), Text(incident, "service"), Text(incident, "team")],
                [Text(incident, "openedAt"), Text(incident, "resolvedAt")],
                actor: null,
                people),
        };
        foreach (var entry in timeline)
        {
            records[Text(entry, "ref")!] = Held(
                [Text(entry, "text"), Text(entry, "change")],
                [Text(entry, "at")],
                Text(entry, "actor"),
                people);
        }

        return (records, people);
    }

    private static HashSet<string> Held(string?[] texts, string?[] timestamps, string? actor, IReadOnlyList<string> people)
    {
        var held = texts.OfType<string>()
            .SelectMany(text => Details(text, people, distinctiveNumbersOnly: false))
            .ToHashSet(StringComparer.Ordinal);
        foreach (var timestamp in timestamps.OfType<string>())
        {
            if (DateTimeOffset.TryParse(timestamp, CultureInfo.InvariantCulture, DateTimeStyles.None, out var at))
            {
                held.Add("time:" + at.ToString("HH:mm", CultureInfo.InvariantCulture));
            }
        }

        if (actor is not null)
        {
            held.Add("person:" + actor);
        }

        return held;
    }

    /// Clock times, numbers and people's names in a text, as comparable keys.
    /// A fact's small whole numbers are too common to point at one record.
    private static IEnumerable<string> Details(string text, IReadOnlyList<string> people, bool distinctiveNumbersOnly)
    {
        text = text.Normalize(NormalizationForm.FormKC);
        foreach (Match time in ClockTime().Matches(text))
        {
            yield return $"time:{int.Parse(time.Groups[1].Value, CultureInfo.InvariantCulture):00}:{time.Groups[2].Value}";
        }

        foreach (Match number in Number().Matches(ClockTime().Replace(text, " ")))
        {
            var digits = number.Groups[1].Value;
            var suffix = number.Groups[2].Value;
            var value = double.Parse(digits.Replace(",", "", StringComparison.Ordinal), CultureInfo.InvariantCulture);
            if (suffix.Equals("k", StringComparison.OrdinalIgnoreCase))
            {
                value *= 1000;
            }

            if (!distinctiveNumbersOnly || value > 9 || digits.Contains('.', StringComparison.Ordinal) || suffix.Length > 0)
            {
                yield return "number:" + value.ToString("R", CultureInfo.InvariantCulture);
            }
        }

        foreach (var person in Mentioned(text, people))
        {
            yield return "person:" + person;
        }
    }

    /// People named in full, or by a first name no one else in the incident shares.
    private static IEnumerable<string> Mentioned(string text, IReadOnlyList<string> people)
    {
        foreach (var person in people)
        {
            var first = person.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0];
            var unique = people.Count(p => p.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0] == first) == 1;
            if (Contains(text, person) || (unique && Contains(text, first)))
            {
                yield return person;
            }
        }
    }

    private static bool Contains(string text, string word) =>
        Regex.IsMatch(text, $@"(?<!\w){Regex.Escape(word)}(?!\w)", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

    private static string? Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    [GeneratedRegex(@"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)", RegexOptions.CultureInvariant)]
    private static partial Regex ClockTime();

    [GeneratedRegex(@"(?<![\w.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k\b|%)?", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex Number();
}
