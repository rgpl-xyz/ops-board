using Microsoft.EntityFrameworkCore;
using OpsBoard.Application.Common;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Services;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;

namespace OpsBoard.Infrastructure.Services;

public sealed class ServiceData(OpsBoardDbContext db) : IServiceData
{
    public async Task<(IReadOnlyList<ServiceDto> Items, int TotalCount)> ListAsync(
        Guid organizationId,
        ServiceQuery query,
        CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.RepeatableRead,
            cancellationToken);

        var filtered = ApplyFilters(db.Services.AsNoTracking().Where(x => x.OrganizationId == organizationId), query);
        var total = await filtered.CountAsync(cancellationToken);
        var offset = PageMath.CheckedOffset(query.Page, query.PageSize);

        var itemsQuery =
            from s in filtered
            join t in db.Teams.AsNoTracking() on new { s.OrganizationId, Id = s.TeamId } equals new { t.OrganizationId, t.Id }
            select new { s, t.Name };

        var desc = query.Direction == "desc";
        itemsQuery = query.Sort switch
        {
            // Health is stored as text, so rank it explicitly: desc puts outages first.
            "health" => desc
                ? itemsQuery.OrderByDescending(x => x.s.Health == ServiceHealth.Outage)
                    .ThenByDescending(x => x.s.Health == ServiceHealth.Degraded)
                    .ThenBy(x => x.s.Id)
                : itemsQuery.OrderByDescending(x => x.s.Health == ServiceHealth.Operational)
                    .ThenByDescending(x => x.s.Health == ServiceHealth.Degraded)
                    .ThenBy(x => x.s.Id),
            "updatedAt" => desc
                ? itemsQuery.OrderByDescending(x => x.s.UpdatedAt).ThenBy(x => x.s.Id)
                : itemsQuery.OrderBy(x => x.s.UpdatedAt).ThenBy(x => x.s.Id),
            // lower() keeps name order case-insensitive whatever the database collation.
            _ => desc
                ? itemsQuery.OrderByDescending(x => x.s.Name.ToLower()).ThenBy(x => x.s.Id)
                : itemsQuery.OrderBy(x => x.s.Name.ToLower()).ThenBy(x => x.s.Id),
        };

        var rows = await itemsQuery.Skip(offset).Take(query.PageSize)
            .Select(x => new ServiceDto(
                x.s.Id,
                x.s.Name,
                x.s.Description,
                x.s.TeamId,
                x.Name,
                x.s.Health,
                x.s.CreatedAt,
                x.s.UpdatedAt,
                RevisionFormatting.ToWire(x.s.Version)))
            .ToListAsync(cancellationToken);

        await tx.CommitAsync(cancellationToken);
        return (rows, total);
    }

    public async Task<ServiceDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken)
    {
        return await (
            from s in db.Services.AsNoTracking()
            where s.OrganizationId == organizationId && s.Id == id
            join t in db.Teams.AsNoTracking() on new { s.OrganizationId, Id = s.TeamId } equals new { t.OrganizationId, t.Id }
            select new ServiceDto(
                s.Id,
                s.Name,
                s.Description,
                s.TeamId,
                t.Name,
                s.Health,
                s.CreatedAt,
                s.UpdatedAt,
                RevisionFormatting.ToWire(s.Version))).FirstOrDefaultAsync(cancellationToken);
    }

    public Task<Service?> GetForUpdateAsync(Guid organizationId, Guid id, CancellationToken cancellationToken) =>
        db.Services.FirstOrDefaultAsync(x => x.OrganizationId == organizationId && x.Id == id, cancellationToken);

    public Task<bool> TeamExistsAsync(Guid organizationId, Guid teamId, CancellationToken cancellationToken) =>
        db.Teams.AsNoTracking().AnyAsync(x => x.OrganizationId == organizationId && x.Id == teamId, cancellationToken);

    public Task<bool> ServiceExistsAsync(Guid organizationId, Guid serviceId, CancellationToken cancellationToken) =>
        db.Services.AsNoTracking().AnyAsync(x => x.OrganizationId == organizationId && x.Id == serviceId, cancellationToken);

    public async Task<ServiceDto> CreateAsync(Service service, CancellationToken cancellationToken)
    {
        db.Services.Add(service);
        await db.SaveChangesAsync(cancellationToken);
        return (await GetAsync(service.OrganizationId, service.Id, cancellationToken))!;
    }

    public async Task<ServiceDto> UpdateAsync(Service service, long expectedVersion, CancellationToken cancellationToken)
    {
        if (service.Version != expectedVersion)
        {
            throw new ConcurrencyConflictException();
        }

        service.AdvanceVersion();
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConcurrencyConflictException();
        }

        return (await GetAsync(service.OrganizationId, service.Id, cancellationToken))!;
    }

    private static IQueryable<Service> ApplyFilters(IQueryable<Service> query, ServiceQuery filter)
    {
        if (filter.TeamId is Guid teamId)
        {
            query = query.Where(x => x.TeamId == teamId);
        }

        if (filter.Health is ServiceHealth health)
        {
            query = query.Where(x => x.Health == health);
        }

        var search = filter.Search?.Trim();
        if (!string.IsNullOrEmpty(search))
        {
            var pattern = EscapeIlike(search);
            query = query.Where(x =>
                EF.Functions.ILike(x.Name, $"%{pattern}%", "\\")
                || EF.Functions.ILike(x.Description, $"%{pattern}%", "\\"));
        }

        return query;
    }

    internal static string EscapeIlike(string input) =>
        input.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
