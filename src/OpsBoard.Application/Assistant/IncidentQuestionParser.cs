using System.Text.Json;

namespace OpsBoard.Application.Assistant;

/// <param name="Lookups">Related incidents to read, by label; when there are any, the answer waits for them.</param>
public sealed record ParsedAnswer(IReadOnlyList<string> Lookups, IReadOnlyList<BriefStatementDto> Answer);

/// Checks a model reply against the answer contract. The reply is attacker
/// controlled, so a lookup the server did not offer, or anything else outside
/// the contract, is rejected, not repaired.
public static class IncidentQuestionParser
{
    /// <exception cref="BriefRejectedException">The reply breaks the contract.</exception>
    public static ParsedAnswer Parse(
        string content,
        IReadOnlySet<string> validRefs,
        IReadOnlyList<string> readableRefs,
        int lookupsAllowed)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException)
        {
            throw new BriefRejectedException("The reply is not JSON.");
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || root.EnumerateObject().Count() != 2
                || !root.TryGetProperty("lookups", out var lookups)
                || !root.TryGetProperty("answer", out var answer)
                || lookups.ValueKind != JsonValueKind.Array
                || answer.ValueKind != JsonValueKind.Array)
            {
                throw new BriefRejectedException("The reply is not exactly lookups and answer.");
            }

            var reads = ParseLookups(lookups, readableRefs, lookupsAllowed);
            var sentences = ParseAnswer(answer, validRefs);
            return new ParsedAnswer(reads, reads.Count > 0 ? [] : sentences);
        }
    }

    private static List<string> ParseLookups(JsonElement lookups, IReadOnlyList<string> readableRefs, int lookupsAllowed)
    {
        if (lookups.GetArrayLength() > lookupsAllowed)
        {
            throw new BriefRejectedException($"The reply asks for more than {lookupsAllowed} lookups.");
        }

        var reads = new List<string>();
        foreach (var item in lookups.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object
                || item.EnumerateObject().Count() != 2
                || !item.TryGetProperty("tool", out var tool)
                || !item.TryGetProperty("ref", out var reference)
                || tool.ValueKind != JsonValueKind.String
                || reference.ValueKind != JsonValueKind.String)
            {
                throw new BriefRejectedException("A lookup is not exactly tool and ref.");
            }

            if (!string.Equals(tool.GetString(), IncidentQuestionPrompt.ReadRelatedIncident, StringComparison.Ordinal))
            {
                throw new BriefRejectedException("A lookup names a tool that does not exist.");
            }

            var label = reference.GetString()!;
            if (!readableRefs.Contains(label, StringComparer.Ordinal))
            {
                throw new BriefRejectedException("A lookup names an incident that was not offered.");
            }

            if (!reads.Contains(label, StringComparer.Ordinal))
            {
                reads.Add(label);
            }
        }

        return reads;
    }

    private static List<BriefStatementDto> ParseAnswer(JsonElement answer, IReadOnlySet<string> validRefs)
    {
        if (answer.GetArrayLength() > IncidentQuestionPrompt.MaxSentences)
        {
            throw new BriefRejectedException($"The answer has more than {IncidentQuestionPrompt.MaxSentences} sentences.");
        }

        var sentences = new List<BriefStatementDto>();
        foreach (var item in answer.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object
                || item.EnumerateObject().Count() != 2
                || !item.TryGetProperty("text", out var text)
                || !item.TryGetProperty("refs", out var refs)
                || text.ValueKind != JsonValueKind.String
                || refs.ValueKind != JsonValueKind.Array)
            {
                throw new BriefRejectedException("A sentence is not exactly text and refs.");
            }

            var value = text.GetString()!.Trim();
            if (value.Length == 0 || value.Length > IncidentQuestionPrompt.MaxSentenceLength)
            {
                throw new BriefRejectedException("A sentence is empty or too long.");
            }

            if (refs.GetArrayLength() > IncidentQuestionPrompt.MaxRefsPerSentence)
            {
                throw new BriefRejectedException("A sentence cites too many sources.");
            }

            var cited = new List<string>();
            foreach (var reference in refs.EnumerateArray())
            {
                if (reference.ValueKind != JsonValueKind.String || !validRefs.Contains(reference.GetString()!))
                {
                    throw new BriefRejectedException("A sentence cites a source that was not provided.");
                }

                var id = reference.GetString()!;
                if (!cited.Contains(id, StringComparer.Ordinal))
                {
                    cited.Add(id);
                }
            }

            if (cited.Count == 0)
            {
                throw new BriefRejectedException("A sentence cites no source.");
            }

            sentences.Add(new BriefStatementDto(value, cited));
        }

        return sentences;
    }
}
