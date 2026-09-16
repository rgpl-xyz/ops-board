using Microsoft.Extensions.Logging;
using OpsBoard.Application.Common;

namespace OpsBoard.Application.Realtime;

public static class IncidentRealtimePublication
{
    public static async Task TryPublishAsync(
        IIncidentRealtimePublisher publisher,
        ILogger logger,
        Guid organizationId,
        Guid incidentId,
        IncidentRealtimeFactKind kind,
        long version,
        long lifecycleVersion,
        DateTimeOffset occurredAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            await publisher.PublishAsync(
                new IncidentRealtimeFact(
                    organizationId,
                    incidentId,
                    kind,
                    RevisionFormatting.ToWire(version),
                    RevisionFormatting.ToWire(lifecycleVersion),
                    occurredAtUtc),
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Failed to publish incident realtime fact {Kind} for incident {IncidentId} in organization {OrganizationId}",
                kind,
                incidentId,
                organizationId);
        }
    }
}
