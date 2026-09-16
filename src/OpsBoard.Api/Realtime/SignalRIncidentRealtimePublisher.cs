using Microsoft.AspNetCore.SignalR;
using OpsBoard.Application.Realtime;

namespace OpsBoard.Api.Realtime;

public sealed class SignalRIncidentRealtimePublisher(
    IHubContext<IncidentsHub> hub) : IIncidentRealtimePublisher
{
    public Task PublishAsync(IncidentRealtimeFact fact, CancellationToken cancellationToken) =>
        hub.Clients
            .Group(OrgGroups.Name(fact.OrganizationId))
            .SendAsync("incidentFact", fact, cancellationToken);
}
