using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Persistence.Seed;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

/// The demo seed is a deterministic, internally consistent record of what
/// happened. These checks hold for any content the fixture is given; they
/// need no database.
[Trait("Category", "Seed")]
public sealed class DemoSeedFixtureTests
{
    private static readonly DemoSeedModel Model = DemoSeedFixture.Build();

    [Fact]
    public void Builds_the_same_records_every_time()
    {
        var again = DemoSeedFixture.Build();

        Assert.Equal(
            Model.Incidents.Select(i => (i.Id, i.Title, i.Severity, i.Status, i.CreatedAt, i.UpdatedAt, i.Version)),
            again.Incidents.Select(i => (i.Id, i.Title, i.Severity, i.Status, i.CreatedAt, i.UpdatedAt, i.Version)));
        Assert.Equal(
            Model.History.Select(e => (e.Id, e.Type, e.Sequence, e.OccurredAt, e.ActorUserId)),
            again.History.Select(e => (e.Id, e.Type, e.Sequence, e.OccurredAt, e.ActorUserId)));
    }

    [Fact]
    public void Keeps_the_demo_organization_shape()
    {
        Assert.Equal(4, Model.Teams.Count);
        Assert.Equal(12, Model.Services.Count);
        Assert.Equal(10, Model.Users.Count);
        Assert.Equal(24, Model.Incidents.Count(i => i.Status == IncidentStatus.Resolved));
        Assert.Equal(3, Model.Incidents.Count(i => i.Status != IncidentStatus.Resolved));
        Assert.Equal(3, Model.Postmortems.Count);

        // Tests select seeded users by position, so roles stay where they are.
        Assert.Equal(
            [
                UserRole.IncidentManager, UserRole.Administrator, UserRole.Responder, UserRole.Responder,
                UserRole.Viewer, UserRole.Responder, UserRole.Viewer, UserRole.Responder, UserRole.Viewer,
                UserRole.IncidentManager
            ],
            Model.Users.Select(u => u.Role));
    }

    [Fact]
    public void Gives_every_incident_its_own_title_and_a_real_description()
    {
        Assert.Equal(Model.Incidents.Count, Model.Incidents.Select(i => i.Title).Distinct().Count());
        Assert.All(Model.Incidents, i => Assert.True(i.Description.Length >= 80, i.Title));
        Assert.Equal(Model.Services.Count, Model.Services.Select(s => s.Description).Distinct().Count());
        Assert.True(Model.History.Count(e => e.Type == TimelineEntryType.WrittenUpdate) >= Model.Incidents.Count);
    }

    [Fact]
    public void Counts_revisions_from_the_timeline_the_way_the_api_does()
    {
        Assert.Equal(Model.History.Count, Model.History.Select(e => e.Id).Distinct().Count());

        foreach (var incident in Model.Incidents)
        {
            var entries = Model.History.Where(e => e.IncidentId == incident.Id).ToList();
            Assert.Equal(TimelineEntryType.IncidentCreated, entries[0].Type);
            Assert.Equal(Enumerable.Range(1, entries.Count).Select(n => (long)n), entries.Select(e => e.Sequence));
            Assert.Equal(entries.OrderBy(e => e.OccurredAt).Select(e => e.Id), entries.Select(e => e.Id));

            var lifecycleChanges = entries.Count(e => e.Type is TimelineEntryType.Resolved or TimelineEntryType.Reopened);
            var scalarChanges = lifecycleChanges + entries.Count(e =>
                e.Type is TimelineEntryType.StatusChanged or TimelineEntryType.SeverityChanged);
            Assert.Equal(entries.Count, incident.LastHistorySequence);
            Assert.Equal(1 + scalarChanges, incident.Version);
            Assert.Equal(1 + lifecycleChanges, incident.LifecycleVersion);
        }
    }

    [Fact]
    public void Lists_as_responders_exactly_those_who_joined_and_did_not_leave()
    {
        foreach (var incident in Model.Incidents)
        {
            var still = new HashSet<Guid>();
            foreach (var entry in Model.History.Where(e => e.IncidentId == incident.Id))
            {
                if (entry.Type == TimelineEntryType.ResponderJoined)
                {
                    Assert.True(still.Add(entry.ActorUserId), $"{incident.Title}: joined twice");
                }
                else if (entry.Type == TimelineEntryType.ResponderLeft)
                {
                    Assert.True(still.Remove(entry.ActorUserId), $"{incident.Title}: left without joining");
                }
            }

            Assert.Equal(
                still.Order(),
                Model.Responders.Where(r => r.IncidentId == incident.Id).Select(r => r.UserId).Order());
        }
    }

    [Fact]
    public void Has_only_people_who_may_respond_act_on_incidents()
    {
        var viewers = Model.Users.Where(u => u.Role == UserRole.Viewer).Select(u => u.Id).ToHashSet();

        Assert.DoesNotContain(Model.Incidents, i => viewers.Contains(i.CreatedByUserId));
        Assert.DoesNotContain(Model.History, e => viewers.Contains(e.ActorUserId));
    }

    [Fact]
    public void Keeps_open_incidents_in_step_with_service_health_and_the_demo_identity()
    {
        var open = Model.Incidents.Where(i => i.Status != IncidentStatus.Resolved).ToList();
        var health = Model.Services.ToDictionary(s => s.Id, s => s.Health);

        Assert.All(open, i => Assert.NotEqual(ServiceHealth.Operational, health[i.ServiceId]));
        Assert.Equal(
            Model.Services.Where(s => s.Health != ServiceHealth.Operational).Select(s => s.Id).Order(),
            open.Select(i => i.ServiceId).Order());

        // The demo user responds to some open incidents and can join another.
        var demoResponding = open.Count(i =>
            Model.Responders.Any(r => r.IncidentId == i.Id && r.UserId == SeedIds.DemoUser));
        Assert.InRange(demoResponding, 1, open.Count - 1);
    }
}
