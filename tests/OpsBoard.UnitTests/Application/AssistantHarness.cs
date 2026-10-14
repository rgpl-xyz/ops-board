using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using OpsBoard.Application.Assistant;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

/// One incident, its timeline and a scripted model: everything an incident
/// brief reads, so a test changes only what its behavior depends on.
internal sealed class AssistantHarness
{
    internal static readonly Guid OrgId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    internal static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    internal static readonly Guid IncidentId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    internal static readonly DateTimeOffset Opened = DateTimeOffset.Parse("2026-10-01T08:00:00Z");

    private readonly MutableTimeProvider _clock = new(DateTimeOffset.Parse("2026-10-01T12:00:00Z"));
    private IncidentBriefService? _service;

    public AssistantSettings Settings { get; set; } = new(
        Enabled: true,
        DailyRequestLimit: 20,
        MaxConcurrentRequests: 2,
        RequestTimeout: TimeSpan.FromSeconds(30));

    public UserRole Role { get; set; } = UserRole.Viewer;

    public IncidentDetailDto? Incident { get; set; } = NewIncident();

    /// Oldest first, as it happened; the read store serves it newest first.
    public List<TimelineEntryDto> Timeline { get; } =
    [
        Entry(1, TimelineEntryType.IncidentCreated),
        Entry(2, TimelineEntryType.WrittenUpdate, "Checkout errors rose to 12% after the 09:40 deploy."),
    ];

    public ScriptedModel Model { get; } = new();

    public MutableTimeProvider Clock => _clock;

    public AssistantMetrics Metrics { get; } = new();

    public IncidentBriefService Service => _service ??= new IncidentBriefService(
        Settings,
        new StubCurrentUser(() => Role),
        new StubIncidentData(this),
        new StubReadData(this),
        Model,
        new IncidentBriefCache(),
        new AssistantUsageGate(Settings, _clock),
        Metrics,
        NullLogger<IncidentBriefService>.Instance,
        _clock);

    public Task<IncidentBriefDto> GenerateAsync() =>
        Service.GenerateAsync(IncidentId, CancellationToken.None);

    internal static IncidentDetailDto NewIncident(string description = "Checkout requests are failing for some customers.") =>
        new(
            IncidentId,
            "Checkout failures in EU",
            description,
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            "Checkout API",
            Guid.Parse("55555555-5555-5555-5555-555555555555"),
            "Payments",
            UserId,
            IncidentSeverity.High,
            IncidentStatus.Investigating,
            Opened,
            Opened.AddMinutes(30),
            null,
            "3",
            "2");

    internal static TimelineEntryDto Entry(
        long sequence,
        TimelineEntryType type,
        string? body = null,
        IncidentStatus? fromStatus = null,
        IncidentStatus? toStatus = null) =>
        new(
            Guid.Parse($"00000000-0000-4000-8000-{sequence:D12}"),
            sequence.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Opened.AddMinutes(sequence * 5),
            UserId,
            "Avery Chen",
            type,
            type == TimelineEntryType.WrittenUpdate ? "writtenUpdate" : "system",
            body,
            fromStatus,
            toStatus,
            null,
            null);

    /// A model reply in the brief's wire shape, built from plain values.
    internal static string Reply(
        (string Text, string[] Refs)[]? whatHappened = null,
        (string Text, string[] Refs)[]? currentState = null,
        (string Text, string[] Refs)[]? openQuestions = null,
        (string Text, string[] Refs)[]? suggestedChecks = null) =>
        JsonSerializer.Serialize(new
        {
            whatHappened = Statements(whatHappened ?? [("Checkout errors rose after a deploy.", ["T2"])]),
            currentState = Statements(currentState ?? [("The incident is under investigation.", ["I"])]),
            openQuestions = Statements(openQuestions ?? []),
            suggestedChecks = Statements(suggestedChecks ?? []),
        });

    private static object[] Statements((string Text, string[] Refs)[] items) =>
        items.Select(x => (object)new { text = x.Text, refs = x.Refs }).ToArray();

    private sealed class StubCurrentUser(Func<UserRole> role) : ICurrentUser
    {
        public Task<CurrentUser> GetAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new CurrentUser(UserId, OrgId, role()));
    }

    private sealed class StubIncidentData(AssistantHarness harness) : IIncidentData
    {
        public Task<IncidentDetailDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken) =>
            Task.FromResult(
                organizationId == OrgId && harness.Incident?.Id == id ? harness.Incident : null);

        public Task<(IReadOnlyList<IncidentSummaryDto> Items, int TotalCount)> ListAsync(
            Guid organizationId,
            IncidentQuery query,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException("A brief reads one incident.");

        public Task<IIncidentWriteSession> BeginCreateAsync(Guid organizationId, CancellationToken cancellationToken) =>
            throw new NotSupportedException("A brief never writes.");

        public Task<IIncidentWriteSession> BeginMutationAsync(
            Guid organizationId,
            Guid incidentId,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException("A brief never writes.");
    }

    private sealed class StubReadData(AssistantHarness harness) : IIncidentReadData
    {
        public Task<(IReadOnlyList<TimelineEntryDto> Items, int TotalCount)> ListTimelineAsync(
            Guid organizationId,
            Guid incidentId,
            int page,
            int pageSize,
            CancellationToken cancellationToken)
        {
            if (organizationId != OrgId || incidentId != IncidentId)
            {
                return Task.FromResult<(IReadOnlyList<TimelineEntryDto>, int)>(([], 0));
            }

            var newestFirst = Enumerable.Reverse(harness.Timeline).ToList();
            var items = newestFirst.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult<(IReadOnlyList<TimelineEntryDto>, int)>((items, newestFirst.Count));
        }

        public Task<(IReadOnlyList<ResponderDto> Items, Guid? NextAfter)> ListRespondersAsync(
            Guid organizationId,
            Guid incidentId,
            int limit,
            Guid? after,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException("The brief reads responders from the timeline.");
    }
}

/// Stands in for the provider. It answers with whatever the test scripts,
/// which is how a test plays a model that follows an attacker perfectly.
internal sealed class ScriptedModel : IInferenceClient
{
    private readonly object _gate = new();

    public string ProviderName { get; init; } = "Scripted";

    public string Model { get; init; } = "scripted-model";

    public bool IsSimulated { get; set; }

    public List<InferenceRequest> Requests { get; } = [];

    public Func<InferenceRequest, CancellationToken, Task<string>> Answer { get; set; } =
        (_, _) => Task.FromResult(AssistantHarness.Reply());

    public void AnswerWith(string content) => Answer = (_, _) => Task.FromResult(content);

    public void FailWith(Exception error) => Answer = (_, _) => Task.FromException<string>(error);

    public async Task<InferenceResult> CompleteAsync(InferenceRequest request, CancellationToken cancellationToken)
    {
        lock (_gate)
        {
            Requests.Add(request);
        }

        var content = await Answer(request, cancellationToken);
        return new InferenceResult(content, Model, InputTokens: 1200, OutputTokens: 180);
    }
}

internal sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
{
    public DateTimeOffset UtcNow { get; set; } = utcNow;

    public override DateTimeOffset GetUtcNow() => UtcNow;
}
