using System.Diagnostics;
using FluentValidation;
using Microsoft.Extensions.Logging;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Incidents;

namespace OpsBoard.Application.Assistant;

/// Answers a typed question about one incident from its records. The model
/// sees only data this service reads for the current user. Its one way to see
/// more is to ask, by label, for related incidents this service already found
/// for that user; the service reads them itself, again for that user, and a
/// request for anything else refuses the whole question. The answer is
/// checked against the records before anyone sees it, and nothing is stored:
/// each question stands alone.
public sealed class IncidentQuestionService(
    AssistantSettings settings,
    ICurrentUser currentUser,
    IIncidentData data,
    IIncidentReadData readData,
    IRelatedIncidentData relatedData,
    IPostmortemData postmortems,
    IInferenceClient inference,
    AssistantUsageGate gate,
    AssistantMetrics metrics,
    IValidator<IncidentQuestionRequest> validator,
    ILogger<IncidentQuestionService> logger,
    TimeProvider timeProvider)
{
    public const int MaxTimelineEntries = 30;

    public const int MaxRelatedIncidents = 5;

    private const int MaxRelatedTimelineEntries = 10;

    /// The visitor key only bounds how many questions one visitor asks; it
    /// grants nothing, and access is still checked for the current user.
    public async Task<IncidentAnswerDto> AskAsync(
        Guid incidentId,
        IncidentQuestionRequest request,
        string visitor,
        CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        var lookups = 0;
        try
        {
            if (!settings.Enabled)
            {
                throw new AssistantUnavailableException(AssistantFailure.Disabled);
            }

            if (!settings.QuestionsEnabled)
            {
                throw new AssistantUnavailableException(AssistantFailure.QuestionsDisabled);
            }

            await validator.ValidateAndThrowAsync(request, cancellationToken);
            var user = await currentUser.GetAsync(cancellationToken);
            Permissions.RequireRead(user.Role);
            var context = await GatherAsync(user.OrganizationId, incidentId, request.Question.Trim(), cancellationToken);

            using var lease = gate.EnterQuestion(visitor);

            // One deadline for the whole question: both calls and the lookups between them.
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            deadline.CancelAfter(settings.RequestTimeout);
            ParsedAnswer final;
            try
            {
                final = await AskModelAsync(incidentId, context, IncidentQuestionPrompt.MaxLookups, deadline.Token);
                if (final.Lookups.Count > 0)
                {
                    lookups = final.Lookups.Count;
                    foreach (var label in final.Lookups)
                    {
                        context = context.WithRead(label, await ReadRelatedAsync(user.OrganizationId, context, label, deadline.Token));
                    }

                    final = await AskModelAsync(incidentId, context, lookupsAllowed: 0, deadline.Token);
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning("Assistant answer for incident {IncidentId} timed out", incidentId);
                throw new AssistantUnavailableException(AssistantFailure.ProviderUnavailable);
            }

            Check(incidentId, final.Answer, context);
            var answer = Answer(incidentId, final.Answer, context);
            Record(answer.Answered ? "answered" : "not_in_records", lookups, started);
            return answer;
        }
        catch (AssistantUnavailableException failure)
        {
            Record(Outcome(failure.Failure), lookups, started);
            throw;
        }
    }

    private async Task<IncidentQuestionContext> GatherAsync(
        Guid organizationId,
        Guid incidentId,
        string question,
        CancellationToken cancellationToken)
    {
        var incident = await data.GetAsync(organizationId, incidentId, cancellationToken)
            ?? throw new UnavailableException();
        var (newestFirst, timelineCount) = await readData.ListTimelineAsync(
            organizationId,
            incidentId,
            1,
            MaxTimelineEntries,
            cancellationToken);
        var postmortem = await postmortems.GetAsync(organizationId, incidentId, cancellationToken);
        var related = await relatedData.ListAsync(organizationId, incidentId, MaxRelatedIncidents, cancellationToken)
            ?? throw new UnavailableException();
        return IncidentQuestionContext.Build(question, incident, newestFirst, timelineCount, postmortem, related);
    }

    /// Reads a related incident the context offered, for the caller's
    /// organization. One that has gone since it was listed refuses the question.
    private async Task<RelatedIncidentRead> ReadRelatedAsync(
        Guid organizationId,
        IncidentQuestionContext context,
        string label,
        CancellationToken cancellationToken)
    {
        var listed = context.RelatedFor(label)
            ?? throw new AssistantUnavailableException(AssistantFailure.UnverifiedResponse);
        var detail = await data.GetAsync(organizationId, listed.Id, cancellationToken)
            ?? throw new AssistantUnavailableException(AssistantFailure.UnverifiedResponse);
        var (newestFirst, _) = await readData.ListTimelineAsync(
            organizationId,
            listed.Id,
            1,
            MaxRelatedTimelineEntries,
            cancellationToken);
        var postmortem = await postmortems.GetAsync(organizationId, listed.Id, cancellationToken);
        return new RelatedIncidentRead(detail, newestFirst, postmortem);
    }

    private async Task<ParsedAnswer> AskModelAsync(
        Guid incidentId,
        IncidentQuestionContext context,
        int lookupsAllowed,
        CancellationToken cancellationToken)
    {
        var request = new InferenceRequest(
            IncidentQuestionPrompt.SystemPrompt,
            context.DataJson(lookupsAllowed),
            IncidentQuestionPrompt.SchemaName,
            IncidentQuestionPrompt.BuildSchema(context.ValidRefs, context.ReadableRefs, lookupsAllowed),
            IncidentQuestionPrompt.MaxOutputTokens);
        var result = await CallProviderAsync(incidentId, request, cancellationToken);
        var cost = (result.InputTokens * settings.InputUsdPerMillionTokens
            + result.OutputTokens * settings.OutputUsdPerMillionTokens) / 1_000_000m;
        metrics.RecordUsage(inference.ProviderName, result.Model, result.InputTokens, result.OutputTokens, cost);
        logger.LogInformation(
            "Assistant answer for incident {IncidentId} from {Provider} {Model}: {InputTokens} input and {OutputTokens} output tokens, estimated {CostUsd} USD",
            incidentId,
            inference.ProviderName,
            result.Model,
            result.InputTokens,
            result.OutputTokens,
            cost);

        try
        {
            return IncidentQuestionParser.Parse(result.Content, context.ValidRefs, context.ReadableRefs, lookupsAllowed);
        }
        catch (BriefRejectedException rejected)
        {
            // The reason names the broken rule; the question and reply are never logged.
            logger.LogWarning("Assistant answer for incident {IncidentId} rejected: {Reason}", incidentId, rejected.Message);
            throw new AssistantUnavailableException(AssistantFailure.UnverifiedResponse);
        }
    }

    private async Task<InferenceResult> CallProviderAsync(
        Guid incidentId,
        InferenceRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return await inference.CompleteAsync(request, cancellationToken);
        }
        catch (InferenceFailedException failure)
        {
            logger.LogWarning(
                "Assistant provider failed for incident {IncidentId}: {Failure} {Reason}",
                incidentId,
                failure.Failure,
                failure.Message);
            throw failure.Failure switch
            {
                InferenceFailure.RateLimited => new AssistantUnavailableException(AssistantFailure.Busy, failure.RetryAfter),
                InferenceFailure.InvalidResponse => new AssistantUnavailableException(AssistantFailure.UnverifiedResponse),
                _ => new AssistantUnavailableException(AssistantFailure.ProviderUnavailable),
            };
        }
    }

    private void Check(Guid incidentId, IReadOnlyList<BriefStatementDto> sentences, IncidentQuestionContext context)
    {
        try
        {
            IncidentAnswerCheck.Verify(sentences, context);
        }
        catch (BriefRejectedException rejected)
        {
            logger.LogWarning("Assistant answer for incident {IncidentId} rejected: {Reason}", incidentId, rejected.Message);
            throw new AssistantUnavailableException(AssistantFailure.UnverifiedResponse);
        }
    }

    private IncidentAnswerDto Answer(
        Guid incidentId,
        IReadOnlyList<BriefStatementDto> sentences,
        IncidentQuestionContext context)
    {
        var cited = sentences.SelectMany(s => s.Refs).ToHashSet(StringComparer.Ordinal);
        return new IncidentAnswerDto(
            incidentId,
            timeProvider.GetUtcNow(),
            inference.ProviderName,
            inference.Model,
            inference.IsSimulated,
            Answered: sentences.Count > 0,
            sentences,
            context.ValidRefs.Where(cited.Contains).Order(RefOrder.Instance).Select(context.Source).ToList());
    }

    private void Record(string outcome, int lookups, long started) =>
        metrics.RecordQuestion(outcome, inference.ProviderName, inference.Model, lookups, Stopwatch.GetElapsedTime(started));

    private static string Outcome(AssistantFailure failure) => failure switch
    {
        AssistantFailure.DailyLimitReached => "daily_limit",
        AssistantFailure.QuestionLimitReached => "visitor_limit",
        AssistantFailure.Busy => "busy",
        AssistantFailure.ProviderUnavailable => "provider_unavailable",
        AssistantFailure.UnverifiedResponse => "unverified",
        _ => "disabled",
    };

    /// I, then T1..Tn, then P, then R1..Rn: the order a reader meets them.
    private sealed class RefOrder : IComparer<string>
    {
        public static readonly RefOrder Instance = new();

        public int Compare(string? x, string? y) => Key(x!).CompareTo(Key(y!));

        private static (int Kind, int Number) Key(string reference) => reference[0] switch
        {
            'I' => (0, 0),
            'T' => (1, int.Parse(reference[1..], System.Globalization.CultureInfo.InvariantCulture)),
            'P' => (2, 0),
            _ => (3, int.Parse(reference[1..], System.Globalization.CultureInfo.InvariantCulture)),
        };
    }
}
