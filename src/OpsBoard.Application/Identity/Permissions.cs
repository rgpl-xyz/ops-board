using OpsBoard.Application.Errors;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Identity;

public static class Permissions
{
    public static void RequireRead(UserRole role)
    {
        // All four roles may read.
        _ = role;
    }

    public static void RequireResponse(UserRole role)
    {
        if (role is not (UserRole.Responder or UserRole.IncidentManager or UserRole.Administrator))
        {
            throw new ForbiddenException();
        }
    }

    public static void RequireManage(UserRole role)
    {
        if (role is not (UserRole.IncidentManager or UserRole.Administrator))
        {
            throw new ForbiddenException();
        }
    }
}
