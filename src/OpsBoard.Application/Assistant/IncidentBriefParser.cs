using System.Text.Json;

namespace OpsBoard.Application.Assistant;

public sealed record ParsedBrief(
    IReadOnlyList<BriefStatementDto> WhatHappened,
    IReadOnlyList<BriefStatementDto> CurrentState,
    IReadOnlyList<BriefStatementDto> OpenQuestions,
    IReadOnlyList<BriefStatementDto> SuggestedChecks);

/// Checks a model reply against the brief contract. The reply is attacker
/// controlled, so anything outside the contract is rejected, not repaired.
public static class IncidentBriefParser
{
    /// <exception cref="BriefRejectedException">The reply breaks the contract.</exception>
    public static ParsedBrief Parse(string content, IReadOnlySet<string> validRefs)
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
            if (root.ValueKind != JsonValueKind.Object)
            {
                throw new BriefRejectedException("The reply is not a JSON object.");
            }

            var names = root.EnumerateObject().Select(p => p.Name).ToList();
            if (names.Count != names.Distinct(StringComparer.Ordinal).Count()
                || !names.Order(StringComparer.Ordinal).SequenceEqual(
                    IncidentBriefPrompt.Sections.Order(StringComparer.Ordinal),
                    StringComparer.Ordinal))
            {
                throw new BriefRejectedException("The reply does not have exactly the brief sections.");
            }

            var sections = IncidentBriefPrompt.Sections.ToDictionary(
                s => s,
                s => ParseSection(root.GetProperty(s), s, validRefs));
            if (sections["whatHappened"].Count == 0 && sections["currentState"].Count == 0)
            {
                throw new BriefRejectedException("The reply states no facts.");
            }

            return new ParsedBrief(
                sections["whatHappened"],
                sections["currentState"],
                sections["openQuestions"],
                sections["suggestedChecks"]);
        }
    }

    private static IReadOnlyList<BriefStatementDto> ParseSection(
        JsonElement section,
        string name,
        IReadOnlySet<string> validRefs)
    {
        if (section.ValueKind != JsonValueKind.Array
            || section.GetArrayLength() > IncidentBriefPrompt.MaxStatementsPerSection)
        {
            throw new BriefRejectedException($"Section {name} is not a list of at most {IncidentBriefPrompt.MaxStatementsPerSection}.");
        }

        var statements = new List<BriefStatementDto>();
        foreach (var item in section.EnumerateArray())
        {
            statements.Add(ParseStatement(item, name, validRefs));
        }

        return statements;
    }

    private static BriefStatementDto ParseStatement(JsonElement item, string section, IReadOnlySet<string> validRefs)
    {
        if (item.ValueKind != JsonValueKind.Object
            || item.EnumerateObject().Count() != 2
            || !item.TryGetProperty("text", out var text)
            || !item.TryGetProperty("refs", out var refs)
            || text.ValueKind != JsonValueKind.String
            || refs.ValueKind != JsonValueKind.Array)
        {
            throw new BriefRejectedException($"A statement in {section} is not exactly text and refs.");
        }

        var value = text.GetString()!.Trim();
        if (value.Length == 0 || value.Length > IncidentBriefPrompt.MaxStatementLength)
        {
            throw new BriefRejectedException($"A statement in {section} is empty or too long.");
        }

        if (refs.GetArrayLength() > IncidentBriefPrompt.MaxRefsPerStatement)
        {
            throw new BriefRejectedException($"A statement in {section} cites too many sources.");
        }

        var cited = new List<string>();
        foreach (var reference in refs.EnumerateArray())
        {
            if (reference.ValueKind != JsonValueKind.String || !validRefs.Contains(reference.GetString()!))
            {
                throw new BriefRejectedException($"A statement in {section} cites a source that was not provided.");
            }

            var id = reference.GetString()!;
            if (!cited.Contains(id, StringComparer.Ordinal))
            {
                cited.Add(id);
            }
        }

        if (cited.Count == 0 && IncidentBriefPrompt.FactSections.Contains(section))
        {
            throw new BriefRejectedException($"A fact in {section} cites no source.");
        }

        return new BriefStatementDto(value, cited);
    }
}

/// Internal to AI assistance: the brief and question services turn it into a user-facing failure.
public sealed class BriefRejectedException(string reason) : Exception(reason);
