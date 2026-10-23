using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace OpsBoard.Application.Assistant;

/// Dates, numbers, clock times and people's names, as comparable keys: the
/// details a statement cannot get wrong without saying something its records
/// do not.
internal static partial class RecordDetails
{
    /// Every detail a record holds: those in its text, the dates and clock
    /// times it happened at, and the people who wrote it.
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
            held.Add("date:" + at.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        }

        foreach (var actor in actors)
        {
            held.Add("person:" + actor);
        }

        // A date the record holds also holds its day of the year, for a statement that leaves the year out.
        foreach (var date in held.Where(d => d.StartsWith("date:", StringComparison.Ordinal)).ToList())
        {
            held.Add("day:" + date[^5..]);
        }

        return held;
    }

    /// Dates, clock times, numbers and people's names in a text, as comparable
    /// keys. A statement's small whole numbers are too common to point at one
    /// record. A date's parts are not numbers of their own, so "2026-09-12" is
    /// one date and not the number 2026.
    public static IEnumerable<string> Details(string text, IReadOnlyList<string> people, bool distinctiveNumbersOnly)
    {
        // Models write dates with any of the dash characters, such as the non-breaking hyphen.
        text = Dashes().Replace(text.Normalize(NormalizationForm.FormKC), "-");
        foreach (var date in Dates(text))
        {
            yield return date;
        }

        text = WrittenDate().Replace(IsoDate().Replace(text, " "), " ");
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

    /// Dates written as 2026-09-12, 12 September 2026 or September 12, 2026, and
    /// without a year as a day of the year. Text that only looks like a date,
    /// such as 2026-13-40, stays numbers.
    private static IEnumerable<string> Dates(string text)
    {
        foreach (Match iso in IsoDate().Matches(text))
        {
            if (DateOnly.TryParseExact(iso.Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                yield return "date:" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }
        }

        foreach (Match written in WrittenDate().Matches(text))
        {
            var day = written.Groups["day1"].Success ? written.Groups["day1"].Value : written.Groups["day2"].Value;
            var month = Array.FindIndex(Months, m => written.Groups["month"].Value.StartsWith(m, StringComparison.OrdinalIgnoreCase)) + 1;
            var year = written.Groups["year"];
            var dayOfMonth = int.Parse(day, CultureInfo.InvariantCulture);

            // Without a year, any day a leap year has.
            var inYear = year.Success ? int.Parse(year.Value, CultureInfo.InvariantCulture) : 2024;
            if (inYear < 1 || dayOfMonth < 1 || dayOfMonth > DateTime.DaysInMonth(inYear, month))
            {
                continue;
            }

            yield return year.Success
                ? $"date:{year.Value}-{month:00}-{dayOfMonth:00}"
                : $"day:{month:00}-{dayOfMonth:00}";
        }
    }

    private static readonly string[] Months =
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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

    [GeneratedRegex(@"[\u2010-\u2015\u2212]", RegexOptions.CultureInvariant)]
    private static partial Regex Dashes();

    [GeneratedRegex(@"(?<![\d-])\d{4}-\d{2}-\d{2}(?![\d-])", RegexOptions.CultureInvariant)]
    private static partial Regex IsoDate();

    private const string MonthName =
        @"(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?";

    [GeneratedRegex(
        @"(?<!\w)(?:(?<day1>[0-3]?\d)(?:st|nd|rd|th)?\s+" + MonthName + @"|" + MonthName + @"\s+(?<day2>[0-3]?\d)(?:st|nd|rd|th)?)(?:,?\s+(?<year>\d{4}))?(?!\w)",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex WrittenDate();

    [GeneratedRegex(@"(?<![\w.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k\b|%)?", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex Number();
}
