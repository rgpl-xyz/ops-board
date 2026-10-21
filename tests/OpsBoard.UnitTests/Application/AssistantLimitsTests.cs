using OpsBoard.Application.Assistant;
using OpsBoard.Application.Errors;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

/// Provider calls are the scarce resource: free tiers allow a few dozen a day.
public sealed class AssistantLimitsTests
{
    [Fact]
    public async Task Unchanged_inputs_are_answered_from_cache_without_calling_the_model()
    {
        var harness = new AssistantHarness();

        var first = await harness.GenerateAsync();
        var second = await harness.GenerateAsync();

        Assert.Single(harness.Model.Requests);
        Assert.False(first.FromCache);
        Assert.True(second.FromCache);
        Assert.Equal(first.WhatHappened.Select(s => s.Text), second.WhatHappened.Select(s => s.Text));
        Assert.Equal(first.GeneratedAt, second.GeneratedAt);
    }

    [Fact]
    public async Task A_new_timeline_entry_or_revision_makes_the_next_brief_fresh()
    {
        var harness = new AssistantHarness();
        await harness.GenerateAsync();

        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Rolled back the 09:40 deploy."));
        await harness.GenerateAsync();
        harness.Incident = harness.Incident! with { Severity = IncidentSeverity.Critical, Version = "4" };
        await harness.GenerateAsync();

        Assert.Equal(3, harness.Model.Requests.Count);
    }

    [Fact]
    public async Task A_cached_brief_is_still_refused_once_the_incident_is_out_of_reach()
    {
        var harness = new AssistantHarness();
        await harness.GenerateAsync();

        harness.Incident = null;

        await Assert.ThrowsAsync<UnavailableException>(harness.GenerateAsync);
    }

    [Fact]
    public async Task The_daily_limit_stops_provider_calls_until_midnight_utc_but_not_cached_answers()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { DailyRequestLimit = 2 };
        harness.Clock.UtcNow = DateTimeOffset.Parse("2026-10-01T22:30:00Z");

        await harness.GenerateAsync();
        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Second change."));
        await harness.GenerateAsync();
        var cached = await harness.GenerateAsync();
        harness.Timeline.Add(AssistantHarness.Entry(4, TimelineEntryType.WrittenUpdate, "Third change."));
        var error = await Assert.ThrowsAsync<AssistantUnavailableException>(harness.GenerateAsync);

        Assert.True(cached.FromCache);
        Assert.Equal(AssistantFailure.DailyLimitReached, error.Failure);
        Assert.Equal(TimeSpan.FromMinutes(90), error.RetryAfter);
        Assert.Equal(2, harness.Model.Requests.Count);

        harness.Clock.UtcNow = DateTimeOffset.Parse("2026-10-02T00:00:01Z");
        var nextDay = await harness.GenerateAsync();
        Assert.False(nextDay.FromCache);
        Assert.Equal(3, harness.Model.Requests.Count);
    }

    [Fact]
    public async Task One_visitor_is_held_to_its_limit_while_others_still_get_briefs()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { VisitorRequestLimit = 2, VisitorWindowMinutes = 10 };

        await harness.GenerateAsync("visitor-a");
        harness.Clock.UtcNow += TimeSpan.FromMinutes(4);
        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Second change."));
        await harness.GenerateAsync("visitor-a");
        var cached = await harness.GenerateAsync("visitor-a");
        harness.Timeline.Add(AssistantHarness.Entry(4, TimelineEntryType.WrittenUpdate, "Third change."));
        var error = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.GenerateAsync("visitor-a"));
        var other = await harness.GenerateAsync("visitor-b");

        Assert.True(cached.FromCache);
        Assert.Equal(AssistantFailure.VisitorLimitReached, error.Failure);
        Assert.Equal(TimeSpan.FromMinutes(6), error.RetryAfter);
        Assert.False(other.FromCache);
        Assert.Equal(3, harness.Model.Requests.Count);
    }

    [Fact]
    public async Task A_visitor_can_start_briefs_again_once_its_oldest_leaves_the_window()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { VisitorRequestLimit = 1, VisitorWindowMinutes = 10 };
        await harness.GenerateAsync("visitor-a");
        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Second change."));
        await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.GenerateAsync("visitor-a"));

        harness.Clock.UtcNow += TimeSpan.FromMinutes(10);
        var brief = await harness.GenerateAsync("visitor-a");

        Assert.False(brief.FromCache);
        Assert.Equal(2, harness.Model.Requests.Count);
    }

    [Fact]
    public async Task A_visitor_turned_away_spends_none_of_the_daily_allowance()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { DailyRequestLimit = 2, VisitorRequestLimit = 1 };
        await harness.GenerateAsync("visitor-a");
        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Second change."));

        var refused = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.GenerateAsync("visitor-a"));
        var other = await harness.GenerateAsync("visitor-b");

        Assert.Equal(AssistantFailure.VisitorLimitReached, refused.Failure);
        Assert.False(other.FromCache);
        Assert.Equal(2, harness.Model.Requests.Count);
    }

    [Fact]
    public async Task Requests_beyond_the_concurrency_limit_are_turned_away_at_once()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { MaxConcurrentRequests = 1 };
        var release = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        harness.Model.Answer = (_, _) => release.Task;

        var first = harness.GenerateAsync();
        var error = await Assert.ThrowsAsync<AssistantUnavailableException>(harness.GenerateAsync);
        release.SetResult(AssistantHarness.Reply());
        await first;

        Assert.Equal(AssistantFailure.Busy, error.Failure);
        Assert.NotNull(error.RetryAfter);
        Assert.Single(harness.Model.Requests);
    }

    [Fact]
    public async Task A_failed_call_gives_back_its_concurrency_slot()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { MaxConcurrentRequests = 1 };
        harness.Model.FailWith(new InferenceFailedException(InferenceFailure.Unavailable, "502 from provider"));
        await Assert.ThrowsAsync<AssistantUnavailableException>(harness.GenerateAsync);

        harness.Model.AnswerWith(AssistantHarness.Reply());
        var brief = await harness.GenerateAsync();

        Assert.False(brief.FromCache);
    }

    public static TheoryData<InferenceFailure, AssistantFailure> ProviderFailures => new()
    {
        { InferenceFailure.RateLimited, AssistantFailure.Busy },
        { InferenceFailure.Unavailable, AssistantFailure.ProviderUnavailable },
        { InferenceFailure.TimedOut, AssistantFailure.ProviderUnavailable },
        { InferenceFailure.InvalidResponse, AssistantFailure.UnverifiedResponse },
    };

    [Theory]
    [MemberData(nameof(ProviderFailures))]
    public async Task Provider_failures_become_failures_a_person_can_act_on(InferenceFailure failure, AssistantFailure expected)
    {
        var harness = new AssistantHarness();
        harness.Model.FailWith(new InferenceFailedException(failure, "provider said no", TimeSpan.FromSeconds(20)));

        var error = await Assert.ThrowsAsync<AssistantUnavailableException>(harness.GenerateAsync);

        Assert.Equal(expected, error.Failure);
        if (failure == InferenceFailure.RateLimited)
        {
            Assert.Equal(TimeSpan.FromSeconds(20), error.RetryAfter);
        }
    }

    [Fact]
    public async Task A_model_that_never_answers_is_abandoned_at_the_request_timeout()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { RequestTimeout = TimeSpan.FromMilliseconds(50) };
        harness.Model.Answer = async (_, token) =>
        {
            await Task.Delay(Timeout.Infinite, token);
            return "";
        };

        var error = await Assert.ThrowsAsync<AssistantUnavailableException>(harness.GenerateAsync);

        Assert.Equal(AssistantFailure.ProviderUnavailable, error.Failure);
    }

    [Fact]
    public async Task A_caller_that_goes_away_cancels_the_call_without_reporting_a_provider_fault()
    {
        var harness = new AssistantHarness();
        harness.Model.Answer = async (_, token) =>
        {
            await Task.Delay(Timeout.Infinite, token);
            return "";
        };
        using var caller = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => harness.Service.GenerateAsync(AssistantHarness.IncidentId, "visitor-a", caller.Token));
    }

    [Fact]
    public void Briefs_and_questions_keep_separate_allowances_but_share_the_calls_in_flight()
    {
        var settings = new AssistantSettings(
            Enabled: true,
            DailyRequestLimit: 20,
            MaxConcurrentRequests: 1,
            RequestTimeout: TimeSpan.FromSeconds(30),
            VisitorRequestLimit: 1,
            QuestionsEnabled: true,
            QuestionVisitorLimit: 1);
        var gate = new AssistantUsageGate(settings, new MutableTimeProvider(DateTimeOffset.Parse("2026-10-01T12:00:00Z")));

        using (gate.Enter("visitor-a"))
        {
            var busy = Assert.Throws<AssistantUnavailableException>(() => gate.EnterQuestion("visitor-b"));
            Assert.Equal(AssistantFailure.Busy, busy.Failure);
        }

        using (gate.EnterQuestion("visitor-a"))
        {
        }

        Assert.Equal(AssistantFailure.VisitorLimitReached, Assert.Throws<AssistantUnavailableException>(() => gate.Enter("visitor-a")).Failure);
        Assert.Equal(AssistantFailure.QuestionLimitReached, Assert.Throws<AssistantUnavailableException>(() => gate.EnterQuestion("visitor-a")).Failure);
    }
}
