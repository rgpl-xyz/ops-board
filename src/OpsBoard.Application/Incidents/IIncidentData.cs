using OpsBoard.Domain.Entities;

namespace OpsBoard.Application.Incidents;

public interface IIncidentData
{
    Task<(IReadOnlyList<IncidentSummaryDto> Items, int TotalCount)> ListAsync(
        Guid organizationId,
        IncidentQuery query,
        CancellationToken cancellationToken);

    Task<IncidentDetailDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken);

    Task<IIncidentWriteSession> BeginCreateAsync(Guid organizationId, CancellationToken cancellationToken);

    Task<IIncidentWriteSession> BeginMutationAsync(
        Guid organizationId,
        Guid incidentId,
        CancellationToken cancellationToken);
}

public interface IIncidentWriteSession : IAsyncDisposable
{
    Incident Incident { get; }

    long Version { get; }

    long LifecycleVersion { get; }

    DateTimeOffset TimestampLowerBound { get; }

    Task<bool> ServiceExistsAsync(Guid serviceId, CancellationToken cancellationToken);

    Task<bool> ActorExistsAsync(Guid userId, CancellationToken cancellationToken);

    Task<bool> HasResponderAsync(Guid userId, CancellationToken cancellationToken);

    void AddIncident(Incident incident);

    void AddResponder(IncidentResponder membership);

    void RemoveResponder(Guid userId);

    void AppendHistory(IncidentTimelineEntry entry);

    void AdvanceScalarRevision(bool lifecycleChanged);

    long PeekNextHistorySequence();

    Task<IncidentTimelineEntry?> CommitAsync(CancellationToken cancellationToken);
}

public interface IIncidentReadData
{
    Task<(IReadOnlyList<ResponderDto> Items, Guid? NextAfter)> ListRespondersAsync(
        Guid organizationId,
        Guid incidentId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken);

    Task<(IReadOnlyList<TimelineEntryDto> Items, int TotalCount)> ListTimelineAsync(
        Guid organizationId,
        Guid incidentId,
        int page,
        int pageSize,
        CancellationToken cancellationToken);
}
