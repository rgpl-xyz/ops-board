using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Assistant;

/// The incident data a brief is written from, as the model sees it, and the
/// sources its references resolve to. "I" is the incident record; "T1".."Tn"
/// are the included timeline entries, oldest first.
public sealed record IncidentBriefContext(
    string DataJson,
    IReadOnlyList<BriefSourceDto> Sources,
    int TimelineCount,
    int OmittedTimelineEntries)
{
    public const string IncidentRef = "I";

    /// About 3,300 tokens: with the instructions and schema, about 4,000 in all.
    public const int MaxDataLength = 13_000;

    // Budgets are for the serialized JSON, so escaping cannot push past them.
    private const int MaxDescriptionLength = 4_000;
    private const int MaxTitleLength = 400;
    private const int MaxNameLength = 200;
    private const int MaxEntryTextLength = 1_000;
    private const int MaxTimelineLength = 7_500;
    private const int MaxSourceDetailLength = 500;
    private const string Shortened = " [shortened]";

    // Only JSON's own escaping: the data is not embedded in HTML, and plain
    // Unicode costs a model fewer tokens than \u escapes.
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public IReadOnlySet<string> ValidRefs { get; } = Sources.Select(s => s.Ref).ToHashSet(StringComparer.Ordinal);

    /// <param name="newestFirst">Timeline entries as the read store pages them.</param>
    /// <param name="timelineCount">All entries the incident has, including any not passed in.</param>
    public static IncidentBriefContext Build(
        IncidentDetailDto incident,
        IReadOnlyList<TimelineEntryDto> newestFirst,
        int timelineCount)
    {
        var included = NewestThatFit(newestFirst);
        var sources = new List<BriefSourceDto>
        {
            new(IncidentRef, "Incident record", null, incident.CreatedAt, Fit(incident.Title, MaxSourceDetailLength)),
        };
        var timeline = new List<object>(included.Count);
        for (var i = 0; i < included.Count; i++)
        {
            var entry = included[i];
            var reference = "T" + (i + 1).ToString(CultureInfo.InvariantCulture);
            sources.Add(new BriefSourceDto(
                reference,
                Label(entry.Type),
                entry.ActorDisplayName,
                entry.OccurredAt,
                Fit(Change(entry) ?? entry.Body, MaxSourceDetailLength)));
            timeline.Add(ToWire(reference, entry));
        }

        var description = Fit(incident.Description, MaxDescriptionLength)!;
        var omitted = Math.Max(0, timelineCount - included.Count);
        var data = new
        {
            incident = new
            {
                @ref = IncidentRef,
                title = Fit(incident.Title, MaxTitleLength),
                description,
                descriptionShortened = !ReferenceEquals(description, incident.Description),
                service = Fit(incident.ServiceName, MaxNameLength),
                team = Fit(incident.TeamName, MaxNameLength),
                severity = incident.Severity.ToString(),
                status = incident.Status.ToString(),
                openedAt = incident.CreatedAt.ToString("O", CultureInfo.InvariantCulture),
                resolvedAt = incident.ResolvedAt?.ToString("O", CultureInfo.InvariantCulture),
            },
            timeline,
            omittedOlderTimelineEntries = omitted,
        };

        return new IncidentBriefContext(JsonSerializer.Serialize(data, Json), sources, timelineCount, omitted);
    }

    /// The newest entries whose serialized size fits the timeline budget, oldest first.
    internal static List<TimelineEntryDto> NewestThatFit(
        IReadOnlyList<TimelineEntryDto> newestFirst,
        int budget = MaxTimelineLength)
    {
        var picked = new List<TimelineEntryDto>();
        var used = 0;
        foreach (var entry in newestFirst)
        {
            var size = JsonSerializer.Serialize(ToWire("T00", entry), Json).Length + 1;
            if (used + size > budget)
            {
                break;
            }

            used += size;
            picked.Add(entry);
        }

        picked.Reverse();
        return picked;
    }

    internal static object ToWire(string reference, TimelineEntryDto entry) => new
    {
        @ref = reference,
        at = entry.OccurredAt.ToString("O", CultureInfo.InvariantCulture),
        actor = Fit(entry.ActorDisplayName, MaxNameLength),
        @event = Label(entry.Type),
        change = Change(entry),
        text = Fit(entry.Body, MaxEntryTextLength),
    };

    /// The longest prefix whose JSON encoding, with the marker, fits in <paramref name="max"/>.
    internal static string? Fit(string? text, int max)
    {
        if (text is null || Encoded(text) <= max)
        {
            return text;
        }

        int low = 0, high = text.Length;
        while (low < high)
        {
            var mid = (low + high + 1) / 2;
            if (Encoded(Prefix(text, mid) + Shortened) <= max)
            {
                low = mid;
            }
            else
            {
                high = mid - 1;
            }
        }

        return Prefix(text, low) + Shortened;
    }

    private static int Encoded(string text) => JsonSerializer.Serialize(text, Json).Length;

    /// Never splits a surrogate pair.
    private static string Prefix(string text, int length) =>
        length > 0 && char.IsHighSurrogate(text[length - 1]) ? text[..(length - 1)] : text[..length];

    internal static string? Change(TimelineEntryDto entry) => entry.Type switch
    {
        TimelineEntryType.StatusChanged or TimelineEntryType.Resolved or TimelineEntryType.Reopened
            when entry.FromStatus is not null && entry.ToStatus is not null => $"{entry.FromStatus} → {entry.ToStatus}",
        TimelineEntryType.SeverityChanged
            when entry.FromSeverity is not null && entry.ToSeverity is not null => $"{entry.FromSeverity} → {entry.ToSeverity}",
        _ => null,
    };

    internal static string Label(TimelineEntryType type) => type switch
    {
        TimelineEntryType.IncidentCreated => "Incident opened",
        TimelineEntryType.StatusChanged => "Status changed",
        TimelineEntryType.SeverityChanged => "Severity changed",
        TimelineEntryType.ResponderJoined => "Responder joined",
        TimelineEntryType.ResponderLeft => "Responder left",
        TimelineEntryType.Resolved => "Resolved",
        TimelineEntryType.Reopened => "Reopened",
        TimelineEntryType.WrittenUpdate => "Written update",
        _ => "Timeline entry",
    };
}
