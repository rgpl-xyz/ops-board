namespace OpsBoard.UnitTests;

public class ScaffoldTests
{
    [Fact]
    public void Solution_compiles_with_domain_marker()
    {
        var name = typeof(OpsBoard.Domain.AssemblyMarker).Assembly.GetName().Name;
        Assert.Equal("OpsBoard.Domain", name);
    }
}
