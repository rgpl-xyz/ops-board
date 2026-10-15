using OpsBoard.Application.Errors;

namespace OpsBoard.Application.Assistant;

/// Bounds provider calls: how many run at once, how many one visitor starts in
/// a short window, and how many run per UTC day. The demo has one shared
/// identity, so the daily limit is global and visitors are told apart by the
/// key the API gives them.
public sealed class AssistantUsageGate(AssistantSettings settings, TimeProvider timeProvider)
{
    private static readonly TimeSpan BusyRetryAfter = TimeSpan.FromSeconds(5);

    private readonly SemaphoreSlim _slots = new(settings.MaxConcurrentRequests, settings.MaxConcurrentRequests);
    private readonly Lock _sync = new();
    private readonly Dictionary<string, Queue<DateTimeOffset>> _visitorCalls = new(StringComparer.Ordinal);
    private DateOnly _day;
    private int _used;

    /// Takes a slot and one call from today's and the visitor's allowance, or refuses at once.
    /// <exception cref="AssistantUnavailableException">Busy or out of allowance.</exception>
    public IDisposable Enter(string visitor)
    {
        if (!_slots.Wait(0))
        {
            throw new AssistantUnavailableException(AssistantFailure.Busy, BusyRetryAfter);
        }

        try
        {
            ConsumeAllowance(visitor);
        }
        catch
        {
            _slots.Release();
            throw;
        }

        return new Lease(_slots);
    }

    /// Checks both allowances before spending either, so a refused call costs nothing.
    private void ConsumeAllowance(string visitor)
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

            ForgetCallsBefore(now - settings.VisitorWindow);
            var calls = _visitorCalls.GetValueOrDefault(visitor);
            if (calls is not null && calls.Count >= settings.VisitorRequestLimit)
            {
                throw new AssistantUnavailableException(
                    AssistantFailure.VisitorLimitReached,
                    calls.Peek() + settings.VisitorWindow - now);
            }

            _used++;
            if (calls is null)
            {
                calls = new Queue<DateTimeOffset>();
                _visitorCalls[visitor] = calls;
            }

            calls.Enqueue(now);
        }
    }

    /// Only calls that were let through are remembered, so this holds no more
    /// entries than the daily limit allows.
    private void ForgetCallsBefore(DateTimeOffset cutoff)
    {
        foreach (var (visitor, calls) in _visitorCalls)
        {
            while (calls.Count > 0 && calls.Peek() <= cutoff)
            {
                calls.Dequeue();
            }

            if (calls.Count == 0)
            {
                _visitorCalls.Remove(visitor);
            }
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
