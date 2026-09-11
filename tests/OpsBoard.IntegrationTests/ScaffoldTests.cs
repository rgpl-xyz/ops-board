namespace OpsBoard.IntegrationTests;

public class ScaffoldTests
{
    [Fact]
    public void Integration_project_references_api_assembly()
    {
        var name = typeof(Program).Assembly.GetName().Name;
        Assert.Equal("OpsBoard.Api", name);
    }
}
