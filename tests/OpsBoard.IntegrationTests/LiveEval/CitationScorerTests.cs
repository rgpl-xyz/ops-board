using System.Text.Json;
using Xunit;

namespace OpsBoard.IntegrationTests.LiveEval;

/// The live evaluation's scorer on hand-made records, so its numbers can be
/// trusted before any model is called. Needs no database or network.
[Trait("Category", "Evaluation")]
public sealed class CitationScorerTests
{
    private static readonly JsonElement Incident = Json(new
    {
        id = "10000000-0000-4000-8000-000000050001",
        title = "Checkout errors after a deploy",
        description = "About 4% of checkout requests failed after the 10:50 deploy.",
        serviceName = "Payments API",
        teamName = "Payments",
        createdAt = "2026-08-01T10:52:00+00:00",
        lifecycleVersion = "12",
    });

    /// Newest first, as the API pages it, so the opening is T1 and the update T2.
    private static readonly JsonElement[] Timeline =
    [
        Json(new
        {
            id = "b",
            occurredAt = "2026-08-01T11:20:00+00:00",
            actorDisplayName = "Casey Lin",
            body = "Rolled back at 11:15; errors are down to 0.2%.",
        }),
        Json(new { id = "a", occurredAt = "2026-08-01T10:52:00+00:00", actorDisplayName = "Morgan Reed", body = (string?)null }),
    ];

    [Fact]
    public void Details_a_cited_record_holds_count_as_cited()
    {
        var score = Score(Brief(whatHappened: [Statement("Casey rolled back at 11:15, and errors fell to 0.2%.", "T2")]));

        Assert.Equal((3, 3), (score.Details, score.Cited));
        Assert.Empty(score.Findings);
    }

    [Fact]
    public void A_detail_only_an_uncited_record_holds_counts_as_uncited()
    {
        var score = Score(Brief(whatHappened: [Statement("Checkout requests began failing at 10:50.", "T2")]));

        Assert.Equal(1, score.Uncited);
        Assert.Equal("uncited 10:50 (in I; cites T2) | Checkout requests began failing at 10:50.", Assert.Single(score.Findings));
    }

    [Fact]
    public void A_detail_no_record_holds_counts_as_unsupported()
    {
        var score = Score(Brief(whatHappened: [Statement("The rollback took 25 minutes.", "T2")]));

        Assert.Equal(1, score.Unsupported);
        Assert.Equal("unsupported 25 | The rollback took 25 minutes.", Assert.Single(score.Findings));
    }

    [Fact]
    public void Small_whole_numbers_are_not_checked_but_percentages_are()
    {
        var score = Score(Brief(whatHappened: [Statement("About 4% of requests failed across 3 regions.", "I")]));

        Assert.Equal((1, 1), (score.Details, score.Cited));
    }

    [Fact]
    public void Omitted_entries_move_the_timeline_labels()
    {
        var score = Score(Brief(whatHappened: [Statement("Casey rolled back at 11:15.", "T1")], omitted: 1));

        Assert.Equal((2, 2), (score.Details, score.Cited));
    }

    [Fact]
    public void A_reference_written_into_the_text_is_counted()
    {
        var score = Score(Brief(suggestedChecks: [Statement("Watch the error rate after the rollback (T2).", "T2")]));

        Assert.Equal(1, score.InlineRefs);
        Assert.Equal("reference in the text | Watch the error rate after the rollback (T2).", Assert.Single(score.Findings));
    }

    [Theory]
    [InlineData("A similar card payment issue occurred in August (R1).")]
    [InlineData("The provider recovered at 09:03 [I, T8].")]
    [InlineData("The postmortem names a missing retry limit (P).")]
    public void A_reference_written_into_an_answer_is_found(string sentence) =>
        Assert.True(CitationScorer.WritesReference(sentence));

    [Theory]
    [InlineData("Every slow request reads from replica db-auth-c (the one replaying a migration).")]
    [InlineData("Errors fell to 0.2% (from 4%).")]
    [InlineData("Checkout fails in the EU (Ireland and Germany).")]
    public void Ordinary_brackets_are_not_taken_for_a_reference(string sentence) =>
        Assert.False(CitationScorer.WritesReference(sentence));

    private static BriefScore Score(JsonElement brief) => CitationScorer.Score(Incident, Timeline, brief);

    private static JsonElement Brief(object[]? whatHappened = null, object[]? suggestedChecks = null, int omitted = 0) =>
        Json(new
        {
            omittedTimelineEntries = omitted,
            whatHappened = whatHappened ?? [],
            currentState = Array.Empty<object>(),
            openQuestions = Array.Empty<object>(),
            suggestedChecks = suggestedChecks ?? [],
        });

    private static object Statement(string text, params string[] refs) => new { text, refs };

    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);
}
