using OpsBoard.Application.Incidents;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;
using OpsBoard.Infrastructure.Incidents;
using OpsBoard.IntegrationTests.Fixtures;
using Xunit;

namespace OpsBoard.IntegrationTests.Persistence;

/// Related incidents are picked by fixed rules, so the same records always
/// give the same list, with the reasons each one was picked.
[Collection("Postgres")]
[Trait("Category", "Persistence")]
public sealed class RelatedIncidentQueryTests(PostgresFixture fixture)
{
    private const string PaymentProcessor = "Payment Processor";
    private const string CheckoutApi = "Checkout API";
    private const string AuthApi = "Auth API";

    [Fact]
    public async Task An_incident_on_the_same_service_is_related_with_nothing_else_in_common()
    {
        var seed = await SeedAsync(
            ("Card payments failing in the EU", PaymentProcessor, 0),
            ("Refunds stuck in pending overnight", PaymentProcessor, -3));

        var related = await ListAsync(seed, "Card payments failing in the EU");

        var item = Assert.Single(related);
        Assert.Equal("Refunds stuck in pending overnight", item.Title);
        Assert.Equal(PaymentProcessor, item.ServiceName);
        Assert.Equal("Payments", item.TeamName);
        Assert.True(item.SameService);
        Assert.True(item.SameTeam);
        Assert.Empty(item.SharedWords);
    }

    [Fact]
    public async Task An_incident_of_the_same_team_is_related_when_the_titles_share_a_word()
    {
        var seed = await SeedAsync(
            ("Card payments failing in the EU", PaymentProcessor, 0),
            ("Checkout declining saved cards after a payment retry", CheckoutApi, -2),
            ("Promo codes rejected at checkout", CheckoutApi, -1));

        var related = await ListAsync(seed, "Card payments failing in the EU");

        var item = Assert.Single(related);
        Assert.Equal("Checkout declining saved cards after a payment retry", item.Title);
        Assert.False(item.SameService);
        Assert.True(item.SameTeam);
        Assert.Equal(["Card", "payments"], item.SharedWords);
    }

    [Fact]
    public async Task An_incident_of_another_team_is_related_only_when_the_titles_share_two_words()
    {
        var seed = await SeedAsync(
            ("Card payments failing in the EU", PaymentProcessor, 0),
            ("EU sign-ins failing after a deploy", AuthApi, -2),
            ("Sign-ins failing for one identity provider", AuthApi, -1));

        var related = await ListAsync(seed, "Card payments failing in the EU");

        var item = Assert.Single(related);
        Assert.Equal("EU sign-ins failing after a deploy", item.Title);
        Assert.False(item.SameService);
        Assert.False(item.SameTeam);
        Assert.Equal(["failing", "EU"], item.SharedWords);
    }

    [Fact]
    public async Task The_strongest_matches_come_first_and_ties_go_to_the_closest_in_time()
    {
        var seed = await SeedAsync(
            ("Card payments failing in the EU", PaymentProcessor, 0),
            ("Refunds stuck in pending overnight", PaymentProcessor, -1),
            ("Settlement batch late", PaymentProcessor, -9),
            ("Payout report missing", PaymentProcessor, -20),
            ("Card payments declined at checkout", CheckoutApi, -30),
            ("Card authorizations failing at the payment provider", PaymentProcessor, -60),
            ("Checkout showing card fees twice", CheckoutApi, 5));

        var related = await ListAsync(seed, "Card payments failing in the EU");

        Assert.Equal(
            [
                "Card authorizations failing at the payment provider",
                "Card payments declined at checkout",
                "Refunds stuck in pending overnight",
                "Checkout showing card fees twice",
                "Settlement batch late"
            ],
            related.Select(r => r.Title));
    }

    [Fact]
    public async Task Plain_numbers_and_common_words_are_not_shared_words_but_parts_of_hyphenated_ones_are()
    {
        var seed = await SeedAsync(
            ("Sign-in latency above 5 seconds for 15% of users", AuthApi, 0),
            ("Users signed out after a failover", AuthApi, -1),
            ("Card checks take 5 seconds for 15% of payments", PaymentProcessor, -2));

        var related = await ListAsync(seed, "Sign-in latency above 5 seconds for 15% of users");

        var item = Assert.Single(related);
        Assert.Equal("Users signed out after a failover", item.Title);
        Assert.Equal(["Sign-in", "users"], item.SharedWords);
    }

    [Fact]
    public async Task A_word_counts_once_however_often_the_title_uses_it()
    {
        var seed = await SeedAsync(
            ("Sign-in fails when users signed up", AuthApi, 0),
            ("Card signing service down", PaymentProcessor, -1));

        Assert.Empty(await ListAsync(seed, "Sign-in fails when users signed up"));
    }

    [Fact]
    public async Task Numbers_written_as_words_are_not_shared_words_either()
    {
        var seed = await SeedAsync(
            ("Writes failing in one zone", PaymentProcessor, 0),
            ("Sign-ins failing for one provider", AuthApi, -1));

        Assert.Empty(await ListAsync(seed, "Writes failing in one zone"));
    }

    [Fact]
    public async Task Only_the_organizations_own_incidents_are_listed()
    {
        var seed = await SeedAsync(
            ("Card payments failing in the EU", PaymentProcessor, 0),
            ("Card payments declined at checkout", CheckoutApi, -1));

        var related = await ListAsync(seed, "Card payments failing in the EU");
        await using var db = fixture.CreateContext();
        var fromAnotherOrganization = await new RelatedIncidentData(db).ListAsync(
            Guid.NewGuid(),
            seed.Ids["Card payments failing in the EU"],
            limit: 5,
            CancellationToken.None);

        Assert.Equal([seed.Ids["Card payments declined at checkout"]], related.Select(r => r.Id));
        Assert.Null(fromAnotherOrganization);
    }

    private async Task<IReadOnlyList<RelatedIncidentDto>> ListAsync(Seed seed, string title)
    {
        await using var db = fixture.CreateContext();
        var related = await new RelatedIncidentData(db).ListAsync(
            seed.OrganizationId,
            seed.Ids[title],
            limit: 5,
            CancellationToken.None);
        return Assert.IsAssignableFrom<IReadOnlyList<RelatedIncidentDto>>(related);
    }

    /// One organization with two Payments services and an Identity service,
    /// plus another organization holding a copy of every incident. Days are
    /// relative to the first incident.
    private async Task<Seed> SeedAsync(params (string Title, string Service, int Day)[] incidents)
    {
        var start = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);
        var seed = new Seed(Guid.NewGuid(), new Dictionary<string, Guid>(StringComparer.Ordinal));
        await using var db = fixture.CreateContext();
        foreach (var (organizationId, isOwn) in new[] { (seed.OrganizationId, true), (Guid.NewGuid(), false) })
        {
            var payments = Team.Create(Guid.NewGuid(), organizationId, "Payments");
            var identity = Team.Create(Guid.NewGuid(), organizationId, "Identity");
            var actor = User.Create(Guid.NewGuid(), organizationId, payments.Id, "Related query actor", UserRole.IncidentManager);
            var services = new[]
            {
                Service.Create(Guid.NewGuid(), organizationId, payments.Id, PaymentProcessor, "desc", start),
                Service.Create(Guid.NewGuid(), organizationId, payments.Id, CheckoutApi, "desc", start),
                Service.Create(Guid.NewGuid(), organizationId, identity.Id, AuthApi, "desc", start)
            }.ToDictionary(s => s.Name, StringComparer.Ordinal);
            db.AddRange(Organization.Create(organizationId, isOwn ? "Related query organization" : "Other organization"));
            db.AddRange(payments, identity, actor);
            db.AddRange(services.Values);
            foreach (var (title, service, day) in incidents)
            {
                var incident = Incident.Create(
                    Guid.NewGuid(),
                    organizationId,
                    services[service].Id,
                    actor.Id,
                    title,
                    "desc",
                    IncidentSeverity.High,
                    start.AddDays(day));
                db.Incidents.Add(incident);
                if (isOwn)
                {
                    seed.Ids[title] = incident.Id;
                }
            }
        }

        await db.SaveChangesAsync();
        return seed;
    }

    private sealed record Seed(Guid OrganizationId, Dictionary<string, Guid> Ids);
}
