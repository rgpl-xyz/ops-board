using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using OpsBoard.Application.Assistant;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Incidents;
using OpsBoard.Application.Validation;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

/// One incident, its timeline, its related incidents and a scripted model:
/// everything a question reads. The stores remember every read, so a test can
/// show what a hostile model did and did not reach.
internal sealed class QuestionHarness
{
    internal static readonly Guid RelatedId = Guid.Parse("66666666-6666-6666-6666-666666666666");

    private readonly MutableTimeProvider _clock = new(DateTimeOffset.Parse("2026-10-01T12:00:00Z"));
    private IncidentQuestionService? _service;

    public AssistantSettings Settings { get; set; } = new(
        Enabled: true,
        DailyRequestLimit: 20,
        MaxConcurrentRequests: 2,
        RequestTimeout: TimeSpan.FromSeconds(30),
        QuestionsEnabled: true);

    public UserRole Role { get; set; } = UserRole.Viewer;

    public IncidentDetailDto? Incident { get; set; } = AssistantHarness.NewIncident();

    public List<TimelineEntryDto> Timeline { get; } =
    [
        AssistantHarness.Entry(1, TimelineEntryType.IncidentCreated),
        AssistantHarness.Entry(2, TimelineEntryType.WrittenUpdate, "Checkout errors rose to 12% after the 09:40 deploy."),
    ];

    public PostmortemDto? Postmortem { get; set; }

    /// Strongest first, as the related-incident query ranks them.
    public List<RelatedCase> Related { get; } = [NewRelated()];

    public ScriptedModel Model { get; } = new();

    /// Every incident read through a store, with the organization it was read for.
    public List<(Guid OrganizationId, Guid IncidentId)> Reads { get; } = [];

    public MutableTimeProvider Clock => _clock;

    public AssistantMetrics Metrics { get; } = new();

    public IncidentQuestionService Service => _service ??= new IncidentQuestionService(
        Settings,
        new StubCurrentUser(() => Role),
        new StubIncidentData(this),
        new StubReadData(this),
        new StubRelatedData(this),
        new StubPostmortems(this),
        Model,
        new AssistantUsageGate(Settings, _clock),
        Metrics,
        new IncidentQuestionRequestValidator(),
        NullLogger<IncidentQuestionService>.Instance,
        _clock);

    public Task<IncidentAnswerDto> AskAsync(string question = "When did the errors start?", string visitor = "visitor-a") =>
        Service.AskAsync(AssistantHarness.IncidentId, new IncidentQuestionRequest(question), visitor, CancellationToken.None);

    /// A model reply in the answer's wire shape, built from plain values.
    internal static string Reply(
        (string Text, string[] Refs)[]? answer = null,
        (string Tool, string Ref)[]? lookups = null) =>
        JsonSerializer.Serialize(new
        {
            lookups = (lookups ?? []).Select(l => new { tool = l.Tool, @ref = l.Ref }).ToArray(),
            answer = (answer ?? []).Select(s => new { text = s.Text, refs = s.Refs }).ToArray(),
        });

    /// Answers each round in turn: the first reply to the first call, and so on.
    internal void AnswerInRounds(params string[] replies)
    {
        var round = 0;
        Model.Answer = (_, _) => Task.FromResult(replies[Math.Min(round++, replies.Length - 1)]);
    }

    internal static RelatedCase NewRelated() =>
        new(
            new RelatedIncidentDto(
                RelatedId,
                "Checkout errors after a promo deploy",
                "Checkout API",
                "Payments",
                IncidentSeverity.High,
                IncidentStatus.Resolved,
                DateTimeOffset.Parse("2026-09-12T10:00:00Z"),
                DateTimeOffset.Parse("2026-09-12T11:30:00Z"),
                SameService: true,
                SameTeam: true,
                SharedWords: ["Checkout"]),
            AssistantHarness.NewIncident("A promo deploy broke cart pricing and checkout started failing.") with
            {
                Id = RelatedId,
                Title = "Checkout errors after a promo deploy",
                Status = IncidentStatus.Resolved,
                CreatedAt = DateTimeOffset.Parse("2026-09-12T10:00:00Z"),
                UpdatedAt = DateTimeOffset.Parse("2026-09-12T11:30:00Z"),
                ResolvedAt = DateTimeOffset.Parse("2026-09-12T11:30:00Z"),
            },
            [
                AssistantHarness.Entry(1, TimelineEntryType.WrittenUpdate, "Rolled back the promo deploy at 14:20; errors cleared.")
                    with { ActorDisplayName = "Jordan Patel" },
            ],
            new PostmortemDto(
                "A promo deploy broke cart pricing.",
                "Checkout failed for 40 minutes.",
                "A pricing rule shipped without a canary.",
                "Rolled back the deploy and added a canary stage.",
                ["Add a canary stage for pricing rules."]));

    private sealed class StubCurrentUser(Func<UserRole> role) : ICurrentUser
    {
        public Task<CurrentUser> GetAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new CurrentUser(AssistantHarness.UserId, AssistantHarness.OrgId, role()));
    }

    private sealed class StubIncidentData(QuestionHarness harness) : IIncidentData
    {
        public Task<IncidentDetailDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken)
        {
            harness.Reads.Add((organizationId, id));
            if (organizationId != AssistantHarness.OrgId)
            {
                return Task.FromResult<IncidentDetailDto?>(null);
            }

            return Task.FromResult(harness.Incident?.Id == id
                ? harness.Incident
                : harness.Related.FirstOrDefault(r => r.Detail.Id == id)?.Detail);
        }

        public Task<(IReadOnlyList<IncidentSummaryDto> Items, int TotalCount)> ListAsync(
            Guid organizationId,
            IncidentQuery query,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException("A question never lists incidents.");

        public Task<IIncidentWriteSession> BeginCreateAsync(Guid organizationId, CancellationToken cancellationToken) =>
            throw new NotSupportedException("A question never writes.");

        public Task<IIncidentWriteSession> BeginMutationAsync(
            Guid organizationId,
            Guid incidentId,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException("A question never writes.");
    }

    private sealed class StubReadData(QuestionHarness harness) : IIncidentReadData
    {
        public Task<(IReadOnlyList<TimelineEntryDto> Items, int TotalCount)> ListTimelineAsync(
            Guid organizationId,
            Guid incidentId,
            int page,
            int pageSize,
            CancellationToken cancellationToken)
        {
            harness.Reads.Add((organizationId, incidentId));
            var timeline = organizationId != AssistantHarness.OrgId
                ? []
                : incidentId == AssistantHarness.IncidentId
                    ? harness.Timeline
                    : harness.Related.FirstOrDefault(r => r.Detail.Id == incidentId)?.Timeline ?? [];
            var newestFirst = Enumerable.Reverse(timeline).ToList();
            var items = newestFirst.Skip((page - 1) * pageSize).Take(pageSize).ToList();
            return Task.FromResult<(IReadOnlyList<TimelineEntryDto>, int)>((items, newestFirst.Count));
        }

        public Task<(IReadOnlyList<ResponderDto> Items, Guid? NextAfter)> ListRespondersAsync(
            Guid organizationId,
            Guid incidentId,
            int limit,
            Guid? after,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException("A question reads responders from the timeline.");
    }

    private sealed class StubRelatedData(QuestionHarness harness) : IRelatedIncidentData
    {
        public Task<IReadOnlyList<RelatedIncidentDto>?> ListAsync(
            Guid organizationId,
            Guid incidentId,
            int limit,
            CancellationToken cancellationToken)
        {
            harness.Reads.Add((organizationId, incidentId));
            return Task.FromResult<IReadOnlyList<RelatedIncidentDto>?>(
                organizationId == AssistantHarness.OrgId && incidentId == AssistantHarness.IncidentId
                    ? harness.Related.Select(r => r.Listed).Take(limit).ToList()
                    : null);
        }
    }

    private sealed class StubPostmortems(QuestionHarness harness) : IPostmortemData
    {
        public Task<PostmortemDto?> GetAsync(Guid organizationId, Guid incidentId, CancellationToken cancellationToken)
        {
            harness.Reads.Add((organizationId, incidentId));
            if (organizationId != AssistantHarness.OrgId)
            {
                return Task.FromResult<PostmortemDto?>(null);
            }

            return Task.FromResult(incidentId == AssistantHarness.IncidentId
                ? harness.Postmortem
                : harness.Related.FirstOrDefault(r => r.Detail.Id == incidentId)?.Postmortem);
        }
    }
}

/// A related incident as the list shows it, and what reading it returns.
internal sealed record RelatedCase(
    RelatedIncidentDto Listed,
    IncidentDetailDto Detail,
    List<TimelineEntryDto> Timeline,
    PostmortemDto? Postmortem);
