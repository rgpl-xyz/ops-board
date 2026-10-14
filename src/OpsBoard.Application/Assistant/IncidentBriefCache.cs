namespace OpsBoard.Application.Assistant;

/// The latest brief per incident, reused while everything the model would see
/// is unchanged. A lookup happens only after the caller's access to the
/// incident is checked, and entries are keyed by organization as well.
public sealed class IncidentBriefCache
{
    public const int Capacity = 500;

    private readonly Dictionary<(Guid OrganizationId, Guid IncidentId), (string Key, IncidentBriefDto Brief)> _entries = [];
    private readonly Lock _sync = new();

    public IncidentBriefDto? Find(Guid organizationId, Guid incidentId, string key)
    {
        lock (_sync)
        {
            return _entries.TryGetValue((organizationId, incidentId), out var entry) && entry.Key == key
                ? entry.Brief
                : null;
        }
    }

    public void Store(Guid organizationId, Guid incidentId, string key, IncidentBriefDto brief)
    {
        lock (_sync)
        {
            if (_entries.Count >= Capacity && !_entries.ContainsKey((organizationId, incidentId)))
            {
                var oldest = _entries.MinBy(e => e.Value.Brief.GeneratedAt).Key;
                _entries.Remove(oldest);
            }

            _entries[(organizationId, incidentId)] = (key, brief);
        }
    }
}
