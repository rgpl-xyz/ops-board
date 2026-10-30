using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace OpsBoard.IntegrationTests.LiveEval;

internal enum DetailKind
{
    Time,
    Number,
    Person,
}

internal readonly record struct Detail(DetailKind Kind, string Value);

/// One brief's tally. Each finding names a miss and the statement it came from.
internal sealed record BriefScore(
    int Statements,
    int Details,
    int Cited,
    int Uncited,
    int Unsupported,
    int InlineRefs,
    IReadOnlyList<string> Findings);

/// The live evaluation's own reading of a brief, kept apart from the server's
/// checks so it can catch what they let through. Each time, number and person in
/// a fact statement is cited when a record the statement cites holds it, uncited
/// when only another record does, and unsupported when no record does: invented,
/// or worked out by the model.
internal static partial class CitationScorer
{
    private static readonly string[] FactSections = ["whatHappened", "currentState"];
    private static readonly string[] AllSections = ["whatHappened", "currentState", "openQuestions", "suggestedChecks"];
    private static readonly HashSet<string> IncidentTextKeys = ["title", "description", "serviceName", "teamName"];
    private static readonly HashSet<string> EntryTextKeys = ["body"];

    /// The timeline is newest first, as the API pages it.
    public static BriefScore Score(JsonElement incident, IReadOnlyList<JsonElement> timeline, JsonElement brief)
    {
        var names = timeline.Select(Actor).OfType<string>().ToHashSet();
        var sources = Sources(incident, timeline, brief.GetProperty("omittedTimelineEntries").GetInt32(), names);
        int statements = 0, details = 0, cited = 0, uncited = 0, unsupported = 0;
        var findings = new List<string>();

        foreach (var statement in Statements(brief, FactSections))
        {
            statements++;
            var text = Text(statement, "text");
            var refs = statement.GetProperty("refs").EnumerateArray().Select(r => r.GetString()!).ToList();
            var citedSources = refs.Where(sources.ContainsKey).Select(r => sources[r]).ToList();
            foreach (var detail in Details(text, names))
            {
                details++;
                if (citedSources.Any(s => s.Contains(detail)))
                {
                    cited++;
                    continue;
                }

                var holders = sources.Where(s => s.Value.Contains(detail)).Select(s => s.Key).ToList();
                if (holders.Count > 0)
                {
                    uncited++;
                    findings.Add($"uncited {detail.Value} (in {string.Join(",", holders)}; cites {string.Join(",", refs)}) | {text}");
                }
                else
                {
                    unsupported++;
                    findings.Add($"unsupported {detail.Value} | {text}");
                }
            }
        }

        var inline = Statements(brief, AllSections).Select(s => Text(s, "text")).Where(t => InlineRef().IsMatch(t)).ToList();
        findings.AddRange(inline.Select(t => $"reference in the text | {t}"));
        return new BriefScore(statements, details, cited, uncited, unsupported, inline.Count, findings);
    }

    private static Dictionary<string, HashSet<Detail>> Sources(
        JsonElement incident, IReadOnlyList<JsonElement> timeline, int omitted, HashSet<string> names)
    {
        var sources = new Dictionary<string, HashSet<Detail>>
        {
            ["I"] = [.. RecordDetails(incident, IncidentTextKeys), .. People($"{Text(incident, "title")} {Text(incident, "description")}", names)],
        };

        // The brief numbers the entries it was sent oldest first, after the omitted oldest ones.
        var number = 0;
        foreach (var entry in timeline.Reverse().Skip(omitted))
        {
            HashSet<Detail> held = [.. RecordDetails(entry, EntryTextKeys), .. People(Text(entry, "body"), names)];
            if (Actor(entry) is { } actor)
            {
                held.Add(new Detail(DetailKind.Person, actor));
            }

            sources[$"T{++number}"] = held;
        }

        return sources;
    }

    private static HashSet<Detail> Details(string text, HashSet<string> names) =>
        [.. Times(text), .. Numbers(text, distinctiveOnly: true), .. People(text, names)];

    /// Times from every text field and timestamp; numbers only from the fields that carry prose.
    private static IEnumerable<Detail> RecordDetails(JsonElement record, HashSet<string> textKeys)
    {
        foreach (var property in record.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String || SkippedKey().IsMatch(property.Name))
            {
                continue;
            }

            var value = property.Value.GetString()!;
            // A timestamp's T joins the date to the time, which hides the time from \b.
            foreach (var time in Times(value.Replace('T', ' ')))
            {
                yield return time;
            }

            if (!textKeys.Contains(property.Name))
            {
                continue;
            }

            foreach (var detail in Times(value).Concat(Numbers(value, distinctiveOnly: false)))
            {
                yield return detail;
            }
        }
    }

    private static IEnumerable<Detail> Times(string text) =>
        Time().Matches(Clean(text)).Select(m =>
            new Detail(DetailKind.Time, $"{int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture):00}:{m.Groups[2].Value}"));

    private static IEnumerable<Detail> Numbers(string text, bool distinctiveOnly)
    {
        foreach (Match match in Number().Matches(Time().Replace(Clean(text), " ")))
        {
            var digits = match.Groups[1].Value;
            var suffix = match.Groups[2].Value;
            var value = double.Parse(digits.Replace(",", ""), CultureInfo.InvariantCulture);
            if (suffix.Equals("k", StringComparison.OrdinalIgnoreCase))
            {
                value *= 1000;
            }

            // Small whole numbers, as in "3 regions", say too little to check.
            if (distinctiveOnly && value <= 9 && !digits.Contains('.') && suffix.Length == 0)
            {
                continue;
            }

            yield return new Detail(DetailKind.Number, value.ToString("R", CultureInfo.InvariantCulture));
        }
    }

    /// Timeline actors the text names, by full or first name.
    private static IEnumerable<Detail> People(string text, HashSet<string> names)
    {
        var clean = Clean(text);
        return names
            .Where(name => Regex.IsMatch(clean, $@"\b{Regex.Escape(name.Split(' ')[0])}\b"))
            .Select(name => new Detail(DetailKind.Person, name));
    }

    private static IEnumerable<JsonElement> Statements(JsonElement brief, string[] sections) =>
        sections.SelectMany(section => brief.GetProperty(section).EnumerateArray());

    private static string Text(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : "";

    private static string? Actor(JsonElement entry) =>
        Text(entry, "actorDisplayName") is { Length: > 0 } name ? name : null;

    private static string Clean(string text) =>
        DashLike().Replace(text.Normalize(NormalizationForm.FormKC), "-");

    [GeneratedRegex(@"\b(\d{1,2}):(\d{2})\b", RegexOptions.CultureInvariant)]
    private static partial Regex Time();

    [GeneratedRegex(@"(?<![\w.])(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k\b|%)?", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Number();

    /// Identifiers and revision tokens hold digits that are not details.
    [GeneratedRegex("(id|version)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SkippedKey();

    /// A citation written into the text, such as "(T2)" or "[I, T3]", instead of in refs.
    [GeneratedRegex(@"[(\[]\s*(?:I|P|T\d+|R\d+)(?:\s*[,;]\s*(?:I|P|T\d+|R\d+))*\s*[)\]]", RegexOptions.CultureInvariant)]
    private static partial Regex InlineRef();

    [GeneratedRegex(@"[‐-―−]", RegexOptions.CultureInvariant)]
    private static partial Regex DashLike();
}
