namespace OpsBoard.IntegrationTests.Realtime;

public sealed class OrgGroupsTests
{
    [Fact]
    public void Name_uses_org_prefix_and_D_format()
    {
        var id = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        Assert.Equal("org:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", OpsBoard.Api.Realtime.OrgGroups.Name(id));
    }
}
