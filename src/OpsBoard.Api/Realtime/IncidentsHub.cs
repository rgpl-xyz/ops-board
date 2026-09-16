using Microsoft.AspNetCore.SignalR;
using OpsBoard.Application.Identity;

namespace OpsBoard.Api.Realtime;

public sealed class IncidentsHub(ICurrentUser currentUser) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var user = await currentUser.GetAsync(Context.ConnectionAborted);
        await Groups.AddToGroupAsync(Context.ConnectionId, OrgGroups.Name(user.OrganizationId));
        await base.OnConnectedAsync();
    }
}
