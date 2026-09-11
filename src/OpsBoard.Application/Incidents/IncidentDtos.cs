using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Incidents;

public sealed record CreateIncidentRequest(
    string Title,
    string Description,
    Guid ServiceId,
    IncidentSeverity Severity);

public sealed record UpdateIncidentRequest(
    string Title,
    string Description,
    Guid ServiceId,
    string ExpectedVersion);

public sealed record SeverityRequest(IncidentSeverity Severity, string ExpectedVersion);

public sealed record StatusRequest(IncidentStatus Status, string ExpectedVersion);

public sealed record VersionRequest(string ExpectedVersion);

public sealed record LifecycleVersionRequest(string ExpectedLifecycleVersion);

public sealed record WrittenUpdateRequest(string Body, string ExpectedLifecycleVersion);

public sealed record IncidentSummaryDto(
    Guid Id,
    string Title,
    Guid ServiceId,
    string ServiceName,
    Guid TeamId,
    string TeamName,
    IncidentSeverity Severity,
    IncidentStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ResolvedAt,
    string Version,
    string LifecycleVersion);

public sealed record IncidentDetailDto(
    Guid Id,
    string Title,
    string Description,
    Guid ServiceId,
    string ServiceName,
    Guid TeamId,
    string TeamName,
    Guid CreatedByUserId,
    IncidentSeverity Severity,
    IncidentStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ResolvedAt,
    string Version,
    string LifecycleVersion);

public sealed record ResponderDto(Guid UserId, string DisplayName, DateTimeOffset JoinedAt);

public sealed record TimelineEntryDto(
    Guid Id,
    string Sequence,
    DateTimeOffset OccurredAt,
    Guid ActorUserId,
    string ActorDisplayName,
    TimelineEntryType Type,
    string Kind,
    string? Body,
    IncidentStatus? FromStatus,
    IncidentStatus? ToStatus,
    IncidentSeverity? FromSeverity,
    IncidentSeverity? ToSeverity);

public sealed record ResponseMutationDto(
    Guid IncidentId,
    string Version,
    string LifecycleVersion,
    TimelineEntryDto Entry,
    ResponderDto? Responder);

public sealed record IncidentQuery(
    int Page = 1,
    int PageSize = 25,
    Guid? ServiceId = null,
    Guid? TeamId = null,
    IncidentSeverity? Severity = null,
    IncidentStatus? Status = null,
    string? Search = null,
    string Sort = "createdAt",
    string Direction = "desc");
