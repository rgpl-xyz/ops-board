namespace OpsBoard.Application.Errors;

public abstract class ApplicationException : Exception
{
    protected ApplicationException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

public sealed class ValidationFailedException : ApplicationException
{
    public ValidationFailedException(IReadOnlyDictionary<string, string[]> errors, string? detail = null)
        : base("validation_failed", detail ?? "One or more validation errors occurred.")
    {
        Errors = errors;
    }

    public ValidationFailedException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = [message] })
    {
    }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

public sealed class IdentityUnavailableException : ApplicationException
{
    public IdentityUnavailableException()
        : base("identity_unavailable", "Current user context is unavailable.")
    {
    }
}

public sealed class ForbiddenException : ApplicationException
{
    public ForbiddenException()
        : base("forbidden", "You are not allowed to perform this action.")
    {
    }
}

public sealed class UnavailableException : ApplicationException
{
    public UnavailableException()
        : base("unavailable", "The requested resource is unavailable.")
    {
    }
}

public sealed class LifecycleConflictException : ApplicationException
{
    public LifecycleConflictException(string message = "The requested lifecycle action is not allowed.")
        : base("lifecycle_conflict", message)
    {
    }
}

public sealed class ResponderConflictException : ApplicationException
{
    public ResponderConflictException(string message = "Responder membership conflict.")
        : base("responder_conflict", message)
    {
    }
}

public sealed class ConcurrencyConflictException : ApplicationException
{
    public ConcurrencyConflictException()
        : base(
            "concurrency_conflict",
            "The incident changed. Reload it and reconsider this action.")
    {
    }
}

public sealed class PersistenceFailureException : ApplicationException
{
    public PersistenceFailureException()
        : base("persistence_failure", "The operation could not be completed.")
    {
    }
}

public sealed class PersistenceUnavailableException : ApplicationException
{
    public PersistenceUnavailableException()
        : base("persistence_unavailable", "The data store is temporarily unavailable.")
    {
    }
}

public enum AssistantFailure
{
    Disabled,
    DailyLimitReached,
    VisitorLimitReached,
    Busy,
    ProviderUnavailable,
    UnverifiedResponse,
    QuestionsDisabled,
    QuestionLimitReached,
}

/// AI assistance could not answer. Each failure tells the caller what to do next.
public sealed class AssistantUnavailableException : ApplicationException
{
    public AssistantUnavailableException(AssistantFailure failure, TimeSpan? retryAfter = null)
        : base(CodeFor(failure), MessageFor(failure))
    {
        Failure = failure;
        RetryAfter = retryAfter;
    }

    public AssistantFailure Failure { get; }

    /// When trying again could succeed, if that is known.
    public TimeSpan? RetryAfter { get; }

    private static string CodeFor(AssistantFailure failure) => failure switch
    {
        AssistantFailure.Disabled => "assistant_disabled",
        AssistantFailure.DailyLimitReached => "assistant_daily_limit",
        AssistantFailure.VisitorLimitReached => "assistant_visitor_limit",
        AssistantFailure.Busy => "assistant_busy",
        AssistantFailure.ProviderUnavailable => "assistant_provider_unavailable",
        AssistantFailure.QuestionsDisabled => "assistant_questions_disabled",
        AssistantFailure.QuestionLimitReached => "assistant_question_limit",
        _ => "assistant_unverified_response",
    };

    private static string MessageFor(AssistantFailure failure) => failure switch
    {
        AssistantFailure.Disabled => "AI assistance is turned off for this environment.",
        AssistantFailure.DailyLimitReached => "The daily limit for AI assistance has been reached. It resets at 00:00 UTC.",
        AssistantFailure.VisitorLimitReached => "You have started several new briefs in a short time. Try again in a few minutes.",
        AssistantFailure.Busy => "AI assistance is busy. Try again in a few seconds.",
        AssistantFailure.ProviderUnavailable => "The AI provider is unavailable. Try again later.",
        AssistantFailure.QuestionsDisabled => "Questions to AI assistance are turned off for this environment.",
        AssistantFailure.QuestionLimitReached => "You have asked several questions in a short time. Try again in a few minutes.",
        _ => "The AI response could not be checked against the incident's records, so it was not shown. Try again.",
    };
}
