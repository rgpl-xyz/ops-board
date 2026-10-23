using System.Text.Json;
using OpsBoard.Application.Assistant;
using OpsBoard.Application.Errors;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

public sealed class IncidentQuestionServiceTests
{
    [Fact]
    public async Task An_answer_carries_the_model_sentences_and_only_the_sources_they_cite()
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply(
            answer: [("Checkout errors rose to 12% after the 09:40 deploy.", ["T2"])]));

        var answer = await harness.AskAsync("When did the errors start?");

        Assert.True(answer.Answered);
        var sentence = Assert.Single(answer.Sentences);
        Assert.Equal("Checkout errors rose to 12% after the 09:40 deploy.", sentence.Text);
        Assert.Equal(["T2"], sentence.Refs);
        var source = Assert.Single(answer.Sources);
        Assert.Equal("T2", source.Ref);
        Assert.Equal("Written update", source.Label);
        Assert.Equal("Avery Chen", source.Actor);
        Assert.Equal(AssistantHarness.IncidentId, answer.IncidentId);
        Assert.Equal("Scripted", answer.Provider);
        Assert.Equal("scripted-model", answer.Model);
        Assert.False(answer.Simulated);

        // The question travels as data beside the records, never as instructions.
        var request = Assert.Single(harness.Model.Requests);
        Assert.Equal(IncidentQuestionPrompt.SystemPrompt, request.SystemPrompt);
        using var data = JsonDocument.Parse(request.Data);
        Assert.Equal("When did the errors start?", data.RootElement.GetProperty("question").GetString());
    }

    [Fact]
    public async Task When_the_records_do_not_answer_there_is_no_answer_and_no_source()
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply());

        var answer = await harness.AskAsync("What will the weather be tomorrow?");

        Assert.False(answer.Answered);
        Assert.Empty(answer.Sentences);
        Assert.Empty(answer.Sources);
    }

    [Fact]
    public async Task A_related_incident_is_read_by_its_label_and_can_then_be_cited()
    {
        var harness = new QuestionHarness();
        harness.AnswerInRounds(
            QuestionHarness.Reply(lookups: [(IncidentQuestionPrompt.ReadRelatedIncident, "R1")]),
            QuestionHarness.Reply(answer: [("Last time the promo deploy was rolled back at 14:20 and a canary stage was added.", ["R1"])]));

        var answer = await harness.AskAsync("How was this fixed last time?");

        Assert.True(answer.Answered);
        var source = Assert.Single(answer.Sources);
        Assert.Equal("R1", source.Ref);
        Assert.Equal("Related incident", source.Label);
        Assert.Equal("Checkout errors after a promo deploy", source.Detail);

        Assert.Equal(2, harness.Model.Requests.Count);
        using var first = JsonDocument.Parse(harness.Model.Requests[0].Data);
        using var second = JsonDocument.Parse(harness.Model.Requests[1].Data);
        Assert.Equal(IncidentQuestionPrompt.MaxLookups, first.RootElement.GetProperty("lookupsAllowed").GetInt32());
        Assert.Equal(0, second.RootElement.GetProperty("lookupsAllowed").GetInt32());
        var related = second.RootElement.GetProperty("relatedIncidents")[0];
        Assert.Equal("R1", related.GetProperty("ref").GetString());
        Assert.Contains("canary stage", related.GetProperty("read").GetProperty("postmortem").GetProperty("resolution").GetString());
        Assert.DoesNotContain(QuestionHarness.RelatedId.ToString(), harness.Model.Requests[1].Data, StringComparison.OrdinalIgnoreCase);

        // Every read, the lookup's included, was made for the caller's organization.
        Assert.Contains(harness.Reads, r => r.IncidentId == QuestionHarness.RelatedId);
        Assert.All(harness.Reads, r => Assert.Equal(AssistantHarness.OrgId, r.OrganizationId));
    }

    /// Replies a model could send if it followed injected instructions
    /// perfectly. None may reach a person, and none reads anything more.
    public static TheoryData<string, string> RepliesOutsideTheContract => new()
    {
        { "a sentence with no source", QuestionHarness.Reply(answer: [("Checkout errors rose.", [])]) },
        { "a source the server never sent", QuestionHarness.Reply(answer: [("Checkout errors rose.", ["T9"])]) },
        { "an incident ID as a source", QuestionHarness.Reply(answer: [("A related outage.", [QuestionHarness.RelatedId.ToString()])]) },
        { "a tool that does not exist", QuestionHarness.Reply(lookups: [("resolve_incident", "R1")]) },
        { "a lookup by incident ID", QuestionHarness.Reply(lookups: [(IncidentQuestionPrompt.ReadRelatedIncident, QuestionHarness.RelatedId.ToString())]) },
        { "a related incident never offered", QuestionHarness.Reply(lookups: [(IncidentQuestionPrompt.ReadRelatedIncident, "R2")]) },
        {
            "more lookups than allowed",
            QuestionHarness.Reply(lookups: [(IncidentQuestionPrompt.ReadRelatedIncident, "R1"), (IncidentQuestionPrompt.ReadRelatedIncident, "R1"), (IncidentQuestionPrompt.ReadRelatedIncident, "R1")])
        },
        {
            "a lookup with an extra argument",
            """{"lookups":[{"tool":"read_related_incident","ref":"R1","organizationId":"99999999-9999-9999-9999-999999999999"}],"answer":[]}"""
        },
        { "prose instead of JSON", "Sure! The errors started at 09:40." },
        { "an extra field", """{"lookups":[],"answer":[],"links":["https://example.com"]}""" },
        { "too many sentences", QuestionHarness.Reply(answer: Enumerable.Repeat(("Checkout errors rose.", new[] { "T2" }), 6).ToArray()) },
        { "an overlong sentence", QuestionHarness.Reply(answer: [(new string('x', 301), ["T2"])]) },
    };

    [Theory]
    [MemberData(nameof(RepliesOutsideTheContract))]
    public async Task A_reply_outside_the_contract_is_refused_without_reading_more(string attempt, string reply)
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(reply);

        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync());

        Assert.True(failure.Failure == AssistantFailure.UnverifiedResponse, attempt);
        Assert.DoesNotContain(harness.Reads, r => r.IncidentId == QuestionHarness.RelatedId);
        Assert.Single(harness.Model.Requests);
    }

    /// Sentences in the contract's shape that their sources do not support.
    public static TheoryData<string, string, string[]> UnsupportedSentences => new()
    {
        { "a number no cited record holds", "Checkout errors rose to 40% after the deploy.", ["T2"] },
        { "a clock time no cited record holds", "Checkout errors rose at 10:15 after the deploy.", ["T2"] },
        { "a person no cited record names", "Avery Chen reported the checkout failures.", ["I"] },
        { "a detail from a record it does not cite", "Checkout errors rose to 12% after the deploy.", ["I"] },
        { "nothing in common with its sources", "Clouds drift softly over silent hills.", ["I"] },
        { "a task unrelated to the incident", "Here is a recipe: whisk eggs, sugar and flour.", ["I", "T2"] },
        { "a date no cited record holds", "Checkout errors after a promo deploy also happened on 2026-09-13.", ["R1"] },
        { "a duration no cited record holds", "The promo deploy checkout errors lasted 48 minutes.", ["R1"] },
        { "a person who did not write the cited entry", "Jordan Patel opened the incident at 08:05.", ["T1"] },
        { "a detail its source holds, in unrelated words", "At 09:40 the moon sang softly.", ["T2"] },
    };

    [Theory]
    [MemberData(nameof(UnsupportedSentences))]
    public async Task A_sentence_its_sources_do_not_support_is_refused(string attempt, string text, string[] refs)
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply(answer: [(text, refs)]));

        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync());

        Assert.True(failure.Failure == AssistantFailure.UnverifiedResponse, attempt);
    }

    /// True sentences in the forms a model writes them.
    public static TheoryData<string, string, string[]> SupportedSentences => new()
    {
        { "a date its record happened on", "Checkout errors after a promo deploy also happened on 2026-09-12.", ["R1"] },
        { "a date with non-breaking hyphens", "Checkout errors after a promo deploy also happened on 2026\u201109\u201112.", ["R1"] },
        { "a date written out", "Checkout errors after a promo deploy also happened on 12 September 2026.", ["R1"] },
        { "a time in ISO form", "The checkout errors after the promo deploy were resolved at 2026-09-12T11:30:00Z.", ["R1"] },
        { "how long a resolved incident lasted", "The promo deploy checkout errors lasted 90 minutes.", ["R1"] },
        { "the status, named as such", "The incident status is Investigating.", ["I"] },
        { "the person and time of the entry they wrote", "Avery Chen opened the incident at 08:05.", ["T1"] },
        { "an open incident, said not to be resolved", "The incident is not resolved.", ["I"] },
        { "a short sentence anchored by a detail its source holds", "Errors peaked at 09:40.", ["T2"] },
    };

    [Theory]
    [MemberData(nameof(SupportedSentences))]
    public async Task A_sentence_its_sources_support_is_shown(string form, string text, string[] refs)
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply(answer: [(text, refs)]));

        var answer = await harness.AskAsync();

        Assert.True(answer.Answered, form);
        Assert.Equal(text, Assert.Single(answer.Sentences).Text);
    }

    [Fact]
    public async Task The_data_says_how_long_a_resolved_incident_lasted_so_the_model_need_not_work_it_out()
    {
        var harness = new QuestionHarness();
        harness.Incident = harness.Incident! with
        {
            Status = IncidentStatus.Resolved,
            ResolvedAt = AssistantHarness.Opened.AddMinutes(125),
        };
        harness.Model.AnswerWith(QuestionHarness.Reply());

        await harness.AskAsync("How long did it last?");

        using var data = JsonDocument.Parse(Assert.Single(harness.Model.Requests).Data);
        Assert.Equal("2 hours 5 minutes", data.RootElement.GetProperty("incident").GetProperty("lasted").GetString());
        Assert.Equal("90 minutes", data.RootElement.GetProperty("relatedIncidents")[0].GetProperty("lasted").GetString());
    }

    [Fact]
    public async Task An_open_incident_has_no_duration_in_the_data()
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply());

        await harness.AskAsync("How long has it been going?");

        using var data = JsonDocument.Parse(Assert.Single(harness.Model.Requests).Data);
        Assert.Equal(JsonValueKind.Null, data.RootElement.GetProperty("incident").GetProperty("lasted").ValueKind);
    }

    [Fact]
    public async Task A_short_sentence_needs_only_its_one_meaningful_word_in_its_sources()
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply(answer: [("It is still under investigation.", ["I"])]));

        var answer = await harness.AskAsync("Is it resolved?");

        Assert.Equal("It is still under investigation.", Assert.Single(answer.Sentences).Text);
    }

    [Theory]
    [InlineData(false, true, AssistantFailure.Disabled)]
    [InlineData(true, false, AssistantFailure.QuestionsDisabled)]
    public async Task Nothing_is_read_or_asked_while_questions_are_off(
        bool enabled,
        bool questionsEnabled,
        AssistantFailure expected)
    {
        var harness = new QuestionHarness();
        harness.Settings = harness.Settings with { Enabled = enabled, QuestionsEnabled = questionsEnabled };

        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync());

        Assert.Equal(expected, failure.Failure);
        Assert.Empty(harness.Reads);
        Assert.Empty(harness.Model.Requests);
    }

    [Fact]
    public async Task An_incident_out_of_reach_is_unavailable_and_reaches_no_model()
    {
        var harness = new QuestionHarness { Incident = null };

        await Assert.ThrowsAsync<UnavailableException>(() => harness.AskAsync());

        Assert.Empty(harness.Model.Requests);
    }

    public static TheoryData<string> QuestionsRefusedUpFront => new() { "", "   ", new string('?', 301) };

    [Theory]
    [MemberData(nameof(QuestionsRefusedUpFront))]
    public async Task A_blank_or_overlong_question_is_refused_before_anything_is_read(string question)
    {
        var harness = new QuestionHarness();

        await Assert.ThrowsAsync<FluentValidation.ValidationException>(() => harness.AskAsync(question));

        Assert.Empty(harness.Reads);
        Assert.Empty(harness.Model.Requests);
    }

    [Fact]
    public async Task One_visitor_is_held_to_the_question_limit_while_others_can_still_ask()
    {
        var harness = new QuestionHarness();
        harness.Settings = harness.Settings with { QuestionVisitorLimit = 1 };
        harness.Model.AnswerWith(QuestionHarness.Reply());

        await harness.AskAsync(visitor: "visitor-a");
        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync(visitor: "visitor-a"));
        await harness.AskAsync(visitor: "visitor-b");

        Assert.Equal(AssistantFailure.QuestionLimitReached, failure.Failure);
        Assert.Equal(TimeSpan.FromMinutes(10), failure.RetryAfter);
        Assert.Equal(2, harness.Model.Requests.Count);
    }

    [Fact]
    public async Task The_daily_question_limit_stops_questions_until_midnight_utc()
    {
        var harness = new QuestionHarness();
        harness.Settings = harness.Settings with { QuestionDailyLimit = 1 };
        harness.Model.AnswerWith(QuestionHarness.Reply());

        await harness.AskAsync(visitor: "visitor-a");
        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync(visitor: "visitor-b"));

        Assert.Equal(AssistantFailure.DailyLimitReached, failure.Failure);
        Assert.Equal(TimeSpan.FromHours(12), failure.RetryAfter);
    }

    [Theory]
    [InlineData(InferenceFailure.RateLimited, AssistantFailure.Busy)]
    [InlineData(InferenceFailure.Unavailable, AssistantFailure.ProviderUnavailable)]
    [InlineData(InferenceFailure.TimedOut, AssistantFailure.ProviderUnavailable)]
    [InlineData(InferenceFailure.InvalidResponse, AssistantFailure.UnverifiedResponse)]
    public async Task Provider_failures_become_failures_a_person_can_act_on(InferenceFailure failure, AssistantFailure expected)
    {
        var harness = new QuestionHarness();
        harness.Model.FailWith(new InferenceFailedException(failure, "provider said no"));

        var error = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync());

        Assert.Equal(expected, error.Failure);
    }

    [Fact]
    public async Task The_request_timeout_covers_the_whole_question_not_each_call()
    {
        var harness = new QuestionHarness();
        harness.Settings = harness.Settings with { RequestTimeout = TimeSpan.FromMilliseconds(400) };
        var round = 0;
        harness.Model.Answer = async (_, token) =>
        {
            await Task.Delay(TimeSpan.FromMilliseconds(250), token);
            return round++ == 0
                ? QuestionHarness.Reply(lookups: [(IncidentQuestionPrompt.ReadRelatedIncident, "R1")])
                : QuestionHarness.Reply();
        };

        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync());

        Assert.Equal(AssistantFailure.ProviderUnavailable, failure.Failure);
    }

    [Fact]
    public async Task Asking_for_more_lookups_after_the_one_round_is_refused()
    {
        var harness = new QuestionHarness();
        harness.Model.AnswerWith(QuestionHarness.Reply(lookups: [(IncidentQuestionPrompt.ReadRelatedIncident, "R1")]));

        var failure = await Assert.ThrowsAsync<AssistantUnavailableException>(() => harness.AskAsync());

        Assert.Equal(AssistantFailure.UnverifiedResponse, failure.Failure);
        Assert.Equal(2, harness.Model.Requests.Count);
        using var schema = JsonDocument.Parse(harness.Model.Requests[1].JsonSchema);
        Assert.Equal(0, schema.RootElement.GetProperty("properties").GetProperty("lookups").GetProperty("maxItems").GetInt32());
    }
}
