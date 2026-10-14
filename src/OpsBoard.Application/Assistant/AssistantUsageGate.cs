using OpsBoard.Application.Errors;

namespace OpsBoard.Application.Assistant;

/// Bounds provider calls: how many run at once and how many run per UTC day.
/// The demo has one shared identity, so the daily limit is global.
public sealed class AssistantUsageGate(AssistantSettings settings, TimeProvider timeProvider)
{
    private static readonly TimeSpan BusyRetryAfter = TimeSpan.FromSeconds(5);

    private readonly SemaphoreSlim _slots = new(settings.MaxConcurrentRequests, settings.MaxConcurrentRequests);
    private readonly Lock _sync = new();
    private DateOnly _day;
    private int _used;

    /// Takes a slot and one call from today's allowance, or refuses at once.
    /// <exception cref="AssistantUnavailableException">Busy or out of allowance.</exception>
    public IDisposable Enter()
    {
        if (!_slots.Wait(0))
        {
            throw new AssistantUnavailableException(AssistantFailure.Busy, BusyRetryAfter);
        }

        try
        {
            ConsumeDailyAllowance();
        }
        catch
        {
            _slots.Release();
            throw;
        }

        return new Lease(_slots);
    }

    private void ConsumeDailyAllowance()
    {
        var now = timeProvider.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        lock (_sync)
        {
            if (today != _day)
            {
                _day = today;
                _used = 0;
            }

            if (_used >= settings.DailyRequestLimit)
            {
                var midnight = new DateTimeOffset(today.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                throw new AssistantUnavailableException(AssistantFailure.DailyLimitReached, midnight - now);
            }

            _used++;
        }
    }

    private sealed class Lease(SemaphoreSlim slots) : IDisposable
    {
        private int _released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                slots.Release();
            }
        }
    }
}
