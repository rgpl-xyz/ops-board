using System.Globalization;

namespace OpsBoard.Domain;

internal static class Guards
{
    public static Guid RequireId(Guid id, string name)
    {
        if (id == Guid.Empty)
        {
            throw new DomainException($"{name} is required.");
        }

        return id;
    }

    public static string RequireText(string? value, string name, int maxLength)
    {
        if (value is null)
        {
            throw new DomainException($"{name} is required.");
        }

        var trimmed = value.Trim();
        if (trimmed.Length == 0)
        {
            throw new DomainException($"{name} is required.");
        }

        if (ScalarLength(trimmed) > maxLength)
        {
            throw new DomainException($"{name} must be at most {maxLength} characters.");
        }

        return trimmed;
    }

    public static DateTimeOffset RequireUtc(DateTimeOffset value, string name)
    {
        if (value.Offset != TimeSpan.Zero)
        {
            throw new DomainException($"{name} must be UTC.");
        }

        return value;
    }

    public static void RequireNotBefore(DateTimeOffset candidate, DateTimeOffset floor, string name)
    {
        if (candidate < floor)
        {
            throw new DomainException($"{name} cannot be earlier than the current record time.");
        }
    }

    public static TEnum RequireDefined<TEnum>(TEnum value, string name)
        where TEnum : struct, Enum
    {
        if (!Enum.IsDefined(value))
        {
            throw new DomainException($"{name} is invalid.");
        }

        return value;
    }

    public static IReadOnlyList<string> RequireActionItems(IEnumerable<string>? items)
    {
        if (items is null)
        {
            throw new DomainException("Action items are required.");
        }

        var list = items.Select(item => RequireText(item, "Action item", 1000)).ToList();
        if (list.Count is < 1 or > 20)
        {
            throw new DomainException("Action items must contain between 1 and 20 entries.");
        }

        return list;
    }

    private static int ScalarLength(string value)
    {
        var enumerator = StringInfo.GetTextElementEnumerator(value);
        var count = 0;
        while (enumerator.MoveNext())
        {
            count++;
        }

        return count;
    }
}
