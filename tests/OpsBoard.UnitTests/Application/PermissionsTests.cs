using OpsBoard.Application.Errors;
using OpsBoard.Application.Identity;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

public class PermissionsTests
{
    [Theory]
    [InlineData(UserRole.Viewer)]
    [InlineData(UserRole.Responder)]
    [InlineData(UserRole.IncidentManager)]
    [InlineData(UserRole.Administrator)]
    public void RequireRead_allows_all_roles(UserRole role)
    {
        Permissions.RequireRead(role);
    }

    [Theory]
    [InlineData(UserRole.Responder)]
    [InlineData(UserRole.IncidentManager)]
    [InlineData(UserRole.Administrator)]
    public void RequireResponse_allows_responder_and_above(UserRole role)
    {
        Permissions.RequireResponse(role);
    }

    [Fact]
    public void RequireResponse_rejects_viewer()
    {
        Assert.Throws<ForbiddenException>(() => Permissions.RequireResponse(UserRole.Viewer));
    }

    [Theory]
    [InlineData(UserRole.IncidentManager)]
    [InlineData(UserRole.Administrator)]
    public void RequireManage_allows_managers(UserRole role)
    {
        Permissions.RequireManage(role);
    }

    [Theory]
    [InlineData(UserRole.Viewer)]
    [InlineData(UserRole.Responder)]
    public void RequireManage_rejects_non_managers(UserRole role)
    {
        Assert.Throws<ForbiddenException>(() => Permissions.RequireManage(role));
    }
}
