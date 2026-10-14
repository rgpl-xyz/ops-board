using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using OpsBoard.Application.Assistant;
using OpsBoard.Infrastructure.Assistant;
using Xunit;

namespace OpsBoard.IntegrationTests.Assistant;

/// The provider adapter against a stubbed HTTP boundary: no network, no key.
[Trait("Category", "Assistant")]
public sealed class OpenAiCompatibleInferenceClientTests
{
    private const string ApiKey = "test-key-not-real-0123456789";

    private static readonly InferenceRequest Request = new(
        "fixed instructions",
        """{"incident":{"ref":"I"}}""",
        "incident_brief",
        """{"type":"object","additionalProperties":false,"required":[],"properties":{}}""",
        1200);

    [Fact]
    public async Task Sends_one_chat_completion_with_the_instructions_data_and_strict_schema()
    {
        var provider = new StubProvider(_ => Completion("""{"ok":true}""", "openai/gpt-oss-120b"));
        var client = CreateClient(provider);

        var result = await client.CompleteAsync(Request, CancellationToken.None);

        Assert.Equal("""{"ok":true}""", result.Content);
        Assert.Equal("openai/gpt-oss-120b", result.Model);
        Assert.Equal(812, result.InputTokens);
        Assert.Equal(143, result.OutputTokens);

        var call = Assert.Single(provider.Calls);
        Assert.Equal(HttpMethod.Post, call.Method);
        Assert.Equal("https://provider.test/openai/v1/chat/completions", call.Uri);
        Assert.Equal($"Bearer {ApiKey}", call.Authorization);
        using var body = JsonDocument.Parse(call.Body);
        var root = body.RootElement;
        Assert.Equal("configured-model", root.GetProperty("model").GetString());
        var messages = root.GetProperty("messages").EnumerateArray().ToList();
        Assert.Equal(2, messages.Count);
        Assert.Equal("system", messages[0].GetProperty("role").GetString());
        Assert.Equal("fixed instructions", messages[0].GetProperty("content").GetString());
        Assert.Equal("user", messages[1].GetProperty("role").GetString());
        Assert.Equal(Request.Data, messages[1].GetProperty("content").GetString());
        var format = root.GetProperty("response_format");
        Assert.Equal("json_schema", format.GetProperty("type").GetString());
        Assert.Equal("incident_brief", format.GetProperty("json_schema").GetProperty("name").GetString());
        Assert.True(format.GetProperty("json_schema").GetProperty("strict").GetBoolean());
        Assert.Equal(JsonValueKind.Object, format.GetProperty("json_schema").GetProperty("schema").ValueKind);
        Assert.Equal(1200, root.GetProperty("max_tokens").GetInt32());
        Assert.False(root.TryGetProperty("tools", out _));
        Assert.False(root.TryGetProperty("reasoning_effort", out _));
    }

    [Fact]
    public async Task Asks_for_a_plain_JSON_object_where_the_provider_cannot_enforce_a_schema()
    {
        var provider = new StubProvider(_ => Completion("{}"));
        var client = CreateClient(provider, Options() with { SupportsStrictSchema = false, ReasoningEffort = "low" });

        await client.CompleteAsync(Request, CancellationToken.None);

        using var body = JsonDocument.Parse(Assert.Single(provider.Calls).Body);
        Assert.Equal("json_object", body.RootElement.GetProperty("response_format").GetProperty("type").GetString());
        Assert.Equal("low", body.RootElement.GetProperty("reasoning_effort").GetString());
    }

    [Fact]
    public async Task A_rate_limit_is_reported_with_its_retry_time_and_never_retried()
    {
        var provider = new StubProvider(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
            response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(17));
            return response;
        });

        var error = await Assert.ThrowsAsync<InferenceFailedException>(
            () => CreateClient(provider).CompleteAsync(Request, CancellationToken.None));

        Assert.Equal(InferenceFailure.RateLimited, error.Failure);
        Assert.Equal(TimeSpan.FromSeconds(17), error.RetryAfter);
        Assert.Single(provider.Calls);
    }

    [Fact]
    public async Task A_server_error_is_retried_once()
    {
        var provider = new StubProvider(n => n == 1
            ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
            : Completion("{}"));

        var result = await CreateClient(provider).CompleteAsync(Request, CancellationToken.None);

        Assert.Equal("{}", result.Content);
        Assert.Equal(2, provider.Calls.Count);
    }

    [Fact]
    public async Task Repeated_server_errors_make_the_provider_unavailable_after_one_retry()
    {
        var provider = new StubProvider(_ => new HttpResponseMessage(HttpStatusCode.BadGateway));

        var error = await Assert.ThrowsAsync<InferenceFailedException>(
            () => CreateClient(provider).CompleteAsync(Request, CancellationToken.None));

        Assert.Equal(InferenceFailure.Unavailable, error.Failure);
        Assert.Equal(2, provider.Calls.Count);
    }

    [Fact]
    public async Task A_rejected_key_is_not_retried_and_the_key_never_appears_in_the_error()
    {
        var provider = new StubProvider(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized)
        {
            Content = new StringContent($"{{\"error\":{{\"message\":\"Invalid API Key {ApiKey}\"}}}}"),
        });

        var error = await Assert.ThrowsAsync<InferenceFailedException>(
            () => CreateClient(provider).CompleteAsync(Request, CancellationToken.None));

        Assert.Equal(InferenceFailure.Unavailable, error.Failure);
        Assert.Single(provider.Calls);
        Assert.DoesNotContain(ApiKey, error.ToString());
    }

    [Fact]
    public async Task A_provider_that_does_not_answer_in_time_times_out()
    {
        var provider = new StubProvider(_ => Completion("{}"), delay: TimeSpan.FromSeconds(30));
        var client = CreateClient(provider, Options() with { Timeout = TimeSpan.FromMilliseconds(100) });

        var error = await Assert.ThrowsAsync<InferenceFailedException>(
            () => client.CompleteAsync(Request, CancellationToken.None));

        Assert.Equal(InferenceFailure.TimedOut, error.Failure);
    }

    [Fact]
    public async Task A_caller_that_cancels_is_not_reported_as_a_timeout()
    {
        var provider = new StubProvider(_ => Completion("{}"), delay: TimeSpan.FromSeconds(30));
        using var caller = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => CreateClient(provider).CompleteAsync(Request, caller.Token));
    }

    public static TheoryData<string, string> UnusableCompletions => new()
    {
        { "cut off at the token limit", CompletionJson("""{"whatHappened":[""", finishReason: "length") },
        { "no content", """{"model":"m","choices":[{"message":{"role":"assistant"},"finish_reason":"stop"}]}""" },
        { "no choices", """{"model":"m","choices":[]}""" },
        { "not JSON", "<html>gateway error</html>" },
    };

    [Theory]
    [MemberData(nameof(UnusableCompletions))]
    public async Task An_unusable_completion_is_an_invalid_response(string reason, string body)
    {
        _ = reason;
        var provider = new StubProvider(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        });

        var error = await Assert.ThrowsAsync<InferenceFailedException>(
            () => CreateClient(provider).CompleteAsync(Request, CancellationToken.None));

        Assert.Equal(InferenceFailure.InvalidResponse, error.Failure);
    }

    private static OpenAiCompatibleOptions Options() => new(
        "Test provider",
        new Uri("https://provider.test/openai/v1/"),
        "configured-model",
        ApiKey,
        SupportsStrictSchema: true,
        ReasoningEffort: null,
        Timeout: TimeSpan.FromSeconds(20));

    private static OpenAiCompatibleInferenceClient CreateClient(StubProvider provider, OpenAiCompatibleOptions? options = null) =>
        new(new HttpClient(provider), options ?? Options(), NullLogger<OpenAiCompatibleInferenceClient>.Instance);

    private static HttpResponseMessage Completion(string content, string model = "m") =>
        new(HttpStatusCode.OK)
        {
            Content = new StringContent(CompletionJson(content, model), Encoding.UTF8, "application/json"),
        };

    private static string CompletionJson(string content, string model = "m", string finishReason = "stop") =>
        JsonSerializer.Serialize(new
        {
            model,
            choices = new[] { new { index = 0, message = new { role = "assistant", content }, finish_reason = finishReason } },
            usage = new { prompt_tokens = 812, completion_tokens = 143, total_tokens = 955 },
        });

    private sealed class StubProvider(Func<int, HttpResponseMessage> respond, TimeSpan? delay = null) : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Uri, string? Authorization, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add((request.Method, request.RequestUri!.ToString(), request.Headers.Authorization?.ToString(), body));
            if (delay is { } wait)
            {
                await Task.Delay(wait, cancellationToken);
            }

            return respond(Calls.Count);
        }
    }
}
