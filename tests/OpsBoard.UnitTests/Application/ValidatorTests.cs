using FluentValidation.TestHelper;
using OpsBoard.Application.Incidents;
using OpsBoard.Application.Services;
using OpsBoard.Application.Validation;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Application;

public class ValidatorTests
{
    [Fact]
    public void CreateServiceRequest_rejects_blank_name()
    {
        var validator = new CreateServiceRequestValidator();
        var result = validator.TestValidate(new CreateServiceRequest("  ", "desc", Guid.NewGuid()));
        result.ShouldHaveValidationErrorFor(x => x.Name);
    }

    [Fact]
    public void VersionRequest_rejects_zero()
    {
        var validator = new VersionRequestValidator();
        var result = validator.TestValidate(new VersionRequest("0"));
        result.ShouldHaveValidationErrorFor(x => x.ExpectedVersion);
    }

    [Fact]
    public void StatusRequest_rejects_resolved_target()
    {
        var validator = new StatusRequestValidator();
        var result = validator.TestValidate(new StatusRequest(IncidentStatus.Resolved, "1"));
        result.ShouldHaveValidationErrorFor(x => x.Status);
    }

    [Theory]
    [InlineData("name")]
    [InlineData("health")]
    [InlineData("updatedAt")]
    public void ServiceQuery_accepts_each_supported_sort(string sort)
    {
        var validator = new ServiceQueryValidator();
        var result = validator.TestValidate(new ServiceQuery(Sort: sort));
        result.ShouldNotHaveValidationErrorFor(x => x.Sort);
    }

    [Fact]
    public void ServiceQuery_rejects_unknown_sort()
    {
        var validator = new ServiceQueryValidator();
        var result = validator.TestValidate(new ServiceQuery(Sort: "createdAt"));
        result.ShouldHaveValidationErrorFor(x => x.Sort);
    }

    [Fact]
    public void UpdateServiceRequest_accepts_valid_version()
    {
        var validator = new UpdateServiceRequestValidator();
        var result = validator.TestValidate(
            new UpdateServiceRequest("n", "d", Guid.NewGuid(), ServiceHealth.Operational, "1"));
        result.ShouldNotHaveAnyValidationErrors();
    }
}
