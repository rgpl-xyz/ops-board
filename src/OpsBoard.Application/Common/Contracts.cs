using OpsBoard.Domain.Enums;

namespace OpsBoard.Application.Common;

public sealed record PageResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public sealed record Bounded<T>(IReadOnlyList<T> Items, Guid? NextAfter);

public sealed record ContinuationQuery(int Limit = 100, Guid? After = null);

public sealed record PageQuery(int Page = 1, int PageSize = 25);

public static class PageMath
{
    public static int TotalPages(int totalCount, int pageSize)
    {
        if (totalCount <= 0)
        {
            return 0;
        }

        return (int)Math.Ceiling(totalCount / (double)pageSize);
    }

    public static int CheckedOffset(int page, int pageSize)
    {
        try
        {
            return checked((page - 1) * pageSize);
        }
        catch (OverflowException)
        {
            throw new Errors.ValidationFailedException("page", "Page offset exceeds supported range.");
        }
    }
}

public static class RevisionFormatting
{
    public static string ToWire(long value) => value.ToString(System.Globalization.CultureInfo.InvariantCulture);

    public static long ParseRequired(string? value, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new Errors.ValidationFailedException(fieldName, "Version is required.");
        }

        if (!long.TryParse(
                value,
                System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture,
                out var parsed)
            || parsed < 1)
        {
            throw new Errors.ValidationFailedException(fieldName, "Version must be a positive decimal string.");
        }

        return parsed;
    }
}
