using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

internal static class MappingStyles
{
    public static ValueConverter<TEnum, string> EnumToString<TEnum>()
        where TEnum : struct, Enum =>
        new(v => v.ToString(), v => Enum.Parse<TEnum>(v));

    public static void ConfigureTenantAlternateKey<T>(EntityTypeBuilder<T> builder)
        where T : class
    {
        builder.HasAlternateKey("OrganizationId", "Id");
    }
}
