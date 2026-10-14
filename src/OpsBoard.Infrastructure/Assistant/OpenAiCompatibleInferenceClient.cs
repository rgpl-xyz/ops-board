using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;
using OpsBoard.Application.Assistant;

namespace OpsBoard.Infrastructure.Assistant;

/// <param name="BaseUrl">The provider's OpenAI-compatible root, ending in a slash,
/// e.g. https://api.groq.com/openai/v1/.</param>
/// <param name="SupportsStrictSchema">The provider enforces a JSON schema on the
/// reply. Otherwise only a JSON object is requested and the server's own check
/// is the only enforcement.</param>
/// <param name="ReasoningEffort">Sent only when set, for reasoning models that accept it.</param>
public sealed record OpenAiCompatibleOptions(
    string ProviderName,
    Uri BaseUrl,
    string Model,
    string ApiKey,
    bool SupportsStrictSchema,
    string? ReasoningEffort,
    TimeSpan Timeout);

/// Calls one chat completion on any OpenAI-compatible endpoint (Groq,
/// Cloudflare Workers AI, OpenRouter). It never sends tools, so the model can
/// only return text.
public sealed class OpenAiCompatibleInferenceClient(
    HttpClient http,
    OpenAiCompatibleOptions options,
    ILogger<OpenAiCompatibleInferenceClient> logger) : IInferenceClient
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(250);

    public string ProviderName => options.ProviderName;

    public string Model => options.Model;

    public bool IsSimulated => false;

    public async Task<InferenceResult> CompleteAsync(InferenceRequest request, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(options.Timeout);
        var body = Body(request);
        try
        {
            using var first = await SendAsync(body, deadline.Token);
            if (!IsTransient(first.StatusCode))
            {
                return await ReadAsync(first, deadline.Token);
            }

            logger.LogWarning("{Provider} answered {Status}; retrying once", options.ProviderName, (int)first.StatusCode);
            await Task.Delay(RetryDelay, deadline.Token);
            using var second = await SendAsync(body, deadline.Token);
            return await ReadAsync(second, deadline.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InferenceFailedException(InferenceFailure.TimedOut, $"{options.ProviderName} did not answer in time.");
        }
        catch (HttpRequestException error)
        {
            // The message names the host at most; the request carries the key only in a header.
            throw new InferenceFailedException(
                InferenceFailure.Unavailable,
                $"{options.ProviderName} could not be reached ({error.HttpRequestError}).");
        }
    }

    private async Task<HttpResponseMessage> SendAsync(string body, CancellationToken cancellationToken)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, new Uri(options.BaseUrl, "chat/completions"))
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
        return await http.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
    }

    private async Task<InferenceResult> ReadAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            var retryAfter = response.Headers.RetryAfter?.Delta
                ?? (response.Headers.RetryAfter?.Date - DateTimeOffset.UtcNow);
            throw new InferenceFailedException(
                InferenceFailure.RateLimited,
                $"{options.ProviderName} rate limit reached.",
                retryAfter is { } wait && wait > TimeSpan.Zero ? wait : null);
        }

        if (!response.IsSuccessStatusCode)
        {
            // The body is not logged: a provider may echo generated text back.
            throw new InferenceFailedException(
                InferenceFailure.Unavailable,
                $"{options.ProviderName} answered {(int)response.StatusCode}.");
        }

        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        return Parse(text);
    }

    private InferenceResult Parse(string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            var root = document.RootElement;
            var choice = root.GetProperty("choices").EnumerateArray().FirstOrDefault();
            if (choice.ValueKind != JsonValueKind.Object
                || !choice.TryGetProperty("message", out var message)
                || !message.TryGetProperty("content", out var content)
                || content.ValueKind != JsonValueKind.String)
            {
                throw Invalid("The completion has no content.");
            }

            if (choice.TryGetProperty("finish_reason", out var finish) && finish.ValueKind == JsonValueKind.String
                && finish.GetString() == "length")
            {
                throw Invalid("The completion was cut off at the token limit.");
            }

            var usage = root.TryGetProperty("usage", out var u) ? u : default;
            return new InferenceResult(
                content.GetString()!,
                root.TryGetProperty("model", out var model) && model.ValueKind == JsonValueKind.String
                    ? model.GetString()!
                    : options.Model,
                Tokens(usage, "prompt_tokens"),
                Tokens(usage, "completion_tokens"));
        }
        catch (Exception error) when (error is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            throw Invalid("The completion is not the expected JSON.");
        }
    }

    private string Body(InferenceRequest request)
    {
        var body = new JsonObject
        {
            ["model"] = options.Model,
            ["messages"] = new JsonArray(
                new JsonObject { ["role"] = "system", ["content"] = request.SystemPrompt },
                new JsonObject { ["role"] = "user", ["content"] = request.Data }),
            ["temperature"] = 0.2,
            ["max_tokens"] = request.MaxOutputTokens,
            ["response_format"] = options.SupportsStrictSchema
                ? new JsonObject
                {
                    ["type"] = "json_schema",
                    ["json_schema"] = new JsonObject
                    {
                        ["name"] = request.SchemaName,
                        ["strict"] = true,
                        ["schema"] = JsonNode.Parse(request.JsonSchema),
                    },
                }
                : new JsonObject { ["type"] = "json_object" },
        };
        if (!string.IsNullOrWhiteSpace(options.ReasoningEffort))
        {
            body["reasoning_effort"] = options.ReasoningEffort;
        }

        return body.ToJsonString();
    }

    private InferenceFailedException Invalid(string reason) =>
        new(InferenceFailure.InvalidResponse, $"{options.ProviderName}: {reason}");

    private static bool IsTransient(HttpStatusCode status) =>
        status is HttpStatusCode.RequestTimeout || (int)status >= 500;

    private static int Tokens(JsonElement usage, string name) =>
        usage.ValueKind == JsonValueKind.Object && usage.TryGetProperty(name, out var value)
            && value.TryGetInt32(out var count)
            ? count
            : 0;
}
