namespace OpsBoard.Application.Assistant;

/// The one seam to a language model provider. It takes fixed instructions and
/// data and returns text; it has no tools and no access to anything else.
public interface IInferenceClient
{
    /// Shown to people beside generated text, e.g. "Groq".
    string ProviderName { get; }

    /// The configured model, e.g. "openai/gpt-oss-120b".
    string Model { get; }

    /// True when no model is involved, so the UI does not call the text AI-generated.
    bool IsSimulated { get; }

    Task<InferenceResult> CompleteAsync(InferenceRequest request, CancellationToken cancellationToken);
}

/// <param name="SystemPrompt">Fixed server instructions; never built from stored or request data.</param>
/// <param name="Data">Incident data as JSON, sent in its own message and treated as untrusted.</param>
/// <param name="JsonSchema">The response contract the provider should enforce where it can.</param>
public sealed record InferenceRequest(
    string SystemPrompt,
    string Data,
    string SchemaName,
    string JsonSchema,
    int MaxOutputTokens);

public sealed record InferenceResult(string Content, string Model, int InputTokens, int OutputTokens);

public enum InferenceFailure
{
    RateLimited,
    Unavailable,
    TimedOut,
    InvalidResponse,
}

public sealed class InferenceFailedException(InferenceFailure failure, string message, TimeSpan? retryAfter = null)
    : Exception(message)
{
    public InferenceFailure Failure { get; } = failure;

    public TimeSpan? RetryAfter { get; } = retryAfter;
}
