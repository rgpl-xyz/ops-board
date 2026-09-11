using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using OpsBoard.Application.Validation;

namespace OpsBoard.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<CreateServiceRequestValidator>();
        return services;
    }
}
