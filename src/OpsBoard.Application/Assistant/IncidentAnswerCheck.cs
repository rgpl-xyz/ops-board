using System.Text.RegularExpressions;

namespace OpsBoard.Application.Assistant;

/// Holds each sentence of an answer to the records it cites. A sentence may
/// not state a number, clock time or name that none of them holds, and must
/// share its meaningful words with them: at least two, or all it has when it
/// has fewer. Text that is not about the records, such as a poem or a recipe,
/// fails that second rule. One failing sentence refuses the whole answer.
///
/// The word rule stops a model from being used for unrelated tasks in
/// ordinary use. It cannot stop a reply written to pass it; what keeps such a
/// reply harmless is that it is plain text, bounded, and from data the reader
/// can already see.
public static partial class IncidentAnswerCheck
{
    private const int MinSharedWords = 2;

    /// The first letters a word is compared on, so "failing" matches "failed".
    private const int Stem = 4;

    private static readonly HashSet<string> Common = new(StringComparer.Ordinal)
    {
        "about", "above", "after", "again", "against", "also", "although", "another", "because", "been", "before",
        "being", "below", "between", "both", "cannot", "could", "does", "doing", "down", "during", "each", "either",
        "even", "ever", "every", "from", "further", "have", "having", "here", "into", "just", "last", "least", "less",
        "many", "more", "most", "much", "must", "neither", "never", "next", "none", "once", "only", "other", "over",
        "same", "says", "should", "since", "some", "still", "such", "than", "that", "their", "them", "then", "there",
        "these", "they", "this", "those", "through", "under", "until", "upon", "very", "were", "what", "when",
        "where", "which", "while", "will", "with", "within", "without", "would", "yes", "your", "incident",
        "incidents", "record", "records", "according", "currently",
    };

    /// <exception cref="BriefRejectedException">A sentence is not supported by what it cites.</exception>
    public static void Verify(IReadOnlyList<BriefStatementDto> sentences, IncidentQuestionContext context)
    {
        var people = context.People;
        foreach (var sentence in sentences)
        {
            var cited = sentence.Refs.Select(r => context.Records[r]).ToList();
            var held = cited
                .SelectMany(r => RecordDetails.Held(r.Texts, r.Times, r.People, people))
                .ToHashSet(StringComparer.Ordinal);
            if (RecordDetails.Details(sentence.Text, people, distinctiveNumbersOnly: true).Any(d => !held.Contains(d)))
            {
                throw new BriefRejectedException("A sentence states a detail its sources do not hold.");
            }

            var words = Words(sentence.Text);
            var available = cited.SelectMany(r => r.Texts).SelectMany(Words).ToHashSet(StringComparer.Ordinal);
            if (words.Count(available.Contains) < Math.Min(MinSharedWords, words.Count))
            {
                throw new BriefRejectedException("A sentence shares too few words with its sources.");
            }
        }
    }

    /// Meaningful words, lower case and cut to their first letters.
    private static HashSet<string> Words(string text) =>
        Letters().Matches(text.ToLowerInvariant())
            .Select(m => m.Value)
            .Where(w => w.Length >= Stem && !Common.Contains(w))
            .Select(w => w[..Stem])
            .ToHashSet(StringComparer.Ordinal);

    [GeneratedRegex(@"\p{L}+", RegexOptions.CultureInvariant)]
    private static partial Regex Letters();
}
