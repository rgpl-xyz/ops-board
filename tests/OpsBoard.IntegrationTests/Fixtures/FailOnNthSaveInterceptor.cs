using Microsoft.EntityFrameworkCore.Diagnostics;

namespace OpsBoard.IntegrationTests.Fixtures;

/// Fails a chosen SaveChanges so a test can observe what survives a failure
/// between a domain operation and its commit. Lives in the test project: the
/// production write path carries no test seam.
internal sealed class FailOnNthSaveInterceptor(int failOnCall) : SaveChangesInterceptor
{
    private int _calls;

    internal bool Armed { get; set; } = true;

    internal int Calls => _calls;

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        _calls++;
        if (Armed && _calls == failOnCall)
        {
            throw new InvalidOperationException(
                "Injected failure before commit (FailOnNthSaveInterceptor).");
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}
