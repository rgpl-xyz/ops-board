namespace OpsBoard.Domain.Entities;

public sealed class IncidentResponder
{
    private IncidentResponder()
    {
    }

    private IncidentResponder(Guid organizationId, Guid incidentId, Guid userId, DateTimeOffset joinedAt)
    {
        OrganizationId = organizationId;
        IncidentId = incidentId;
        UserId = userId;
        JoinedAt = joinedAt;
    }

    public Guid OrganizationId { get; private set; }

    public Guid IncidentId { get; private set; }

    public Guid UserId { get; private set; }

    public DateTimeOffset JoinedAt { get; private set; }

    public static IncidentResponder Create(
        Guid organizationId,
        Guid incidentId,
        Guid userId,
        DateTimeOffset joinedAt)
    {
        return new IncidentResponder(
            Guards.RequireId(organizationId, nameof(organizationId)),
            Guards.RequireId(incidentId, nameof(incidentId)),
            Guards.RequireId(userId, nameof(userId)),
            Guards.RequireUtc(joinedAt, nameof(joinedAt)));
    }
}
