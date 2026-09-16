namespace OpsBoard.Api.Realtime;

public static class OrgGroups
{
    public static string Name(Guid organizationId) => $"org:{organizationId:D}";
}
