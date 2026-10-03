using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Infrastructure.Persistence.Seed;

public static class DemoSeedFixture
{
    private static readonly string[] TeamNames = ["Platform", "Payments", "Identity", "Messaging"];

    private static readonly (string Name, int TeamN, ServiceHealth Health, string Description)[] Services =
    [
        ("API Gateway", 1, ServiceHealth.Operational, "Public entry point for the Acme Cloud API: routing, TLS termination and rate limiting."),
        ("Compute Scheduler", 1, ServiceHealth.Operational, "Schedules and runs customer batch jobs and recurring tasks across the compute fleet."),
        ("Object Storage", 1, ServiceHealth.Operational, "S3-compatible object storage, replicated across three availability zones."),
        ("Checkout API", 2, ServiceHealth.Operational, "Carts, pricing, promotions and order creation for the Acme Cloud store."),
        ("Payment Processor", 2, ServiceHealth.Outage, "Card authorization, capture and refunds through our payment acquirers."),
        ("Billing Worker", 2, ServiceHealth.Operational, "Generates invoices, usage records and renewal charges."),
        ("Auth API", 3, ServiceHealth.Degraded, "Sign-in, single sign-on and token issuance for every Acme Cloud product."),
        ("Session Store", 3, ServiceHealth.Operational, "In-memory session cache behind signed-in users across the web apps."),
        ("Directory Sync", 3, ServiceHealth.Operational, "Provisions users and groups from customer identity directories."),
        ("Email Delivery", 4, ServiceHealth.Degraded, "Sends transactional and notification email through our mail providers."),
        ("SMS Delivery", 4, ServiceHealth.Operational, "Sends verification codes and alerts by SMS through two carriers."),
        ("Event Broker", 4, ServiceHealth.Operational, "Message broker carrying order, billing and notification events between services.")
    ];

    // Order and roles are fixed: tests select seeded users by position.
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

    // Seeded users who take part in incidents, by their position in Users.
    private const int Veyo = 1;
    private const int Jordan = 2;
    private const int Morgan = 3;
    private const int Casey = 4;
    private const int Riley = 6;
    private const int Taylor = 8;
    private const int Quinn = 10;

    private const IncidentSeverity Critical = IncidentSeverity.Critical;
    private const IncidentSeverity High = IncidentSeverity.High;
    private const IncidentSeverity Medium = IncidentSeverity.Medium;
    private const IncidentSeverity Low = IncidentSeverity.Low;

    private enum Act
    {
        Join,
        Leave,
        Note,
        Status,
        Severity,
        Resolve,
        Reopen
    }

    /// One thing that happened to an incident, Minute minutes after it was raised.
    private sealed record Step(
        int Minute,
        Act Act,
        int User,
        string? Note = null,
        IncidentStatus Status = default,
        IncidentSeverity Severity = default);

    private sealed record Writeup(
        string Summary,
        string Impact,
        string RootCause,
        string Resolution,
        string[] ActionItems);

    /// An incident as it unfolded. StartMinute is relative to 08:00 UTC on its day.
    private sealed record Story(
        int ServiceN,
        IncidentSeverity Severity,
        int CreatedBy,
        int StartMinute,
        string Title,
        string Description,
        Step[] Steps,
        Writeup? Postmortem = null);

    private static Step Join(int minute, int user) => new(minute, Act.Join, user);
    private static Step Leave(int minute, int user) => new(minute, Act.Leave, user);
    private static Step Note(int minute, int user, string text) => new(minute, Act.Note, user, text);
    private static Step Identified(int minute, int user) => new(minute, Act.Status, user, Status: IncidentStatus.Identified);
    private static Step Monitoring(int minute, int user) => new(minute, Act.Status, user, Status: IncidentStatus.Monitoring);
    private static Step SeverityTo(int minute, int user, IncidentSeverity severity) => new(minute, Act.Severity, user, Severity: severity);
    private static Step Resolve(int minute, int user) => new(minute, Act.Resolve, user);
    private static Step Reopen(int minute, int user) => new(minute, Act.Reopen, user);

    /// Resolved incidents, one a day from SeedIds.Epoch.
    private static readonly Story[] History =
    [
        new(1, High, Morgan, 170,
            "Elevated 502s from API Gateway after TLS certificate rotation",
            "About 4% of requests through the public gateway returned 502 after the scheduled certificate rotation. Two of the six edge nodes kept serving the expired intermediate certificate.",
            [
                Join(1, Morgan),
                Note(6, Morgan, "Errors are isolated to edge-03 and edge-05; both still present the old certificate chain."),
                Identified(9, Morgan),
                Join(12, Jordan),
                Note(18, Jordan, "Reloaded TLS on the two nodes. 502 rate is back under 0.1%."),
                Monitoring(19, Morgan),
                Resolve(45, Morgan)
            ]),
        new(2, Medium, Jordan, -350,
            "Batch jobs stuck in pending after a scheduler leader election",
            "Nightly batch jobs were queued but never started for about 40 minutes. The new scheduler leader had not picked up the job lease table after the election.",
            [
                Join(1, Jordan),
                Note(5, Jordan, "Leadership moved at 02:14 UTC. The lease watcher never started on the new leader."),
                Identified(8, Jordan),
                Note(15, Jordan, "Restarted the watcher; a backlog of 312 jobs is draining."),
                Monitoring(16, Jordan),
                Resolve(48, Jordan)
            ]),
        new(3, Critical, Morgan, 95,
            "Object Storage writes failing in one availability zone",
            "PUT requests to buckets homed in zone b failed with 503 for 22 minutes after a storage node lost its metadata volume. Reads kept working from the replicas.",
            [
                Join(1, Morgan),
                Join(3, Veyo),
                Note(7, Morgan, "All failing writes land on store-b-07, whose metadata volume has gone read-only."),
                Identified(9, Morgan),
                Note(14, Veyo, "Routing new writes to zones a and c while store-b-07 is replaced."),
                SeverityTo(22, Veyo, High),
                Monitoring(23, Morgan),
                Note(51, Morgan, "Replacement node is in service and replication has caught up."),
                Resolve(55, Veyo)
            ],
            new(
                "A failed metadata volume on one storage node made writes to zone b fail for 22 minutes.",
                "PUT requests to buckets homed in zone b returned 503; about 41,000 writes failed and were retried by clients. Reads were unaffected.",
                "The node's metadata volume went read-only after a disk fault, and the write path kept routing to it because health checks only tested reads.",
                "Writes were routed to zones a and c while the node was replaced; replication caught up within the hour.",
                [
                    "Add a write probe to storage node health checks.",
                    "Alert when a metadata volume becomes read-only."
                ])),
        new(4, Low, Casey, 260,
            "Checkout API showing stale shipping rates",
            "Some carts showed the previous day's shipping prices because the rate cache refresh job had been failing silently. No order was charged incorrectly; totals are recalculated at payment.",
            [
                Join(1, Casey),
                Note(9, Casey, "The rate cache last refreshed 26 hours ago. The refresh job lost its credentials in yesterday's rotation."),
                Identified(10, Casey),
                Monitoring(24, Casey),
                Resolve(70, Casey)
            ]),
        new(5, Critical, Quinn, 30,
            "Card authorizations timing out at the payment provider",
            "About 18% of card authorizations timed out over 35 minutes while the upstream provider throttled our account. Customers saw failed checkouts, and some retried.",
            [
                Join(1, Quinn),
                Join(2, Casey),
                Note(6, Casey, "The provider is returning 429 with Retry-After. We retry immediately, which keeps us over the limit."),
                Identified(8, Quinn),
                Note(14, Quinn, "Backoff enabled. Opened a case with the provider about the throttle."),
                Monitoring(20, Quinn),
                Note(33, Casey, "Authorization success is back to 99.6%."),
                Resolve(40, Quinn)
            ],
            new(
                "Our retries turned a provider throttle into 35 minutes of failed card authorizations.",
                "About 18% of card authorizations timed out; an estimated 2,300 checkouts failed and some customers retried.",
                "The payment client retried throttled requests immediately, ignoring Retry-After, which kept the account over the provider's rate limit.",
                "Exponential backoff that honors Retry-After was enabled, and the provider raised the account's limit.",
                [
                    "Honor Retry-After in every provider client.",
                    "Alert on provider 429 rates before they reach customers."
                ])),
        new(6, Medium, Casey, 120,
            "Invoices delayed for annual plan renewals",
            "Billing Worker fell behind generating invoices for annual renewals, and customers received them up to six hours late.",
            [
                Join(1, Casey),
                Note(7, Casey, "Queue depth is 9.4k and climbing. Worker pods are at their memory limit."),
                Identified(10, Casey),
                Monitoring(25, Casey),
                Resolve(50, Casey),
                Reopen(130, Casey),
                Note(134, Casey, "The backlog grew again with the morning renewal batch. Raising worker memory and concurrency."),
                Identified(140, Casey),
                Resolve(200, Casey)
            ]),
        new(7, High, Riley, 45,
            "SSO sign-ins failing for customers of one identity provider",
            "Customers signing in through one external SAML provider were rejected after the provider rotated its signing certificate. Password and other SSO sign-ins were unaffected.",
            [
                Join(1, Riley),
                Note(6, Riley, "Assertion signature validation is failing. The provider published a new certificate yesterday."),
                Identified(9, Riley),
                Note(17, Riley, "Loaded the new certificate from the provider's metadata; sign-ins are succeeding."),
                Monitoring(18, Riley),
                Resolve(42, Riley)
            ]),
        new(8, Medium, Riley, 300,
            "Users signed out after a Session Store failover",
            "A planned failover of the session cache dropped about a third of active sessions, so those users had to sign in again.",
            [
                Join(1, Riley),
                Note(8, Riley, "The replica was promoted before replication caught up; sessions written in the last 90 seconds were lost."),
                Identified(10, Riley),
                Monitoring(14, Riley),
                Resolve(35, Riley)
            ]),
        new(9, Low, Riley, 200,
            "Directory Sync skipping users with apostrophes in their names",
            "Accounts whose display names contain an apostrophe were not provisioned from customer directories, so those users could not sign in.",
            [
                Join(1, Riley),
                Note(12, Riley, "The sync job rejects the escaped name and moves on without logging an error."),
                Identified(14, Riley),
                Monitoring(60, Riley),
                Resolve(120, Riley)
            ]),
        new(10, Medium, Taylor, 75,
            "Password reset emails landing in spam at one mail provider",
            "Recipients at one large mail provider found password reset emails in their spam folder after our sending domain's reputation dropped.",
            [
                Join(1, Taylor),
                Note(11, Taylor, "DMARC reports show a spike of failures from a misconfigured marketing sender on the same domain."),
                Identified(13, Taylor),
                Note(40, Taylor, "Moved marketing mail to its own subdomain; deliverability is recovering."),
                Monitoring(41, Taylor),
                Resolve(150, Taylor)
            ]),
        new(11, High, Taylor, 5,
            "Verification codes delayed by up to 10 minutes",
            "SMS verification codes reached some phones minutes late, so sign-in attempts timed out. The delays were concentrated on one carrier.",
            [
                Join(1, Taylor),
                Join(4, Riley),
                Note(9, Taylor, "The carrier gateway acknowledges messages but delivers them late. The second provider is unaffected."),
                Identified(11, Taylor),
                Note(16, Taylor, "Shifted that carrier's traffic to the secondary provider."),
                Monitoring(17, Taylor),
                Leave(30, Riley),
                Resolve(55, Taylor)
            ]),
        new(12, Medium, Taylor, 150,
            "Event Broker consumers lagging on the notifications topic",
            "Notification consumers fell 20 minutes behind after a partition rebalance stalled, delaying in-app notifications.",
            [
                Join(1, Taylor),
                Note(6, Taylor, "One consumer group is stuck mid-rebalance on partition 14."),
                Identified(8, Taylor),
                Monitoring(15, Taylor),
                Resolve(40, Taylor),
                Reopen(120, Taylor),
                Note(122, Taylor, "Lag returned when the next rebalance stalled on the same partition."),
                Identified(125, Taylor),
                Resolve(170, Taylor)
            ]),
        new(1, Low, Morgan, 330,
            "Rate limit headers missing from API responses",
            "API responses stopped including rate limit headers after a gateway configuration change. Limits were still enforced; only the headers were missing.",
            [
                Join(1, Morgan),
                Identified(6, Morgan),
                Note(10, Morgan, "The header policy was dropped from the default route in the last config change. Restored it."),
                Monitoring(11, Morgan),
                Resolve(30, Morgan)
            ]),
        new(2, High, Jordan, 60,
            "Scheduled jobs running twice after clock drift on two hosts",
            "Hourly jobs ran twice for three hours because two scheduler hosts drifted apart and both believed they held the lock.",
            [
                Join(1, Jordan),
                Join(5, Morgan),
                Note(12, Morgan, "NTP stopped on two hosts after an image update; their clocks drifted 90 seconds."),
                Identified(14, Jordan),
                SeverityTo(20, Jordan, Medium),
                Monitoring(26, Jordan),
                Resolve(65, Jordan)
            ]),
        new(3, Medium, Morgan, 180,
            "Slow uploads of large files from one region",
            "Multipart uploads above 1 GB from one region ran at a fraction of normal speed because a transit link was congested.",
            [
                Join(1, Morgan),
                Note(15, Morgan, "Throughput drops only on the transit route; direct peering is healthy."),
                Identified(18, Morgan),
                Monitoring(50, Morgan),
                Resolve(110, Morgan)
            ]),
        new(4, High, Quinn, 210,
            "Promo codes rejected at checkout",
            "Valid promotion codes were rejected for 50 minutes after a release changed how expiry dates are compared across time zones.",
            [
                Join(1, Casey),
                Join(2, Quinn),
                Note(9, Casey, "Codes that expire today are rejected for customers west of UTC."),
                Identified(11, Casey),
                Note(19, Casey, "Rolled back the date comparison change."),
                Monitoring(20, Quinn),
                Resolve(52, Quinn)
            ]),
        new(5, Medium, Casey, 420,
            "Refunds stuck in pending overnight",
            "Refunds requested in the afternoon stayed pending overnight because the settlement batch failed on a malformed record.",
            [
                Join(1, Casey),
                Note(10, Casey, "The settlement batch stops at a record with an empty currency field."),
                Identified(12, Casey),
                Monitoring(45, Casey),
                Resolve(90, Casey)
            ]),
        new(6, Low, Casey, 240,
            "Duplicate usage lines on a few monthly invoices",
            "Seven customers saw the same usage line twice on their monthly invoice after a worker retried a batch it had already written.",
            [
                Join(1, Casey),
                Identified(8, Casey),
                Monitoring(30, Casey),
                Resolve(60, Casey),
                Reopen(240, Casey),
                Note(245, Casey, "Reconciliation found two more affected invoices. Correcting them before closing."),
                Resolve(300, Casey)
            ]),
        new(7, Critical, Riley, 20,
            "Token refresh failing in the mobile apps",
            "The mobile apps could not refresh access tokens for 25 minutes after a key rotation retired the previous signing key too early, signing users out.",
            [
                Join(1, Riley),
                Join(3, Veyo),
                Note(7, Riley, "The previous signing key was removed from the published key set before its tokens expired."),
                Identified(9, Riley),
                Note(16, Veyo, "Restored the previous key to the key set; refreshes are succeeding."),
                Monitoring(17, Riley),
                Resolve(45, Veyo)
            ],
            new(
                "A signing key was retired too early, signing mobile users out for 25 minutes.",
                "Mobile apps could not refresh tokens; affected users were signed out and had to sign in again.",
                "Key rotation removed the previous key from the published key set while tokens it had signed were still valid.",
                "The previous key was restored to the key set, and refreshes recovered immediately.",
                [
                    "Keep retired keys published until their longest-lived tokens expire.",
                    "Add a rotation dry run that checks outstanding token lifetimes."
                ])),
        new(8, Low, Riley, 600,
            "Session Store memory alerts during the evening peak",
            "Memory use on the session cache passed 85% during the evening peak. No users were affected; capacity was added before eviction started.",
            [
                Join(1, Riley),
                Identified(5, Riley),
                Note(25, Riley, "Added two cache nodes; memory use is back to 60%."),
                Monitoring(26, Riley),
                Resolve(60, Riley)
            ]),
        new(9, Medium, Riley, 140,
            "Group membership changes taking hours to sync",
            "Changes to group membership in customer directories took up to four hours to apply because the sync job hit the directory API's page limit.",
            [
                Join(1, Riley),
                Note(14, Riley, "The sync stops after 50 pages and picks up again on the next run."),
                Identified(16, Riley),
                Monitoring(70, Riley),
                Resolve(160, Riley)
            ]),
        new(10, High, Taylor, 220,
            "Transactional email backlog during a provider outage",
            "Order confirmation and receipt emails queued for 70 minutes during an outage at our email provider, then went out in a burst.",
            [
                Join(1, Taylor),
                Join(4, Veyo),
                Note(8, Taylor, "The provider's status page confirms an outage. Messages are queued and none are lost."),
                Identified(10, Taylor),
                Monitoring(72, Veyo),
                Note(95, Taylor, "The queue has drained and every delayed email is delivered."),
                Resolve(100, Veyo)
            ]),
        new(11, Low, Taylor, 360,
            "SMS sender shown as a number in one country",
            "Customers in one country saw a short code instead of the Acme Cloud sender name because of a new carrier registration rule.",
            [
                Join(1, Taylor),
                Identified(20, Taylor),
                Monitoring(240, Taylor),
                Resolve(600, Taylor)
            ]),
        new(12, High, Taylor, 110,
            "Event Broker partitions without a leader after a host failure",
            "One broker host failed and its partitions took 12 minutes to elect new leaders, pausing order and billing events.",
            [
                Join(1, Taylor),
                Join(3, Jordan),
                Note(8, Jordan, "broker-04 failed its health checks; leader election is slow because of its partition count."),
                Identified(9, Taylor),
                Monitoring(14, Taylor),
                Resolve(48, Taylor)
            ])
    ];

    /// Open incidents on SeedIds.ActiveEpoch, kept in step with their services' health.
    private static readonly Story[] Active =
    [
        new(5, Critical, Quinn, 0,
            "Card payments failing in the EU",
            "Since 08:00 UTC about 30% of card payments in the EU are declined with a gateway error. Other regions and payment methods are unaffected, but EU checkout success is down 22%.",
            [
                Join(1, Quinn),
                Join(2, Casey),
                Join(4, Veyo),
                Note(6, Casey, "Every decline is gateway error 91 from the EU acquirer. Nothing has shipped on our side since yesterday."),
                Note(12, Quinn, "Opened a priority case with the acquirer. Preparing to route EU traffic to the backup acquirer.")
            ]),
        new(7, High, Riley, 60,
            "Sign-in latency above 5 seconds for 15% of users",
            "Since 09:00 UTC sign-ins are slow for about 15% of users. Requests that read from the replica in zone c wait on a lock in the session lookup.",
            [
                Join(1, Riley),
                Join(5, Morgan),
                Note(8, Riley, "p95 sign-in latency is 5.8 s against a normal 400 ms. Every slow request reads from replica db-auth-c."),
                Identified(14, Riley),
                Note(20, Morgan, "Replica c is replaying a long migration from the primary. Draining it from the pool.")
            ]),
        new(10, Medium, Taylor, 120,
            "Notification emails delayed by up to 30 minutes",
            "Incident and billing notifications were delayed by up to 30 minutes because a send worker leaked connections. A fix is out and the queue is draining.",
            [
                Join(1, Taylor),
                Join(3, Veyo),
                Note(7, Taylor, "Send workers exhaust their connection pool after about two hours of uptime."),
                Identified(10, Taylor),
                Note(16, Taylor, "Shipped the connection fix and restarted the workers; the queue is down from 14k to 2k."),
                Monitoring(20, Veyo)
            ])
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
                    s.Description,
                    created);
                if (s.Health != ServiceHealth.Operational)
                {
                    service.Update(service.Name, service.Description, service.TeamId, s.Health, created);
                    service.SetVersion(1);
                }

                return service;
            })
            .ToList();

        var model = new SeedLists();
        for (var i = 0; i < History.Length; i++)
        {
            BuildIncident(i + 1, History[i], SeedIds.Epoch.AddDays(i), model);
        }

        for (var i = 0; i < Active.Length; i++)
        {
            BuildIncident(History.Length + i + 1, Active[i], SeedIds.ActiveEpoch, model);
        }

        return new DemoSeedModel(
            org,
            teams,
            users,
            services,
            model.Incidents,
            model.Responders,
            model.History,
            model.Postmortems);
    }

    private sealed class SeedLists
    {
        public List<Incident> Incidents { get; } = [];
        public List<IncidentResponder> Responders { get; } = [];
        public List<IncidentTimelineEntry> History { get; } = [];
        public List<Postmortem> Postmortems { get; } = [];
    }

    /// Replays a story through the domain, counting revisions the way the API
    /// does: status and severity changes advance the version, resolve and
    /// reopen also advance the lifecycle version, and every step is one
    /// timeline entry.
    private static void BuildIncident(int n, Story story, DateTimeOffset day, SeedLists model)
    {
        var t0 = day.AddMinutes(story.StartMinute);
        var incident = Incident.Create(
            SeedIds.D(5, n),
            SeedIds.Acme,
            SeedIds.D(4, story.ServiceN),
            SeedIds.D(3, story.CreatedBy),
            story.Title,
            story.Description,
            story.Severity,
            t0);

        long sequence = 1;
        long version = 1;
        long lifecycle = 1;
        Guid EntryId() => SeedIds.D(6, n * 100 + (int)sequence);

        model.History.Add(IncidentTimelineEntry.IncidentCreated(
            EntryId(), SeedIds.Acme, incident.Id, SeedIds.D(3, story.CreatedBy), sequence, t0, story.Severity));

        var responding = new List<(int User, DateTimeOffset JoinedAt)>();
        foreach (var step in story.Steps)
        {
            var at = t0.AddMinutes(step.Minute);
            var actor = SeedIds.D(3, step.User);
            sequence++;
            IncidentTimelineEntry entry;
            switch (step.Act)
            {
                case Act.Join:
                    responding.Add((step.User, at));
                    entry = IncidentTimelineEntry.ResponderJoined(EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at);
                    break;
                case Act.Leave:
                    responding.RemoveAll(r => r.User == step.User);
                    entry = IncidentTimelineEntry.ResponderLeft(EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at);
                    break;
                case Act.Note:
                    entry = IncidentTimelineEntry.WrittenUpdate(EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at, step.Note!);
                    break;
                case Act.Status:
                    var fromStatus = incident.Status;
                    incident.ChangeActiveStatus(step.Status, at);
                    version++;
                    entry = IncidentTimelineEntry.StatusChanged(
                        EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at, fromStatus, step.Status);
                    break;
                case Act.Severity:
                    var fromSeverity = incident.Severity;
                    incident.ChangeSeverity(step.Severity, at);
                    version++;
                    entry = IncidentTimelineEntry.SeverityChanged(
                        EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at, fromSeverity, step.Severity);
                    break;
                case Act.Resolve:
                    var beforeResolve = incident.Status;
                    incident.Resolve(at);
                    version++;
                    lifecycle++;
                    entry = IncidentTimelineEntry.Resolved(EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at, beforeResolve);
                    break;
                case Act.Reopen:
                    incident.Reopen(at);
                    version++;
                    lifecycle++;
                    entry = IncidentTimelineEntry.Reopened(EntryId(), SeedIds.Acme, incident.Id, actor, sequence, at);
                    break;
                default:
                    throw new InvalidOperationException($"Unknown seed step {step.Act}.");
            }

            model.History.Add(entry);
        }

        model.Responders.AddRange(responding.Select(r =>
            IncidentResponder.Create(SeedIds.Acme, incident.Id, SeedIds.D(3, r.User), r.JoinedAt)));

        // Domain methods do not advance Version; the seed applies the counted values.
        incident.SetPersistenceCounters(version, lifecycle, sequence);
        model.Incidents.Add(incident);

        if (story.Postmortem is { } writeup)
        {
            model.Postmortems.Add(Postmortem.Create(
                SeedIds.D(7, model.Postmortems.Count + 1),
                SeedIds.Acme,
                incident.Id,
                writeup.Summary,
                writeup.Impact,
                writeup.RootCause,
                writeup.Resolution,
                writeup.ActionItems));
        }
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
