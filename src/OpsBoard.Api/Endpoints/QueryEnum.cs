using OpsBoard.Application.Errors;

namespace OpsBoard.Api.Endpoints;

/// Reads an enum query value by its exact name. The framework's own binding also
/// accepts numbers, such as severity=1, which are not part of the contract.
internal static class QueryEnum
{
    public static TEnum? Parse<TEnum>(string? value, string field)
        where TEnum : struct, Enum
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        var names = Enum.GetNames<TEnum>();
        if (names.Contains(value, StringComparer.Ordinal))
        {
            return Enum.Parse<TEnum>(value);
        }

        throw new ValidationFailedException(
            field,
            $"{char.ToUpperInvariant(field[0])}{field[1..]} must be one of: {string.Join(", ", names)}.");
    }
}
