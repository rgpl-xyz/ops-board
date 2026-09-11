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
