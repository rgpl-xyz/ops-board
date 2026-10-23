using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using OpsBoard.Application.Incidents;

namespace OpsBoard.Application.Assistant;

/// What a related incident's lookup read, for the organization of the person asking.
public sealed record RelatedIncidentRead(
    IncidentDetailDto Detail,
    IReadOnlyList<TimelineEntryDto> NewestFirst,
    PostmortemDto? Postmortem);

/// The text, times and people of one record the model was sent, which a
/// sentence citing it is checked against.
public sealed record AnswerRecord(
    IReadOnlyList<string> Texts,
    IReadOnlyList<DateTimeOffset> Times,
    IReadOnlyList<string> People);

/// The data a question is answered from, as the model sees it, and the
/// records its references resolve to. Beside the brief's "I" and "T1".."Tn",
/// "P" is the incident's postmortem and "R1".."R5" its related incidents,
/// strongest first. A related incident is named only by such a label: the
/// model never sees an incident ID, so it cannot ask for one it was not offered.
public sealed class IncidentQuestionContext
{
    public const string PostmortemRef = "P";

    // Smaller than a brief's: a question may take two provider calls, and both
    // must fit a free tier's tokens per minute.
    private const int MaxTimelineLength = 4_000;
    private const int MaxDescriptionLength = 2_000;
    private const int MaxTitleLength = 300;
    private const int MaxNameLength = 120;
    private const int MaxFieldLength = 300;
    private const int MaxActionItemLength = 200;
    private const int MaxActionItems = 3;
    private const int MaxReadDescriptionLength = 800;
    private const int MaxReadTimelineLength = 1_500;
    private const int MaxReadEntryLength = 300;
    private const int MaxSourceDetailLength = 500;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly string _question;
    private readonly object _incident;
    private readonly IReadOnlyList<object> _timeline;
    private readonly int _omitted;
    private readonly object? _postmortem;
    private readonly IReadOnlyList<Related> _related;
    private readonly IReadOnlyDictionary<string, BriefSourceDto> _sources;
    private readonly IReadOnlyDictionary<string, AnswerRecord> _records;

    private IncidentQuestionContext(
        string question,
        object incident,
        IReadOnlyList<object> timeline,
        int omitted,
        object? postmortem,
        IReadOnlyList<Related> related,
        IReadOnlyDictionary<string, BriefSourceDto> sources,
        IReadOnlyDictionary<string, AnswerRecord> records)
    {
        _question = question;
        _incident = incident;
        _timeline = timeline;
        _omitted = omitted;
        _postmortem = postmortem;
        _related = related;
        _sources = sources;
        _records = records;
    }

    /// Every reference a sentence may cite.
    public IReadOnlySet<string> ValidRefs => _sources.Keys.ToHashSet(StringComparer.Ordinal);

    /// The related incidents a lookup may read, by label.
    public IReadOnlyList<string> ReadableRefs => _related.Select(r => r.Ref).ToList();

    public IReadOnlyDictionary<string, AnswerRecord> Records => _records;

    /// Everyone named as an actor in the records, so a sentence naming someone can be checked.
    public IReadOnlyList<string> People =>
        _records.Values.SelectMany(r => r.People).Distinct(StringComparer.Ordinal).ToList();

    public static IncidentQuestionContext Build(
        string question,
        IncidentDetailDto incident,
        IReadOnlyList<TimelineEntryDto> newestFirst,
        int timelineCount,
        PostmortemDto? postmortem,
        IReadOnlyList<RelatedIncidentDto> related)
    {
        var title = IncidentBriefContext.Fit(incident.Title, MaxTitleLength)!;
        var description = IncidentBriefContext.Fit(incident.Description, MaxDescriptionLength)!;
        var service = IncidentBriefContext.Fit(incident.ServiceName, MaxNameLength)!;
        var team = IncidentBriefContext.Fit(incident.TeamName, MaxNameLength)!;
        var sources = new Dictionary<string, BriefSourceDto>(StringComparer.Ordinal)
        {
            [IncidentBriefContext.IncidentRef] = new(
                IncidentBriefContext.IncidentRef,
                "Incident record",
                null,
                incident.CreatedAt,
                IncidentBriefContext.Fit(incident.Title, MaxSourceDetailLength)),
        };
        var lasted = Lasted(incident.CreatedAt, incident.ResolvedAt);
        var records = new Dictionary<string, AnswerRecord>(StringComparer.Ordinal)
        {
            [IncidentBriefContext.IncidentRef] = new(
                [
                    title, description, service, team, incident.Severity.ToString(), incident.Status.ToString(),
                    .. ResolutionTexts(incident.CreatedAt, incident.ResolvedAt),
                ],
                Times(incident.CreatedAt, incident.ResolvedAt),
                []),
        };

        var included = IncidentBriefContext.NewestThatFit(newestFirst, MaxTimelineLength);
        var timeline = new List<object>(included.Count);
        for (var i = 0; i < included.Count; i++)
        {
            var entry = included[i];
            var reference = "T" + (i + 1).ToString(CultureInfo.InvariantCulture);
            var change = IncidentBriefContext.Change(entry);
            sources[reference] = new BriefSourceDto(
                reference,
                IncidentBriefContext.Label(entry.Type),
                entry.ActorDisplayName,
                entry.OccurredAt,
                IncidentBriefContext.Fit(change ?? entry.Body, MaxSourceDetailLength));
            records[reference] = new AnswerRecord(
                Present(IncidentBriefContext.Label(entry.Type), change, entry.Body),
                [entry.OccurredAt],
                [entry.ActorDisplayName]);
            timeline.Add(IncidentBriefContext.ToWire(reference, entry));
        }

        object? postmortemWire = null;
        if (postmortem is not null)
        {
            var fields = FitPostmortem(postmortem, MaxFieldLength);
            postmortemWire = new { @ref = PostmortemRef, fields.Summary, fields.Impact, fields.RootCause, fields.Resolution, fields.ActionItems };
            sources[PostmortemRef] = new BriefSourceDto(
                PostmortemRef,
                "Postmortem",
                null,
                incident.ResolvedAt ?? incident.UpdatedAt,
                IncidentBriefContext.Fit(postmortem.Summary, MaxSourceDetailLength));
            records[PostmortemRef] = new AnswerRecord(fields.All, [], []);
        }

        var relatedEntries = new List<Related>(related.Count);
        for (var i = 0; i < related.Count; i++)
        {
            var listed = related[i];
            var reference = "R" + (i + 1).ToString(CultureInfo.InvariantCulture);
            var entry = new Related(reference, listed, Read: null);
            relatedEntries.Add(entry);
            sources[reference] = new BriefSourceDto(
                reference,
                "Related incident",
                null,
                listed.CreatedAt,
                IncidentBriefContext.Fit(listed.Title, MaxSourceDetailLength));
            records[reference] = entry.Record();
        }

        return new IncidentQuestionContext(
            question,
            new
            {
                @ref = IncidentBriefContext.IncidentRef,
                title,
                description,
                descriptionShortened = !ReferenceEquals(description, incident.Description),
                service,
                team,
                severity = incident.Severity.ToString(),
                status = incident.Status.ToString(),
                openedAt = Wire(incident.CreatedAt),
                resolvedAt = incident.ResolvedAt is { } resolved ? Wire(resolved) : null,
                lasted,
            },
            timeline,
            Math.Max(0, timelineCount - included.Count),
            postmortemWire,
            relatedEntries,
            sources,
            records);
    }

    /// The related incident behind a label, or null for a label this question never offered.
    public RelatedIncidentDto? RelatedFor(string reference) =>
        _related.FirstOrDefault(r => string.Equals(r.Ref, reference, StringComparison.Ordinal))?.Listed;

    /// The same context with a lookup's result added to that related incident.
    public IncidentQuestionContext WithRead(string reference, RelatedIncidentRead read)
    {
        var related = _related
            .Select(r => string.Equals(r.Ref, reference, StringComparison.Ordinal) ? r with { Read = read } : r)
            .ToList();
        var records = new Dictionary<string, AnswerRecord>(_records, StringComparer.Ordinal)
        {
            [reference] = related.Single(r => r.Ref == reference).Record(),
        };
        return new IncidentQuestionContext(
            _question, _incident, _timeline, _omitted, _postmortem, related, _sources, records);
    }

    public BriefSourceDto Source(string reference) => _sources[reference];

    /// The document the model is sent, saying how many lookups it may still ask for.
    public string DataJson(int lookupsAllowed) =>
        JsonSerializer.Serialize(
            new
            {
                question = _question,
                incident = _incident,
                timeline = _timeline,
                omittedOlderTimelineEntries = _omitted,
                postmortem = _postmortem,
                relatedIncidents = _related.Select(r => r.Wire()).ToList(),
                lookupsAllowed,
            },
            Json);

    private static string Wire(DateTimeOffset at) => at.ToString("O", CultureInfo.InvariantCulture);

    private static DateTimeOffset[] Times(DateTimeOffset opened, DateTimeOffset? resolved) =>
        resolved is { } at ? [opened, at] : [opened];

    /// How long a resolved incident ran, in words: "90 minutes", "2 hours 5 minutes", "3 days 4 hours". The data
    /// says it so a model need not work it out from two timestamps, and null while the incident is open.
    private static string? Lasted(DateTimeOffset opened, DateTimeOffset? resolved)
    {
        if (resolved is not { } end)
        {
            return null;
        }

        var minutes = Math.Max(0, (int)Math.Round((end - opened).TotalMinutes));
        if (minutes < 120)
        {
            return Count(minutes, "minute");
        }

        var (hours, restMinutes) = Math.DivRem(minutes, 60);
        if (hours < 48)
        {
            return restMinutes == 0 ? Count(hours, "hour") : $"{Count(hours, "hour")} {Count(restMinutes, "minute")}";
        }

        var (days, restHours) = Math.DivRem(hours, 24);
        return restHours == 0 ? Count(days, "day") : $"{Count(days, "day")} {Count(restHours, "hour")}";
    }

    /// What a record says about resolution for the answer check: how long a resolved incident lasted, as the data
    /// words it and in minutes all told, or that an open one is not resolved.
    private static string[] ResolutionTexts(DateTimeOffset opened, DateTimeOffset? resolved) =>
        Lasted(opened, resolved) is { } lasted && resolved is { } end
            ? [$"Lasted {lasted}", $"Lasted {Math.Max(0, (int)Math.Round((end - opened).TotalMinutes)).ToString(CultureInfo.InvariantCulture)} minutes"]
            : ["Not resolved, still open"];

    private static string Count(int value, string unit) =>
        value == 1 ? $"1 {unit}" : $"{value.ToString(CultureInfo.InvariantCulture)} {unit}s";

    private static string[] Present(params string?[] texts) => texts.OfType<string>().ToArray();

    private static PostmortemFields FitPostmortem(PostmortemDto postmortem, int max)
    {
        var actionItems = postmortem.ActionItems.Take(MaxActionItems)
            .Select(item => IncidentBriefContext.Fit(item, MaxActionItemLength)!)
            .ToArray();
        return new PostmortemFields(
            IncidentBriefContext.Fit(postmortem.Summary, max)!,
            IncidentBriefContext.Fit(postmortem.Impact, max)!,
            IncidentBriefContext.Fit(postmortem.RootCause, max)!,
            IncidentBriefContext.Fit(postmortem.Resolution, max)!,
            actionItems);
    }

    private sealed record PostmortemFields(
        string Summary,
        string Impact,
        string RootCause,
        string Resolution,
        string[] ActionItems)
    {
        public string[] All => [Summary, Impact, RootCause, Resolution, .. ActionItems];
    }

    private sealed record Related(string Ref, RelatedIncidentDto Listed, RelatedIncidentRead? Read)
    {
        private string Title => IncidentBriefContext.Fit(Listed.Title, MaxTitleLength)!;

        public object Wire() => new
        {
            @ref = Ref,
            title = Title,
            service = IncidentBriefContext.Fit(Listed.ServiceName, MaxNameLength),
            team = IncidentBriefContext.Fit(Listed.TeamName, MaxNameLength),
            severity = Listed.Severity.ToString(),
            status = Listed.Status.ToString(),
            openedAt = IncidentQuestionContext.Wire(Listed.CreatedAt),
            resolvedAt = Listed.ResolvedAt is { } resolved ? IncidentQuestionContext.Wire(resolved) : null,
            lasted = IncidentQuestionContext.Lasted(Listed.CreatedAt, Listed.ResolvedAt),
            sameService = Listed.SameService,
            sameTeam = Listed.SameTeam,
            sharedTitleWords = Listed.SharedWords,
            read = Read is null ? null : ReadWire(Read),
        };

        public AnswerRecord Record()
        {
            List<string> texts =
            [
                Title,
                Listed.ServiceName,
                Listed.TeamName,
                Listed.Severity.ToString(),
                Listed.Status.ToString(),
                .. ResolutionTexts(Listed.CreatedAt, Listed.ResolvedAt),
            ];
            var times = new List<DateTimeOffset>(Times(Listed.CreatedAt, Listed.ResolvedAt));
            var people = new List<string>();
            if (Read is not null)
            {
                texts.Add(IncidentBriefContext.Fit(Read.Detail.Description, MaxReadDescriptionLength)!);
                foreach (var entry in ReadEntries(Read))
                {
                    texts.AddRange(Present(
                        IncidentBriefContext.Label(entry.Type),
                        IncidentBriefContext.Change(entry),
                        IncidentBriefContext.Fit(entry.Body, MaxReadEntryLength)));
                    times.Add(entry.OccurredAt);
                    people.Add(entry.ActorDisplayName);
                }

                if (Read.Postmortem is not null)
                {
                    texts.AddRange(FitPostmortem(Read.Postmortem, MaxFieldLength).All);
                }
            }

            return new AnswerRecord(texts, times, people);
        }

        private static object ReadWire(RelatedIncidentRead read)
        {
            var postmortem = read.Postmortem is null ? null : FitPostmortem(read.Postmortem, MaxFieldLength);
            return new
            {
                description = IncidentBriefContext.Fit(read.Detail.Description, MaxReadDescriptionLength),
                timeline = ReadEntries(read).Select(entry => new
                {
                    at = IncidentQuestionContext.Wire(entry.OccurredAt),
                    actor = IncidentBriefContext.Fit(entry.ActorDisplayName, MaxNameLength),
                    @event = IncidentBriefContext.Label(entry.Type),
                    change = IncidentBriefContext.Change(entry),
                    text = IncidentBriefContext.Fit(entry.Body, MaxReadEntryLength),
                }).ToList(),
                postmortem = postmortem is null
                    ? null
                    : new { postmortem.Summary, postmortem.Impact, postmortem.RootCause, postmortem.Resolution, postmortem.ActionItems },
            };
        }

        /// The newest entries that fit the budget, oldest first.
        private static List<TimelineEntryDto> ReadEntries(RelatedIncidentRead read) =>
            IncidentBriefContext.NewestThatFit(read.NewestFirst, MaxReadTimelineLength);
    }
}
