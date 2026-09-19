using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using OpsBoard.Application.Common;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence;
using OpsBoard.Infrastructure.Services;

namespace OpsBoard.Infrastructure.Incidents;

public sealed class IncidentData(OpsBoardDbContext db) : IIncidentData
{
    public async Task<(IReadOnlyList<IncidentSummaryDto> Items, int TotalCount)> ListAsync(
        Guid organizationId,
        IncidentQuery query,
        CancellationToken cancellationToken)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
        var baseQuery =
            from incident in db.Incidents.AsNoTracking()
            where incident.OrganizationId == organizationId
            join service in db.Services.AsNoTracking()
                on new { incident.OrganizationId, Id = incident.ServiceId } equals new { service.OrganizationId, service.Id }
            join team in db.Teams.AsNoTracking()
                on new { service.OrganizationId, Id = service.TeamId } equals new { team.OrganizationId, team.Id }
            select new
            {
                Incident = incident,
                Service = service,
                Team = team
            };

        if (query.ServiceId is Guid serviceId)
        {
            baseQuery = baseQuery.Where(x => x.Incident.ServiceId == serviceId);
        }

        if (query.TeamId is Guid teamId)
        {
            baseQuery = baseQuery.Where(x => x.Service.TeamId == teamId);
        }

        if (query.Severity is IncidentSeverity severity)
        {
            baseQuery = baseQuery.Where(x => x.Incident.Severity == severity);
        }

        if (query.Status is IncidentStatus status)
        {
            baseQuery = baseQuery.Where(x => x.Incident.Status == status);
        }

        var search = query.Search?.Trim();
        if (!string.IsNullOrEmpty(search))
        {
            var pattern = ServiceData.EscapeIlike(search);
            baseQuery = baseQuery.Where(x =>
                EF.Functions.ILike(x.Incident.Title, $"%{pattern}%", "\\")
                || EF.Functions.ILike(x.Incident.Description, $"%{pattern}%", "\\"));
        }

        var total = await baseQuery.CountAsync(cancellationToken);
        var offset = PageMath.CheckedOffset(query.Page, query.PageSize);
        var desc = query.Direction == "desc";
        var ordered = query.Sort switch
        {
            "severity" => desc
                ? baseQuery.OrderByDescending(x => x.Incident.Severity == IncidentSeverity.Critical)
                    .ThenByDescending(x => x.Incident.Severity == IncidentSeverity.High)
                    .ThenByDescending(x => x.Incident.Severity == IncidentSeverity.Medium)
                    .ThenByDescending(x => x.Incident.Severity == IncidentSeverity.Low)
                    .ThenBy(x => x.Incident.Id)
                : baseQuery.OrderByDescending(x => x.Incident.Severity == IncidentSeverity.Low)
                    .ThenByDescending(x => x.Incident.Severity == IncidentSeverity.Medium)
                    .ThenByDescending(x => x.Incident.Severity == IncidentSeverity.High)
                    .ThenByDescending(x => x.Incident.Severity == IncidentSeverity.Critical)
                    .ThenBy(x => x.Incident.Id),
            "status" => desc
                ? baseQuery.OrderByDescending(x => x.Incident.Status == IncidentStatus.Investigating)
                    .ThenByDescending(x => x.Incident.Status == IncidentStatus.Identified)
                    .ThenByDescending(x => x.Incident.Status == IncidentStatus.Monitoring)
                    .ThenByDescending(x => x.Incident.Status == IncidentStatus.Resolved)
                    .ThenBy(x => x.Incident.Id)
                : baseQuery.OrderByDescending(x => x.Incident.Status == IncidentStatus.Resolved)
                    .ThenByDescending(x => x.Incident.Status == IncidentStatus.Monitoring)
                    .ThenByDescending(x => x.Incident.Status == IncidentStatus.Identified)
                    .ThenByDescending(x => x.Incident.Status == IncidentStatus.Investigating)
                    .ThenBy(x => x.Incident.Id),
            _ => desc
                ? baseQuery.OrderByDescending(x => x.Incident.CreatedAt).ThenBy(x => x.Incident.Id)
                : baseQuery.OrderBy(x => x.Incident.CreatedAt).ThenBy(x => x.Incident.Id)
        };
        var items = await ordered.Skip(offset).Take(query.PageSize)
            .Select(x => new IncidentSummaryDto(
                x.Incident.Id,
                x.Incident.Title,
                x.Incident.ServiceId,
                x.Service.Name,
                x.Service.TeamId,
                x.Team.Name,
                x.Incident.Severity,
                x.Incident.Status,
                x.Incident.CreatedAt,
                x.Incident.UpdatedAt,
                x.Incident.ResolvedAt,
                RevisionFormatting.ToWire(x.Incident.Version),
                RevisionFormatting.ToWire(x.Incident.LifecycleVersion)))
            .ToListAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return (items, total);
    }

    public async Task<IncidentDetailDto?> GetAsync(Guid organizationId, Guid id, CancellationToken cancellationToken)
    {
        return await (
            from incident in db.Incidents.AsNoTracking()
            where incident.OrganizationId == organizationId && incident.Id == id
            join service in db.Services.AsNoTracking()
                on new { incident.OrganizationId, Id = incident.ServiceId } equals new { service.OrganizationId, service.Id }
            join team in db.Teams.AsNoTracking()
                on new { service.OrganizationId, Id = service.TeamId } equals new { team.OrganizationId, team.Id }
            select new IncidentDetailDto(
                incident.Id,
                incident.Title,
                incident.Description,
                incident.ServiceId,
                service.Name,
                service.TeamId,
                team.Name,
                incident.CreatedByUserId,
                incident.Severity,
                incident.Status,
                incident.CreatedAt,
                incident.UpdatedAt,
                incident.ResolvedAt,
                RevisionFormatting.ToWire(incident.Version),
                RevisionFormatting.ToWire(incident.LifecycleVersion))).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IIncidentWriteSession> BeginCreateAsync(Guid organizationId, CancellationToken cancellationToken)
    {
        var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        return new IncidentWriteSession(db, tx, organizationId, incident: null);
    }

    public async Task<IIncidentWriteSession> BeginMutationAsync(
        Guid organizationId,
        Guid incidentId,
        CancellationToken cancellationToken)
    {
        var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            var incident = await LockIncidentAsync(organizationId, incidentId, cancellationToken);
            if (incident is null)
            {
                await tx.DisposeAsync();
                throw new UnavailableException();
            }

            db.Attach(incident);
            db.Entry(incident).State = EntityState.Unchanged;
            var session = new IncidentWriteSession(db, tx, organizationId, incident);
            await session.InitializeHistoryLowerBoundAsync(cancellationToken);
            return session;
        }
        catch
        {
            await tx.DisposeAsync();
            throw;
        }
    }

    private async Task<Incident?> LockIncidentAsync(Guid organizationId, Guid incidentId, CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText =
            """
            SELECT id, organization_id, service_id, created_by_user_id, title, description, severity, status,
                   created_at, updated_at, resolved_at, version, lifecycle_version, last_history_sequence
            FROM incidents
            WHERE organization_id = @org AND id = @id
            FOR UPDATE
            """;
        AddParam(command, "org", organizationId);
        AddParam(command, "id", incidentId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return Incident.Reconstitute(
            reader.GetGuid(0),
            reader.GetGuid(1),
            reader.GetGuid(2),
            reader.GetGuid(3),
            reader.GetString(4),
            reader.GetString(5),
            Enum.Parse<IncidentSeverity>(reader.GetString(6)),
            Enum.Parse<IncidentStatus>(reader.GetString(7)),
            reader.GetFieldValue<DateTimeOffset>(8),
            reader.GetFieldValue<DateTimeOffset>(9),
            reader.IsDBNull(10) ? null : reader.GetFieldValue<DateTimeOffset>(10),
            reader.GetInt64(11),
            reader.GetInt64(12),
            reader.GetInt64(13));
    }

    private static void AddParam(DbCommand command, string name, object value)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        command.Parameters.Add(p);
    }

}
