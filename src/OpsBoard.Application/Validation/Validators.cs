using FluentValidation;
using OpsBoard.Application.Incidents;
using OpsBoard.Application.Services;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Validation;

public sealed class CreateServiceRequestValidator : AbstractValidator<CreateServiceRequest>
{
    public CreateServiceRequestValidator()
    {
        RuleFor(x => x.Name).Must(BeNonBlank).WithMessage("Name is required.").Must(n => ScalarLength(n) <= 120)
            .WithMessage("Name must be at most 120 characters.");
        RuleFor(x => x.Description).Must(BeNonBlank).WithMessage("Description is required.")
            .Must(n => ScalarLength(n) <= 2000).WithMessage("Description must be at most 2000 characters.");
        RuleFor(x => x.TeamId).NotEmpty();
    }

    private static bool BeNonBlank(string? value) => !string.IsNullOrWhiteSpace(value);

    private static int ScalarLength(string? value) => TextLimits.ScalarLength(value);
}

public sealed class UpdateServiceRequestValidator : AbstractValidator<UpdateServiceRequest>
{
    public UpdateServiceRequestValidator()
    {
        RuleFor(x => x.Name).Must(BeNonBlank).WithMessage("Name is required.").Must(n => ScalarLength(n) <= 120)
            .WithMessage("Name must be at most 120 characters.");
        RuleFor(x => x.Description).Must(BeNonBlank).WithMessage("Description is required.")
            .Must(n => ScalarLength(n) <= 2000).WithMessage("Description must be at most 2000 characters.");
        RuleFor(x => x.TeamId).NotEmpty();
        RuleFor(x => x.Health).IsInEnum();
        RuleFor(x => x.ExpectedVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }

    private static bool BeNonBlank(string? value) => !string.IsNullOrWhiteSpace(value);

    private static int ScalarLength(string? value) => TextLimits.ScalarLength(value);
}

public sealed class CreateIncidentRequestValidator : AbstractValidator<CreateIncidentRequest>
{
    public CreateIncidentRequestValidator()
    {
        RuleFor(x => x.Title).Must(BeNonBlank).WithMessage("Title is required.").Must(n => ScalarLength(n) <= 200)
            .WithMessage("Title must be at most 200 characters.");
        RuleFor(x => x.Description).Must(BeNonBlank).WithMessage("Description is required.")
            .Must(n => ScalarLength(n) <= 10000).WithMessage("Description must be at most 10000 characters.");
        RuleFor(x => x.ServiceId).NotEmpty();
        RuleFor(x => x.Severity).IsInEnum();
    }

    private static bool BeNonBlank(string? value) => !string.IsNullOrWhiteSpace(value);

    private static int ScalarLength(string? value) => TextLimits.ScalarLength(value);
}

public sealed class UpdateIncidentRequestValidator : AbstractValidator<UpdateIncidentRequest>
{
    public UpdateIncidentRequestValidator()
    {
        RuleFor(x => x.Title).Must(BeNonBlank).WithMessage("Title is required.").Must(n => ScalarLength(n) <= 200)
            .WithMessage("Title must be at most 200 characters.");
        RuleFor(x => x.Description).Must(BeNonBlank).WithMessage("Description is required.")
            .Must(n => ScalarLength(n) <= 10000).WithMessage("Description must be at most 10000 characters.");
        RuleFor(x => x.ServiceId).NotEmpty();
        RuleFor(x => x.ExpectedVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }

    private static bool BeNonBlank(string? value) => !string.IsNullOrWhiteSpace(value);

    private static int ScalarLength(string? value) => TextLimits.ScalarLength(value);
}

public sealed class SeverityRequestValidator : AbstractValidator<SeverityRequest>
{
    public SeverityRequestValidator()
    {
        RuleFor(x => x.Severity).IsInEnum();
        RuleFor(x => x.ExpectedVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }
}

public sealed class StatusRequestValidator : AbstractValidator<StatusRequest>
{
    public StatusRequestValidator()
    {
        RuleFor(x => x.Status).Must(s =>
                s is IncidentStatus.Investigating or IncidentStatus.Identified or IncidentStatus.Monitoring)
            .WithMessage("Status must be an active target.");
        RuleFor(x => x.ExpectedVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }
}

public sealed class VersionRequestValidator : AbstractValidator<VersionRequest>
{
    public VersionRequestValidator()
    {
        RuleFor(x => x.ExpectedVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }
}

public sealed class LifecycleVersionRequestValidator : AbstractValidator<LifecycleVersionRequest>
{
    public LifecycleVersionRequestValidator()
    {
        RuleFor(x => x.ExpectedLifecycleVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }
}

public sealed class WrittenUpdateRequestValidator : AbstractValidator<WrittenUpdateRequest>
{
    public WrittenUpdateRequestValidator()
    {
        RuleFor(x => x.Body).Must(BeNonBlank).WithMessage("Body is required.").Must(n => ScalarLength(n) <= 4000)
            .WithMessage("Body must be at most 4000 characters.");
        RuleFor(x => x.ExpectedLifecycleVersion).Must(TextLimits.IsPositiveInt64String)
            .WithMessage("Version must be a positive decimal string.");
    }

    private static bool BeNonBlank(string? value) => !string.IsNullOrWhiteSpace(value);

    private static int ScalarLength(string? value) => TextLimits.ScalarLength(value);
}

public sealed class ServiceQueryValidator : AbstractValidator<ServiceQuery>
{
    public ServiceQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Search).Must(s => s is null || TextLimits.ScalarLength(s.Trim()) <= 200)
            .WithMessage("Search must be at most 200 characters.");
        RuleFor(x => x.Sort).Must(s => s is "name" or "health" or "updatedAt");
        RuleFor(x => x.Direction).Must(d => d is "asc" or "desc");
        RuleFor(x => x.Health).Must(h => h is null || Enum.IsDefined(h.Value));
    }
}

public sealed class IncidentQueryValidator : AbstractValidator<IncidentQuery>
{
    public IncidentQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Search).Must(s => s is null || TextLimits.ScalarLength(s.Trim()) <= 200)
            .WithMessage("Search must be at most 200 characters.");
        RuleFor(x => x.Sort).Must(s => s is "createdAt" or "severity" or "status");
        RuleFor(x => x.Direction).Must(d => d is "asc" or "desc");
        RuleFor(x => x.Severity).Must(s => s is null || Enum.IsDefined(s.Value));
        RuleFor(x => x.Status).Must(s => s is null || Enum.IsDefined(s.Value));
    }
}

internal static class TextLimits
{
    public static int ScalarLength(string? value)
    {
        if (value is null)
        {
            return 0;
        }

        var enumerator = System.Globalization.StringInfo.GetTextElementEnumerator(value);
        var count = 0;
        while (enumerator.MoveNext())
        {
            count++;
        }

        return count;
    }

    public static bool IsPositiveInt64String(string? value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && long.TryParse(
                value,
                System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture,
                out var parsed)
            && parsed >= 1;
    }
}
