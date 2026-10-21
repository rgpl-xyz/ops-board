using OpsBoard.Application.Errors;

namespace OpsBoard.Application.Assistant;

/// Bounds provider calls: how many run at once, how many one visitor starts in
/// a short window, and how many run per UTC day. The demo has one shared
/// identity, so the daily limit is global and visitors are told apart by the
/// key the API gives them. Briefs and questions share the slots for calls in
/// flight but each have their own allowances.
public sealed class AssistantUsageGate
{
    private static readonly TimeSpan BusyRetryAfter = TimeSpan.FromSeconds(5);

    private readonly SemaphoreSlim _slots;
    private readonly Allowance _briefs;
    private readonly Allowance _questions;

    public AssistantUsageGate(AssistantSettings settings, TimeProvider timeProvider)
    {
        _slots = new SemaphoreSlim(settings.MaxConcurrentRequests, settings.MaxConcurrentRequests);
        _briefs = new Allowance(
            settings.DailyRequestLimit,
            settings.VisitorRequestLimit,
            settings.VisitorWindow,
            AssistantFailure.VisitorLimitReached,
            timeProvider);
        _questions = new Allowance(
            settings.QuestionDailyLimit,
            settings.QuestionVisitorLimit,
            settings.VisitorWindow,
            AssistantFailure.QuestionLimitReached,
            timeProvider);
    }

    /// Takes a slot and one brief from today's and the visitor's allowance, or refuses at once.
    /// <exception cref="AssistantUnavailableException">Busy or out of allowance.</exception>
    public IDisposable Enter(string visitor) => Enter(_briefs, visitor);

    /// Takes a slot and one question from today's and the visitor's allowance,
    /// or refuses at once. The slot is held for every call the question makes.
    /// <exception cref="AssistantUnavailableException">Busy or out of allowance.</exception>
    public IDisposable EnterQuestion(string visitor) => Enter(_questions, visitor);

    private IDisposable Enter(Allowance allowance, string visitor)
    {
        if (!_slots.Wait(0))
        {
            throw new AssistantUnavailableException(AssistantFailure.Busy, BusyRetryAfter);
        }

        try
        {
            allowance.Consume(visitor);
        }
        catch
        {
            _slots.Release();
            throw;
        }

        return new Lease(_slots);
    }

    private sealed class Allowance(
        int dailyLimit,
        int visitorLimit,
        TimeSpan visitorWindow,
        AssistantFailure visitorFailure,
        TimeProvider timeProvider)
    {
        private readonly Lock _sync = new();
        private readonly Dictionary<string, Queue<DateTimeOffset>> _visitorCalls = new(StringComparer.Ordinal);
        private DateOnly _day;
        private int _used;

        /// Checks both limits before spending either, so a refused call costs nothing.
        public void Consume(string visitor)
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

                if (_used >= dailyLimit)
                {
                    var midnight = new DateTimeOffset(today.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                    throw new AssistantUnavailableException(AssistantFailure.DailyLimitReached, midnight - now);
                }

                ForgetCallsBefore(now - visitorWindow);
                var calls = _visitorCalls.GetValueOrDefault(visitor);
                if (calls is not null && calls.Count >= visitorLimit)
                {
                    throw new AssistantUnavailableException(visitorFailure, calls.Peek() + visitorWindow - now);
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
