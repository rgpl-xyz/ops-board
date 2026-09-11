using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Infrastructure.Persistence.Seed;

public static class DemoSeedFixture
{
    private static readonly string[] TeamNames = ["Platform", "Payments", "Identity", "Messaging"];

    private static readonly (string Name, int TeamN, ServiceHealth Health)[] Services =
    [
        ("API Gateway", 1, ServiceHealth.Operational),
        ("Compute Scheduler", 1, ServiceHealth.Operational),
        ("Object Storage", 1, ServiceHealth.Operational),
        ("Checkout API", 2, ServiceHealth.Operational),
        ("Payment Processor", 2, ServiceHealth.Outage),
        ("Billing Worker", 2, ServiceHealth.Operational),
        ("Auth API", 3, ServiceHealth.Degraded),
        ("Session Store", 3, ServiceHealth.Operational),
        ("Directory Sync", 3, ServiceHealth.Operational),
        ("Email Delivery", 4, ServiceHealth.Degraded),
        ("SMS Delivery", 4, ServiceHealth.Operational),
        ("Event Broker", 4, ServiceHealth.Operational)
    ];

    private static readonly (string Name, int TeamN, UserRole Role)[] Users =
    [
        ("Veyo R", 1, UserRole.IncidentManager),
        ("Jordan Patel", 1, UserRole.Administrator),
        ("Morgan Reed", 1, UserRole.Responder),
        ("Casey Rivera", 2, UserRole.Responder),
        ("Sam Okafor", 2, UserRole.Viewer),
        ("Riley Kim", 3, UserRole.Responder),
        ("Alex Santos", 3, UserRole.Viewer),
        ("Taylor Brooks", 4, UserRole.Responder),
        ("Jamie Park", 4, UserRole.Viewer),
        ("Quinn Lee", 2, UserRole.IncidentManager)
    ];

    private static readonly IncidentSeverity[] SeverityCycle =
    [
        IncidentSeverity.Critical,
        IncidentSeverity.High,
        IncidentSeverity.Medium,
        IncidentSeverity.Low
    ];

    public static DemoSeedModel Build()
    {
        var org = Organization.Create(SeedIds.Acme, "Acme Cloud");
        var teams = TeamNames
            .Select((name, i) => Team.Create(SeedIds.D(2, i + 1), SeedIds.Acme, name))
            .ToList();
        var users = Users
            .Select((u, i) => User.Create(
                SeedIds.D(3, i + 1),
                SeedIds.Acme,
                SeedIds.D(2, u.TeamN),
                u.Name,
                u.Role))
            .ToList();
        var services = Services
            .Select((s, i) =>
            {
                var created = SeedIds.Epoch;
                var service = Service.Create(
                    SeedIds.D(4, i + 1),
                    SeedIds.Acme,
                    SeedIds.D(2, s.TeamN),
                    s.Name,
                    $"{s.Name} for Acme Cloud operations.",
                    created);
                if (s.Health != ServiceHealth.Operational)
                {
                    service.Update(service.Name, service.Description, service.TeamId, s.Health, created);
                    service.SetVersion(1);
                }

                return service;
            })
            .ToList();

        var incidents = new List<Incident>();
        var responders = new List<IncidentResponder>();
        var history = new List<IncidentTimelineEntry>();
        var postmortems = new List<Postmortem>();

        for (var i = 1; i <= 24; i++)
        {
            BuildHistoricalIncident(i, incidents, responders, history, postmortems);
        }

        BuildActiveIncident(25, serviceN: 5, IncidentSeverity.Critical, IncidentStatus.Investigating, hourOffset: 0, incidents, responders, history);
        BuildActiveIncident(26, serviceN: 7, IncidentSeverity.High, IncidentStatus.Identified, hourOffset: 1, incidents, responders, history);
        BuildActiveIncident(27, serviceN: 10, IncidentSeverity.Medium, IncidentStatus.Monitoring, hourOffset: 2, incidents, responders, history);

        return new DemoSeedModel(org, teams, users, services, incidents, responders, history, postmortems);
    }

    private static void BuildHistoricalIncident(
        int i,
        List<Incident> incidents,
        List<IncidentResponder> responders,
        List<IncidentTimelineEntry> history,
        List<Postmortem> postmortems)
    {
        var serviceN = 1 + ((i - 1) % 12);
        var t0 = SeedIds.Epoch.AddDays(i - 1);
        var severity = SeverityCycle[(i - 1) % 4];
        var serviceName = Services[serviceN - 1].Name;
        var incident = Incident.Create(
            SeedIds.D(5, i),
            SeedIds.Acme,
            SeedIds.D(4, serviceN),
            SeedIds.DemoUser,
            $"{serviceName} elevated errors",
            $"Historical incident {i}: {serviceName} showed latency, elevated errors, or backlog.",
            severity,
            t0);

        var steps = new List<(DateTimeOffset At, Action Apply)>();
        long sequence = 0;
        long version = 1;
        long lifecycle = 1;

        void Append(TimelineEntryType type, DateTimeOffset at, Func<long, IncidentTimelineEntry> factory, bool advanceLifecycle = false, bool advanceVersion = false)
        {
            sequence++;
            if (advanceVersion)
            {
                version++;
            }

            if (advanceLifecycle)
            {
                lifecycle++;
            }

            history.Add(factory(sequence));
        }

        Append(
            TimelineEntryType.IncidentCreated,
            t0,
            seq => IncidentTimelineEntry.IncidentCreated(
                SeedIds.D(6, i * 100 + (int)seq),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                seq,
                t0,
                severity));

        var joinAt = t0.AddMinutes(1);
        responders.Add(IncidentResponder.Create(SeedIds.Acme, incident.Id, SeedIds.DemoUser, joinAt));
        Append(
            TimelineEntryType.ResponderJoined,
            joinAt,
            seq => IncidentTimelineEntry.ResponderJoined(
                SeedIds.D(6, i * 100 + (int)seq),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                seq,
                joinAt));

        var updateAt = t0.AddMinutes(5);
        Append(
            TimelineEntryType.WrittenUpdate,
            updateAt,
            seq => IncidentTimelineEntry.WrittenUpdate(
                SeedIds.D(6, i * 100 + (int)seq),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                seq,
                updateAt,
                "Initial diagnostics collected."));

        var identifiedAt = t0.AddMinutes(10);
        incident.ChangeActiveStatus(IncidentStatus.Identified, identifiedAt);
        Append(
            TimelineEntryType.StatusChanged,
            identifiedAt,
            seq => IncidentTimelineEntry.StatusChanged(
                SeedIds.D(6, i * 100 + (int)seq),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                seq,
                identifiedAt,
                IncidentStatus.Investigating,
                IncidentStatus.Identified),
            advanceVersion: true);

        var monitoringAt = t0.AddMinutes(20);
        incident.ChangeActiveStatus(IncidentStatus.Monitoring, monitoringAt);
        Append(
            TimelineEntryType.StatusChanged,
            monitoringAt,
            seq => IncidentTimelineEntry.StatusChanged(
                SeedIds.D(6, i * 100 + (int)seq),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                seq,
                monitoringAt,
                IncidentStatus.Identified,
                IncidentStatus.Monitoring),
            advanceVersion: true);

        var resolvedAt = t0.AddMinutes(40);
        var fromBeforeResolve = incident.Status;
        incident.Resolve(resolvedAt);
        Append(
            TimelineEntryType.Resolved,
            resolvedAt,
            seq => IncidentTimelineEntry.Resolved(
                SeedIds.D(6, i * 100 + (int)seq),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                seq,
                resolvedAt,
                fromBeforeResolve),
            advanceVersion: true,
            advanceLifecycle: true);

        if (i % 6 == 0)
        {
            var reopenAt = t0.AddMinutes(60);
            incident.Reopen(reopenAt);
            Append(
                TimelineEntryType.Reopened,
                reopenAt,
                seq => IncidentTimelineEntry.Reopened(
                    SeedIds.D(6, i * 100 + (int)seq),
                    SeedIds.Acme,
                    incident.Id,
                    SeedIds.DemoUser,
                    seq,
                    reopenAt),
                advanceVersion: true,
                advanceLifecycle: true);

            var resolve2 = t0.AddMinutes(90);
            incident.Resolve(resolve2);
            Append(
                TimelineEntryType.Resolved,
                resolve2,
                seq => IncidentTimelineEntry.Resolved(
                    SeedIds.D(6, i * 100 + (int)seq),
                    SeedIds.Acme,
                    incident.Id,
                    SeedIds.DemoUser,
                    seq,
                    resolve2,
                    IncidentStatus.Investigating),
                advanceVersion: true,
                advanceLifecycle: true);
        }

        // Persist domain-consistent counters from the operations above.
        // Domain methods do not advance Version; seed applies the counted values.
        incident.SetPersistenceCounters(version, lifecycle, sequence);
        incidents.Add(incident);

        if (i is >= 1 and <= 3)
        {
            postmortems.Add(Postmortem.Create(
                SeedIds.D(7, i),
                SeedIds.Acme,
                incident.Id,
                $"Summary for {serviceName} incident {i}.",
                $"Customer-visible impact on {serviceName}.",
                "Timeout budget regression and retry pressure.",
                "Rolled back bad config and drained backlog.",
                [
                    "Raise timeout budget regression checks.",
                    "Add follow-up queue saturation monitors."
                ]));
        }
    }

    private static void BuildActiveIncident(
        int i,
        int serviceN,
        IncidentSeverity severity,
        IncidentStatus targetStatus,
        int hourOffset,
        List<Incident> incidents,
        List<IncidentResponder> responders,
        List<IncidentTimelineEntry> history)
    {
        var t0 = SeedIds.ActiveEpoch.AddHours(hourOffset);
        var serviceName = Services[serviceN - 1].Name;
        var incident = Incident.Create(
            SeedIds.D(5, i),
            SeedIds.Acme,
            SeedIds.D(4, serviceN),
            SeedIds.DemoUser,
            $"{serviceName} active incident",
            $"Active incident on {serviceName}.",
            severity,
            t0);

        long sequence = 0;
        long version = 1;
        long lifecycle = 1;

        sequence++;
        history.Add(IncidentTimelineEntry.IncidentCreated(
            SeedIds.D(6, i * 100 + (int)sequence),
            SeedIds.Acme,
            incident.Id,
            SeedIds.DemoUser,
            sequence,
            t0,
            severity));

        var joinAt = t0.AddMinutes(1);
        responders.Add(IncidentResponder.Create(SeedIds.Acme, incident.Id, SeedIds.DemoUser, joinAt));
        sequence++;
        history.Add(IncidentTimelineEntry.ResponderJoined(
            SeedIds.D(6, i * 100 + (int)sequence),
            SeedIds.Acme,
            incident.Id,
            SeedIds.DemoUser,
            sequence,
            joinAt));

        if (targetStatus is IncidentStatus.Identified or IncidentStatus.Monitoring)
        {
            var identifiedAt = t0.AddMinutes(10);
            incident.ChangeActiveStatus(IncidentStatus.Identified, identifiedAt);
            sequence++;
            version++;
            history.Add(IncidentTimelineEntry.StatusChanged(
                SeedIds.D(6, i * 100 + (int)sequence),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                sequence,
                identifiedAt,
                IncidentStatus.Investigating,
                IncidentStatus.Identified));
        }

        if (targetStatus == IncidentStatus.Monitoring)
        {
            var monitoringAt = t0.AddMinutes(20);
            incident.ChangeActiveStatus(IncidentStatus.Monitoring, monitoringAt);
            sequence++;
            version++;
            history.Add(IncidentTimelineEntry.StatusChanged(
                SeedIds.D(6, i * 100 + (int)sequence),
                SeedIds.Acme,
                incident.Id,
                SeedIds.DemoUser,
                sequence,
                monitoringAt,
                IncidentStatus.Identified,
                IncidentStatus.Monitoring));
        }

        incident.SetPersistenceCounters(version, lifecycle, sequence);
        incidents.Add(incident);
    }
}

public sealed record DemoSeedModel(
    Organization Organization,
    IReadOnlyList<Team> Teams,
    IReadOnlyList<User> Users,
    IReadOnlyList<Service> Services,
    IReadOnlyList<Incident> Incidents,
    IReadOnlyList<IncidentResponder> Responders,
    IReadOnlyList<IncidentTimelineEntry> History,
    IReadOnlyList<Postmortem> Postmortems);
