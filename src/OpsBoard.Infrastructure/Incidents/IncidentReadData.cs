using System.Data;
using Microsoft.EntityFrameworkCore;
using OpsBoard.Application.Common;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;

namespace OpsBoard.Infrastructure.Incidents;

public sealed class IncidentReadData(OpsBoardDbContext db) : IIncidentReadData
{
    public async Task<(IReadOnlyList<ResponderDto> Items, Guid? NextAfter)> ListRespondersAsync(
        Guid organizationId,
        Guid incidentId,
        int limit,
        Guid? after,
        CancellationToken cancellationToken)
    {
        var query =
            from r in db.IncidentResponders.AsNoTracking()
            where r.OrganizationId == organizationId && r.IncidentId == incidentId
            join u in db.Users.AsNoTracking() on new { r.OrganizationId, Id = r.UserId } equals new { u.OrganizationId, u.Id }
            select new { r, u };

        if (after is not null)
        {
            query = query.Where(x => x.r.UserId.CompareTo(after.Value) > 0);
        }

        var rows = await query.OrderBy(x => x.r.UserId).Take(limit + 1)
            .Select(x => new ResponderDto(x.r.UserId, x.u.DisplayName, x.r.JoinedAt))
            .ToListAsync(cancellationToken);

        Guid? next = null;
        if (rows.Count > limit)
        {
            rows = rows.Take(limit).ToList();
            next = rows[^1].UserId;
        }

        return (rows, next);
    }

    public async Task<(IReadOnlyList<TimelineEntryDto> Items, int TotalCount)> ListTimelineAsync(
        Guid organizationId,
        Guid incidentId,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
        var query =
            from e in db.IncidentTimelineEntries.AsNoTracking()
            where e.OrganizationId == organizationId && e.IncidentId == incidentId
            join u in db.Users.AsNoTracking() on new { e.OrganizationId, Id = e.ActorUserId } equals new { u.OrganizationId, u.Id }
            select new { e, u.DisplayName };

        var total = await query.CountAsync(cancellationToken);
        var offset = PageMath.CheckedOffset(page, pageSize);
        var items = await query
            .OrderBy(x => x.e.OccurredAt)
            .ThenBy(x => x.e.Sequence)
            .Skip(offset)
            .Take(pageSize)
            .Select(x => new TimelineEntryDto(
                x.e.Id,
                RevisionFormatting.ToWire(x.e.Sequence),
                x.e.OccurredAt,
                x.e.ActorUserId,
                x.DisplayName,
                x.e.Type,
                x.e.Type == TimelineEntryType.WrittenUpdate ? "writtenUpdate" : "system",
                x.e.Body,
                x.e.FromStatus,
                x.e.ToStatus,
                x.e.FromSeverity,
                x.e.ToSeverity))
            .ToListAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return (items, total);
    }
}
