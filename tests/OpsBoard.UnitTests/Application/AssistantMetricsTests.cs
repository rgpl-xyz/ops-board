using System.Diagnostics.Metrics;
using OpsBoard.Application.Assistant;
using OpsBoard.Application.Errors;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

public sealed class AssistantMetricsTests
{
    [Fact]
    public async Task Requests_record_outcome_tokens_and_cost_but_no_incident_text()
    {
        var harness = new AssistantHarness();
        harness.Settings = harness.Settings with { InputUsdPerMillionTokens = 0.15m, OutputUsdPerMillionTokens = 0.60m };
        var measurements = new List<(string Instrument, double Value, Dictionary<string, string?> Tags)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (ReferenceEquals(instrument.Meter, harness.Metrics.Meter))
            {
                l.EnableMeasurementEvents(instrument);
            }
        };
        listener.SetMeasurementEventCallback<long>((i, v, t, _) => measurements.Add((i.Name, v, ToDictionary(t))));
        listener.SetMeasurementEventCallback<double>((i, v, t, _) => measurements.Add((i.Name, v, ToDictionary(t))));
        listener.Start();

        await harness.GenerateAsync();
        await harness.GenerateAsync();
        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "More."));
        harness.Model.AnswerWith("not json");
        await Assert.ThrowsAsync<AssistantUnavailableException>(harness.GenerateAsync);

        var outcomes = measurements.Where(m => m.Instrument == "opsboard.assistant.requests")
            .Select(m => m.Tags["outcome"]);
        Assert.Equal(["generated", "cached", "unverified"], outcomes);
        // The refused reply was still paid for, so it counts toward usage.
        var tokens = measurements.Where(m => m.Instrument == "opsboard.assistant.tokens").ToList();
        Assert.Equal(2 * 1200, tokens.Where(m => m.Tags["direction"] == "input").Sum(m => m.Value));
        Assert.Equal(2 * 180, tokens.Where(m => m.Tags["direction"] == "output").Sum(m => m.Value));
        var cost = measurements.Where(m => m.Instrument == "opsboard.assistant.estimated_cost").Sum(m => m.Value);
        Assert.Equal(2 * (1200 * 0.15 + 180 * 0.60) / 1_000_000, cost, 12);
        Assert.Equal(3, measurements.Count(m => m.Instrument == "opsboard.assistant.duration"));
        Assert.All(
            measurements.SelectMany(m => m.Tags.Values),
            value => Assert.DoesNotContain("Checkout", value ?? ""));
    }

    private static Dictionary<string, string?> ToDictionary(ReadOnlySpan<KeyValuePair<string, object?>> tags)
    {
        var result = new Dictionary<string, string?>();
        foreach (var tag in tags)
        {
            result[tag.Key] = tag.Value?.ToString();
        }

        return result;
    }
}
