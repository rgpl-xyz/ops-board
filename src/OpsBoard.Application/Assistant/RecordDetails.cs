using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace OpsBoard.Application.Assistant;

/// Numbers, clock times and people's names, as comparable keys: the details
/// a statement cannot get wrong without saying something its records do not.
internal static partial class RecordDetails
{
    /// Every detail a record holds: those in its text, the clock times it
    /// happened at, and the people who wrote it.
    public static HashSet<string> Held(
        IEnumerable<string?> texts,
        IEnumerable<DateTimeOffset> times,
        IEnumerable<string> actors,
        IReadOnlyList<string> people)
    {
        var held = texts.OfType<string>()
            .SelectMany(text => Details(text, people, distinctiveNumbersOnly: false))
            .ToHashSet(StringComparer.Ordinal);
        foreach (var at in times)
        {
            held.Add("time:" + at.ToString("HH:mm", CultureInfo.InvariantCulture));
        }

        foreach (var actor in actors)
        {
            held.Add("person:" + actor);
        }

        return held;
    }

    /// Clock times, numbers and people's names in a text, as comparable keys.
    /// A statement's small whole numbers are too common to point at one record.
    public static IEnumerable<string> Details(string text, IReadOnlyList<string> people, bool distinctiveNumbersOnly)
    {
        text = text.Normalize(NormalizationForm.FormKC);
        foreach (Match time in ClockTime().Matches(text))
        {
            yield return $"time:{int.Parse(time.Groups[1].Value, CultureInfo.InvariantCulture):00}:{time.Groups[2].Value}";
        }

        foreach (Match number in Number().Matches(ClockTime().Replace(text, " ")))
        {
            var digits = number.Groups[1].Value;
            var suffix = number.Groups[2].Value;
            var value = double.Parse(digits.Replace(",", "", StringComparison.Ordinal), CultureInfo.InvariantCulture);
            if (suffix.Equals("k", StringComparison.OrdinalIgnoreCase))
            {
                value *= 1000;
            }

            if (!distinctiveNumbersOnly || value > 9 || digits.Contains('.', StringComparison.Ordinal) || suffix.Length > 0)
            {
                yield return "number:" + value.ToString("R", CultureInfo.InvariantCulture);
            }
        }

        foreach (var person in Mentioned(text, people))
        {
            yield return "person:" + person;
        }
    }

    /// People named in full, or by a first name no one else in the records shares.
    private static IEnumerable<string> Mentioned(string text, IReadOnlyList<string> people)
    {
        foreach (var person in people)
        {
            var first = person.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0];
            var unique = people.Count(p => p.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0] == first) == 1;
            if (Contains(text, person) || (unique && Contains(text, first)))
            {
                yield return person;
            }
        }
    }

    private static bool Contains(string text, string word) =>
        Regex.IsMatch(text, $@"(?<!\w){Regex.Escape(word)}(?!\w)", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

    [GeneratedRegex(@"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)", RegexOptions.CultureInvariant)]
    private static partial Regex ClockTime();

    [GeneratedRegex(@"(?<![\w.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k\b|%)?", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex Number();
}
