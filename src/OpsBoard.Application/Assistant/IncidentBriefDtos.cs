namespace OpsBoard.Application.Assistant;

/// <param name="Simulated">True when briefs would come from the offline provider, with no model.</param>
public sealed record AssistantStatusDto(bool Enabled, bool Simulated);

/// <param name="BasedOnVersion">The incident revision the brief was generated from.</param>
/// <param name="BasedOnTimelineCount">Timeline entries that existed then; a new entry makes the brief stale.</param>
/// <param name="Simulated">True when no model wrote the text (the offline provider).</param>
public sealed record IncidentBriefDto(
    Guid IncidentId,
    string BasedOnVersion,
    int BasedOnTimelineCount,
    int OmittedTimelineEntries,
    DateTimeOffset GeneratedAt,
    string Provider,
    string Model,
    bool Simulated,
    bool FromCache,
    IReadOnlyList<BriefStatementDto> WhatHappened,
    IReadOnlyList<BriefStatementDto> CurrentState,
    IReadOnlyList<BriefStatementDto> OpenQuestions,
    IReadOnlyList<BriefStatementDto> SuggestedChecks,
    IReadOnlyList<BriefSourceDto> Sources);

/// <param name="Refs">Source references, each one present in <see cref="IncidentBriefDto.Sources"/>.</param>
public sealed record BriefStatementDto(string Text, IReadOnlyList<string> Refs);

/// A record the brief cites, described by the server from stored data, never by the model.
public sealed record BriefSourceDto(
    string Ref,
    string Label,
    string? Actor,
    DateTimeOffset OccurredAt,
    string? Detail);
