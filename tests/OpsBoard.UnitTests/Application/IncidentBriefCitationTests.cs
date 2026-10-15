using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

/// Models sometimes cite the incident record for a detail that only a timeline
/// entry gives. The server adds that entry, and never changes the text.
public sealed class IncidentBriefCitationTests
{
    [Fact]
    public async Task A_fact_gets_the_one_record_that_holds_its_number_when_the_model_left_it_out()
    {
        var harness = new AssistantHarness();
        harness.Model.AnswerWith(AssistantHarness.Reply(currentState: [("Checkout errors are at 12% of requests.", ["I"])]));

        var brief = await harness.GenerateAsync();

        var statement = Assert.Single(brief.CurrentState);
        Assert.Equal("Checkout errors are at 12% of requests.", statement.Text);
        Assert.Equal(["I", "T2"], statement.Refs);
        Assert.Contains(brief.Sources, s => s.Ref == "T2");
    }

    [Fact]
    public async Task A_detail_that_several_records_hold_adds_nothing()
    {
        var harness = new AssistantHarness();
        harness.Timeline.Add(AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Errors are still at 12%."));
        harness.Model.AnswerWith(AssistantHarness.Reply(currentState: [("Checkout errors are at 12% of requests.", ["I"])]));

        var brief = await harness.GenerateAsync();

        Assert.Equal(["I"], Assert.Single(brief.CurrentState).Refs);
    }

    [Fact]
    public async Task A_name_or_time_that_only_one_entry_holds_cites_that_entry()
    {
        var harness = new AssistantHarness();
        harness.Timeline.Add(
            AssistantHarness.Entry(3, TimelineEntryType.WrittenUpdate, "Rolled back the deploy.") with { ActorDisplayName = "Jordan Patel" });
        harness.Model.AnswerWith(AssistantHarness.Reply(whatHappened:
        [
            ("Jordan rolled back the deploy.", ["I"]),
            ("The rollback was reported at 08:15.", ["I"]),
        ]));

        var brief = await harness.GenerateAsync();

        Assert.All(brief.WhatHappened, statement => Assert.Equal(["I", "T3"], statement.Refs));
    }

    [Fact]
    public async Task Questions_and_suggested_checks_keep_the_references_the_model_gave()
    {
        var harness = new AssistantHarness();
        harness.Model.AnswerWith(AssistantHarness.Reply(
            openQuestions: [("Why did errors reach 12%?", [])],
            suggestedChecks: [("Check whether errors stay at 12%.", [])]));

        var brief = await harness.GenerateAsync();

        Assert.Empty(Assert.Single(brief.OpenQuestions).Refs);
        Assert.Empty(Assert.Single(brief.SuggestedChecks).Refs);
    }
}
