using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Application.Incidents;

namespace OpsBoard.Application.Assistant;

/// Writes an AI brief for one incident. The model sees only data this service
/// reads for the current user, has no tools, and its reply is checked against
/// that data before anyone sees it. Security does not depend on the model
/// behaving: the worst a hostile reply can do is be refused.
public sealed class IncidentBriefService(
    AssistantSettings settings,
    ICurrentUser currentUser,
    IIncidentData data,
    IIncidentReadData readData,
    IInferenceClient inference,
    IncidentBriefCache cache,
    AssistantUsageGate gate,
    AssistantMetrics metrics,
    ILogger<IncidentBriefService> logger,
    TimeProvider timeProvider)
{
    public const int MaxTimelineEntries = 50;

    public async Task<AssistantStatusDto> GetStatusAsync(CancellationToken cancellationToken)
    {
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        return new AssistantStatusDto(
            settings.Enabled,
            settings.Enabled && inference.IsSimulated,
            settings.Enabled && settings.QuestionsEnabled);
    }

    /// The visitor key only bounds how many new briefs one visitor starts; it
    /// grants nothing, and access is still checked for the current user.
    public async Task<IncidentBriefDto> GenerateAsync(Guid incidentId, string visitor, CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        if (!settings.Enabled)
        {
            Record("disabled", started);
            throw new AssistantUnavailableException(AssistantFailure.Disabled);
        }

        // Access is checked on every request, before the cache is consulted.
        var user = await currentUser.GetAsync(cancellationToken);
        Permissions.RequireRead(user.Role);
        var incident = await data.GetAsync(user.OrganizationId, incidentId, cancellationToken)
            ?? throw new UnavailableException();
        var (newestFirst, timelineCount) = await readData.ListTimelineAsync(
            user.OrganizationId,
            incidentId,
            1,
            MaxTimelineEntries,
            cancellationToken);
        var context = IncidentBriefContext.Build(incident, newestFirst, timelineCount);

        var key = CacheKey(incident, context);
        if (cache.Find(user.OrganizationId, incidentId, key) is { } cached)
        {
            Record("cached", started);
            return cached with { FromCache = true };
        }

        try
        {
            using var lease = gate.Enter(visitor);
            var brief = await AskModelAsync(incident, context, cancellationToken);
            cache.Store(user.OrganizationId, incidentId, key, brief);
            Record("generated", started);
            return brief;
        }
        catch (AssistantUnavailableException failure)
        {
            Record(Outcome(failure.Failure), started);
            throw;
        }
    }

    private async Task<IncidentBriefDto> AskModelAsync(
        IncidentDetailDto incident,
        IncidentBriefContext context,
        CancellationToken cancellationToken)
    {
        var request = new InferenceRequest(
            IncidentBriefPrompt.SystemPrompt,
            context.DataJson,
            IncidentBriefPrompt.SchemaName,
            IncidentBriefPrompt.BuildSchema(context.ValidRefs),
            IncidentBriefPrompt.MaxOutputTokens);
        var result = await CallProviderAsync(incident.Id, request, cancellationToken);
        var cost = (result.InputTokens * settings.InputUsdPerMillionTokens
            + result.OutputTokens * settings.OutputUsdPerMillionTokens) / 1_000_000m;
        metrics.RecordUsage(inference.ProviderName, result.Model, result.InputTokens, result.OutputTokens, cost);
        logger.LogInformation(
            "Assistant brief for incident {IncidentId} from {Provider} {Model}: {InputTokens} input and {OutputTokens} output tokens, estimated {CostUsd} USD",
            incident.Id,
            inference.ProviderName,
            result.Model,
            result.InputTokens,
            result.OutputTokens,
            cost);

        var (parsed, added) = IncidentBriefCitations.Complete(Verify(incident.Id, result.Content, context), context);
        if (added > 0)
        {
            logger.LogInformation(
                "Assistant brief for incident {IncidentId}: added {Count} references the model left out",
                incident.Id,
                added);
        }

        var cited =parsed.WhatHappened.Concat(parsed.CurrentState).Concat(parsed.OpenQuestions)
            .Concat(parsed.SuggestedChecks)
            .SelectMany(s => s.Refs)
            .ToHashSet(StringComparer.Ordinal);

        return new IncidentBriefDto(
            incident.Id,
            incident.Version,
            context.TimelineCount,
            context.OmittedTimelineEntries,
            timeProvider.GetUtcNow(),
            inference.ProviderName,
            result.Model,
            inference.IsSimulated,
            FromCache: false,
            parsed.WhatHappened,
            parsed.CurrentState,
            parsed.OpenQuestions,
            parsed.SuggestedChecks,
            context.Sources.Where(s => cited.Contains(s.Ref)).ToList());
    }

    private async Task<InferenceResult> CallProviderAsync(
        Guid incidentId,
        InferenceRequest request,
        CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(settings.RequestTimeout);
        try
        {
            return await inference.CompleteAsync(request, deadline.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Assistant brief for incident {IncidentId} timed out", incidentId);
            throw new AssistantUnavailableException(AssistantFailure.ProviderUnavailable);
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

    private ParsedBrief Verify(Guid incidentId, string content, IncidentBriefContext context)
    {
        try
        {
            return IncidentBriefParser.Parse(content, context.ValidRefs);
        }
        catch (BriefRejectedException rejected)
        {
            // The reason names the broken rule; the reply itself is never logged.
            logger.LogWarning("Assistant brief for incident {IncidentId} rejected: {Reason}", incidentId, rejected.Message);
            throw new AssistantUnavailableException(AssistantFailure.UnverifiedResponse);
        }
    }

    /// Everything that decides the answer: instructions, model and the exact data.
    private string CacheKey(IncidentDetailDto incident, IncidentBriefContext context)
    {
        var material = string.Join(
            '\n',
            IncidentBriefPrompt.Version,
            inference.ProviderName,
            inference.Model,
            incident.Version,
            context.TimelineCount,
            context.DataJson);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material)));
    }

    private void Record(string outcome, long started) =>
        metrics.Record(outcome, inference.ProviderName, inference.Model, Stopwatch.GetElapsedTime(started));

    private static string Outcome(AssistantFailure failure) => failure switch
    {
        AssistantFailure.DailyLimitReached => "daily_limit",
        AssistantFailure.VisitorLimitReached => "visitor_limit",
        AssistantFailure.Busy => "busy",
        AssistantFailure.ProviderUnavailable => "provider_unavailable",
        AssistantFailure.UnverifiedResponse => "unverified",
        _ => "disabled",
    };
}
