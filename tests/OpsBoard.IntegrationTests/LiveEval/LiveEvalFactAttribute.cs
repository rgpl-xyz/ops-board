using Xunit;

namespace OpsBoard.IntegrationTests.LiveEval;

/// A test that calls a real model. It is skipped unless OpsBoardTests__LiveEval is
/// true, so the ordinary suite and the automated run never spend a provider's quota.
public sealed class LiveEvalFactAttribute : FactAttribute
{
    public const string Switch = "OpsBoardTests__LiveEval";

    public LiveEvalFactAttribute()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable(Switch), "true", StringComparison.OrdinalIgnoreCase))
        {
            Skip = $"Calls a real model. Set {Switch}=true and the Assistant__Provider__* settings to run it.";
        }
    }
}
