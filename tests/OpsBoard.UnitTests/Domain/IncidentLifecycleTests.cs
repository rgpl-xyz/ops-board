using OpsBoard.Domain;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.UnitTests.Domain;

public class IncidentLifecycleTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 1, 8, 0, 0, TimeSpan.Zero);

    public static IEnumerable<object[]> AllPairs()
    {
        foreach (IncidentStatus from in Enum.GetValues<IncidentStatus>())
        {
            foreach (IncidentStatus to in Enum.GetValues<IncidentStatus>())
            {
                yield return [from, to];
            }
        }
    }

    [Theory]
    [MemberData(nameof(AllPairs))]
    public void Transition_matrix(IncidentStatus from, IncidentStatus to)
    {
        var incident = CreateAt(from);
        var allowed = IsAllowed(from, to);

        if (!allowed)
        {
            if (from == IncidentStatus.Resolved)
            {
                if (to == IncidentStatus.Resolved)
                {
                    Assert.ThrowsAny<DomainException>(() => incident.Resolve(T0.AddHours(2)));
                }
                else
                {
                    Assert.ThrowsAny<DomainException>(() => incident.ChangeActiveStatus(to, T0.AddHours(2)));
                }

                Assert.Equal(IncidentStatus.Resolved, incident.Status);
                Assert.NotNull(incident.ResolvedAt);
                return;
            }

            Assert.ThrowsAny<DomainException>(() =>
            {
                if (to == IncidentStatus.Resolved)
                {
                    if (from == to)
                    {
                        incident.Resolve(T0.AddHours(2));
                    }
                    else
                    {
                        incident.ChangeActiveStatus(to, T0.AddHours(2));
                    }
                }
                else if (from == to)
                {
                    incident.ChangeActiveStatus(to, T0.AddHours(2));
                }
                else
                {
                    incident.ChangeActiveStatus(to, T0.AddHours(2));
                }
            });
            Assert.Equal(from, incident.Status);
            return;
        }

        if (to == IncidentStatus.Resolved)
        {
            incident.Resolve(T0.AddHours(2));
            Assert.Equal(IncidentStatus.Resolved, incident.Status);
            Assert.Equal(T0.AddHours(2), incident.ResolvedAt);
        }
        else if (from == IncidentStatus.Resolved)
        {
            incident.Reopen(T0.AddHours(2));
            Assert.Equal(IncidentStatus.Investigating, incident.Status);
            Assert.Null(incident.ResolvedAt);
        }
        else
        {
            incident.ChangeActiveStatus(to, T0.AddHours(2));
            Assert.Equal(to, incident.Status);
            Assert.Null(incident.ResolvedAt);
        }
    }

    [Fact]
    public void ChangeActiveStatus_cannot_resolve()
    {
        var incident = CreateAt(IncidentStatus.Investigating);
        Assert.ThrowsAny<DomainException>(() =>
            incident.ChangeActiveStatus(IncidentStatus.Resolved, T0.AddHours(1)));
    }

    [Fact]
    public void Same_severity_is_noop()
    {
        var incident = CreateAt(IncidentStatus.Investigating);
        Assert.False(incident.ChangeSeverity(IncidentSeverity.High, T0.AddHours(1)));
    }

    [Fact]
    public void Resolved_metadata_edit_allowed()
    {
        var incident = CreateAt(IncidentStatus.Investigating);
        incident.Resolve(T0.AddHours(1));
        incident.UpdateDetails("new title", "new description", incident.ServiceId, T0.AddHours(2));
        Assert.Equal("new title", incident.Title);
        Assert.Equal(IncidentStatus.Resolved, incident.Status);
    }

    [Fact]
    public void EnsureActive_rejects_resolved()
    {
        var incident = CreateAt(IncidentStatus.Investigating);
        incident.Resolve(T0.AddHours(1));
        Assert.ThrowsAny<DomainException>(() => incident.EnsureActive());
    }

    [Fact]
    public void Create_starts_investigating()
    {
        var incident = Incident.Create(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            "t", "d", IncidentSeverity.Low, T0);
        Assert.Equal(IncidentStatus.Investigating, incident.Status);
        Assert.Null(incident.ResolvedAt);
    }

    private static bool IsAllowed(IncidentStatus from, IncidentStatus to) =>
        (from, to) switch
        {
            (IncidentStatus.Investigating, IncidentStatus.Identified) => true,
            (IncidentStatus.Investigating, IncidentStatus.Monitoring) => true,
            (IncidentStatus.Investigating, IncidentStatus.Resolved) => true,
            (IncidentStatus.Identified, IncidentStatus.Investigating) => true,
            (IncidentStatus.Identified, IncidentStatus.Monitoring) => true,
            (IncidentStatus.Identified, IncidentStatus.Resolved) => true,
            (IncidentStatus.Monitoring, IncidentStatus.Investigating) => true,
            (IncidentStatus.Monitoring, IncidentStatus.Identified) => true,
            (IncidentStatus.Monitoring, IncidentStatus.Resolved) => true,
            (IncidentStatus.Resolved, IncidentStatus.Investigating) => true,
            _ => false
        };

    private static Incident CreateAt(IncidentStatus status)
    {
        var incident = Incident.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            "title",
            "description",
            IncidentSeverity.High,
            T0);

        if (status == IncidentStatus.Investigating)
        {
            return incident;
        }

        if (status == IncidentStatus.Identified)
        {
            incident.ChangeActiveStatus(IncidentStatus.Identified, T0.AddMinutes(10));
            return incident;
        }

        if (status == IncidentStatus.Monitoring)
        {
            incident.ChangeActiveStatus(IncidentStatus.Identified, T0.AddMinutes(10));
            incident.ChangeActiveStatus(IncidentStatus.Monitoring, T0.AddMinutes(20));
            return incident;
        }

        incident.Resolve(T0.AddMinutes(40));
        return incident;
    }
}
