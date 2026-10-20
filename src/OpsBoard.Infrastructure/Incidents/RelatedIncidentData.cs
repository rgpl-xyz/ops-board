using Microsoft.EntityFrameworkCore;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;

namespace OpsBoard.Infrastructure.Incidents;

/// Finds related incidents by fixed rules, so the same records always give
/// the same list. Each other incident scores 3 for the same service, or 1 for
/// another service of the same team, plus 2 for each word its title shares
/// with this one. It is related at 3 or more: any incident on the same
/// service, one of the same team sharing a word, or one of another team
/// sharing two. Ties go to the incident opened closest in time.
///
/// Only titles are compared. Descriptions are longer and share everyday words
/// ("minutes", "customers") with unrelated incidents.
public sealed class RelatedIncidentData(OpsBoardDbContext db) : IRelatedIncidentData
{
    /// ts_debug token types that are plain numbers, which say little about what went wrong.
    private static readonly HashSet<string> NumberTokens = new(StringComparer.Ordinal)
    {
        "int", "uint", "float", "sfloat", "version"
    };

    /// Numbers written as words, which say as little ("in one zone", "at one provider").
    private static readonly HashSet<string> NumberWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"
    };

    public async Task<IReadOnlyList<RelatedIncidentDto>?> ListAsync(
        Guid organizationId,
        Guid incidentId,
        int limit,
        CancellationToken cancellationToken)
    {
        var target = await (
            from incident in db.Incidents.AsNoTracking()
            where incident.OrganizationId == organizationId && incident.Id == incidentId
            join service in db.Services.AsNoTracking()
                on new { incident.OrganizationId, Id = incident.ServiceId } equals new { service.OrganizationId, service.Id }
            select new { incident.Title, incident.ServiceId, service.TeamId, incident.CreatedAt }).FirstOrDefaultAsync(cancellationToken);
        if (target is null)
        {
            return null;
        }

        var words = await TitleWordsAsync(target.Title, cancellationToken);
        var wordIndexes = words.SelectMany((word, index) => word.Stems.Select(_ => index)).ToArray();
        var stems = words.SelectMany(word => word.Stems).ToArray();

        var rows = await db.Database.SqlQuery<Row>(
            $"""
            WITH candidates AS (
                SELECT i.id AS "Id", i.title AS "Title", s.name AS "ServiceName", t.name AS "TeamName",
                       i.severity AS "Severity", i.status AS "Status", i.created_at AS "CreatedAt",
                       i.resolved_at AS "ResolvedAt", i.service_id = {target.ServiceId} AS "SameService",
                       s.team_id = {target.TeamId} AS "SameTeam",
                       ARRAY(
                           SELECT DISTINCT w.index
                           FROM unnest({wordIndexes}, {stems}) AS w(index, stem)
                           WHERE w.stem = ANY (tsvector_to_array(to_tsvector('english'::regconfig, i.title)))
                           ORDER BY w.index) AS "Shared"
                FROM incidents i
                JOIN services s ON s.organization_id = i.organization_id AND s.id = i.service_id
                JOIN teams t ON t.organization_id = s.organization_id AND t.id = s.team_id
                WHERE i.organization_id = {organizationId} AND i.id <> {incidentId}
                  AND (s.team_id = {target.TeamId}
                       OR tsvector_to_array(to_tsvector('english'::regconfig, i.title)) && {stems})
            ), scored AS (
                SELECT c.*,
                       CASE WHEN c."SameService" THEN 3 WHEN c."SameTeam" THEN 1 ELSE 0 END
                           + 2 * cardinality(c."Shared") AS score
                FROM candidates c
            )
            SELECT "Id", "Title", "ServiceName", "TeamName", "Severity", "Status", "CreatedAt", "ResolvedAt",
                   "SameService", "SameTeam", "Shared"
            FROM scored
            WHERE score >= 3
            ORDER BY score DESC, abs(extract(epoch FROM "CreatedAt" - {target.CreatedAt})), "Id"
            LIMIT {limit}
            """).ToListAsync(cancellationToken);

        return rows.Select(row => new RelatedIncidentDto(
            row.Id,
            row.Title,
            row.ServiceName,
            row.TeamName,
            Enum.Parse<IncidentSeverity>(row.Severity),
            Enum.Parse<IncidentStatus>(row.Status),
            row.CreatedAt,
            row.ResolvedAt,
            row.SameService,
            row.SameTeam,
            row.Shared.Select(index => words[index].Text).ToList())).ToList();
    }

    /// The title's words as Postgres's English text search reads them, each
    /// with the stems it matches on: "payments" matches "payment". Common
    /// words and plain numbers have no say. A hyphenated word also matches on
    /// its parts, so "sign-in" matches "signed". A word whose stem came
    /// earlier in the title counts once.
    private async Task<IReadOnlyList<TitleWord>> TitleWordsAsync(string title, CancellationToken cancellationToken)
    {
        var tokens = await db.Database.SqlQuery<Token>(
            $"""SELECT alias AS "Alias", token AS "Text", lexemes AS "Lexemes" FROM ts_debug('english', {title})""")
            .ToListAsync(cancellationToken);

        var words = new List<TitleWord>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        TitleWord? hyphenated = null;
        foreach (var token in tokens)
        {
            if (token.Alias.StartsWith("hword_", StringComparison.Ordinal))
            {
                if (hyphenated is not null && token.Lexemes is not null)
                {
                    hyphenated.Stems.AddRange(token.Lexemes);
                    seen.UnionWith(token.Lexemes);
                }

                continue;
            }

            if (token.Alias == "blank")
            {
                continue;
            }

            hyphenated = null;
            if (token.Lexemes is not [var stem, ..]
                || NumberTokens.Contains(token.Alias)
                || NumberWords.Contains(token.Text)
                || !seen.Add(stem))
            {
                continue;
            }

            var word = new TitleWord(token.Text, [.. token.Lexemes]);
            words.Add(word);
            if (token.Alias.EndsWith("hword", StringComparison.Ordinal))
            {
                hyphenated = word;
            }
        }

        return words;
    }

    private sealed record TitleWord(string Text, List<string> Stems);

    private sealed class Token
    {
        public required string Alias { get; init; }

        public required string Text { get; init; }

        public string[]? Lexemes { get; init; }
    }

    private sealed class Row
    {
        public Guid Id { get; init; }

        public required string Title { get; init; }

        public required string ServiceName { get; init; }

        public required string TeamName { get; init; }

        public required string Severity { get; init; }

        public required string Status { get; init; }

        public DateTimeOffset CreatedAt { get; init; }

        public DateTimeOffset? ResolvedAt { get; init; }

        public bool SameService { get; init; }

        public bool SameTeam { get; init; }

        public required int[] Shared { get; init; }
    }
}
