using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using OpsBoard.Application.Errors;
using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Entities;
using OpsBoard.Infrastructure.Persistence;

namespace OpsBoard.Infrastructure.Incidents;

internal sealed class IncidentWriteSession(
    OpsBoardDbContext db,
    IDbContextTransaction tx,
    Guid organizationId,
    Incident? incident) : IIncidentWriteSession
{
    private Incident? _incident = incident;
    private IncidentTimelineEntry? _pendingHistory;
    private DateTimeOffset? _loadedLastHistoryAt;
    private bool _committed;
    private bool _disposed;

    public Incident Incident =>
        _incident ?? throw new InvalidOperationException("Incident has not been added to the session.");

    public long Version => Incident.Version;

    public long LifecycleVersion => Incident.LifecycleVersion;

    public DateTimeOffset TimestampLowerBound
    {
        get
        {
            var incidentBound = _incident?.UpdatedAt ?? DateTimeOffset.MinValue;
            var historyBound = _loadedLastHistoryAt ?? DateTimeOffset.MinValue;
            return incidentBound > historyBound ? incidentBound : historyBound;
        }
    }

    public async Task InitializeHistoryLowerBoundAsync(CancellationToken cancellationToken)
    {
        if (_incident is null)
        {
            return;
        }

        _loadedLastHistoryAt = await db.IncidentTimelineEntries.AsNoTracking()
            .Where(x => x.OrganizationId == organizationId && x.IncidentId == _incident.Id)
            .OrderByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.Sequence)
            .Select(x => (DateTimeOffset?)x.OccurredAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> ServiceExistsAsync(Guid serviceId, CancellationToken cancellationToken) =>
        await db.Services.AsNoTracking()
            .AnyAsync(x => x.OrganizationId == organizationId && x.Id == serviceId, cancellationToken);

    public async Task<bool> ActorExistsAsync(Guid userId, CancellationToken cancellationToken) =>
        await db.Users.AsNoTracking()
            .AnyAsync(x => x.OrganizationId == organizationId && x.Id == userId, cancellationToken);

    public async Task<bool> HasResponderAsync(Guid userId, CancellationToken cancellationToken) =>
        await db.IncidentResponders
            .AnyAsync(
                x => x.OrganizationId == organizationId && x.IncidentId == Incident.Id && x.UserId == userId,
                cancellationToken);

    public void AddIncident(Incident incident)
    {
        if (_incident is not null)
        {
            throw new InvalidOperationException("Incident already present.");
        }

        if (incident.OrganizationId != organizationId)
        {
            throw new UnavailableException();
        }

        _incident = incident;
        db.Incidents.Add(incident);
    }

    public void AddResponder(IncidentResponder membership)
    {
        if (membership.OrganizationId != organizationId || membership.IncidentId != Incident.Id)
        {
            throw new UnavailableException();
        }

        db.IncidentResponders.Add(membership);
    }

    public void RemoveResponder(Guid userId)
    {
        var tracked = db.IncidentResponders.Local
            .FirstOrDefault(x => x.IncidentId == Incident.Id && x.UserId == userId);
        if (tracked is not null)
        {
            db.IncidentResponders.Remove(tracked);
            return;
        }

        var stub = IncidentResponder.Create(organizationId, Incident.Id, userId, Incident.CreatedAt);
        db.IncidentResponders.Attach(stub);
        db.IncidentResponders.Remove(stub);
    }

    public void AppendHistory(IncidentTimelineEntry entry)
    {
        if (entry.OrganizationId != organizationId || entry.IncidentId != Incident.Id)
        {
            throw new UnavailableException();
        }

        if (_pendingHistory is not null)
        {
            throw new InvalidOperationException("Only one history entry may be appended per commit.");
        }

        var expected = Incident.LastHistorySequence + 1;
        if (entry.Sequence != expected)
        {
            throw new InvalidOperationException($"Expected history sequence {expected}.");
        }

        _pendingHistory = entry;
    }

    public void AdvanceScalarRevision(bool lifecycleChanged) =>
        Incident.AdvanceScalarRevision(lifecycleChanged);

    public long PeekNextHistorySequence() => Incident.LastHistorySequence + 1;

    public async Task<IncidentTimelineEntry?> CommitAsync(CancellationToken cancellationToken)
    {
        if (_committed)
        {
            throw new InvalidOperationException("Session already committed.");
        }

        try
        {
            if (_pendingHistory is not null)
            {
                _ = Incident.AllocateNextHistorySequence();
                db.IncidentTimelineEntries.Add(_pendingHistory);
            }

            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            _committed = true;
            return _pendingHistory;
        }
        catch (DbUpdateConcurrencyException)
        {
            await SafeRollbackAsync(cancellationToken);
            throw new ConcurrencyConflictException();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await SafeRollbackAsync(cancellationToken);
            throw new ResponderConflictException();
        }
        catch (DbUpdateException ex) when (IsForeignKeyViolation(ex))
        {
            await SafeRollbackAsync(cancellationToken);
            throw new UnavailableException();
        }
        catch
        {
            await SafeRollbackAsync(cancellationToken);
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (!_committed)
        {
            await SafeRollbackAsync(CancellationToken.None);
            db.ChangeTracker.Clear();
        }

        await tx.DisposeAsync();
    }

    private async Task SafeRollbackAsync(CancellationToken cancellationToken)
    {
        try
        {
            await tx.RollbackAsync(cancellationToken);
        }
        catch
        {
            // already completed
        }
    }

    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    private static bool IsForeignKeyViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation };
}
