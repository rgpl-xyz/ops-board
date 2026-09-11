using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Domain.Entities;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class PostmortemConfiguration : IEntityTypeConfiguration<Postmortem>
{
    public void Configure(EntityTypeBuilder<Postmortem> builder)
    {
        builder.ToTable("postmortems", t =>
        {
            t.HasCheckConstraint("ck_postmortems_summary_nonblank", "char_length(btrim(summary)) > 0");
            t.HasCheckConstraint("ck_postmortems_impact_nonblank", "char_length(btrim(impact)) > 0");
            t.HasCheckConstraint("ck_postmortems_root_cause_nonblank", "char_length(btrim(root_cause)) > 0");
            t.HasCheckConstraint("ck_postmortems_resolution_nonblank", "char_length(btrim(resolution)) > 0");
            t.HasCheckConstraint(
                "ck_postmortems_action_items_cardinality",
                "cardinality(action_items) BETWEEN 1 AND 20");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.IncidentId).HasColumnName("incident_id").IsRequired();
        builder.Property(x => x.Summary).HasColumnName("summary").HasMaxLength(10000).IsRequired();
        builder.Property(x => x.Impact).HasColumnName("impact").HasMaxLength(10000).IsRequired();
        builder.Property(x => x.RootCause).HasColumnName("root_cause").HasMaxLength(10000).IsRequired();
        builder.Property(x => x.Resolution).HasColumnName("resolution").HasMaxLength(10000).IsRequired();

        builder.Ignore(x => x.ActionItems);
        builder.Property<List<string>>("_actionItems")
            .HasColumnName("action_items")
            .HasColumnType("text[]")
            .IsRequired()
            .Metadata.SetValueComparer(
                new ValueComparer<List<string>>(
                    (a, b) => a!.SequenceEqual(b!),
                    v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode(StringComparison.Ordinal))),
                    v => v.ToList()));

        builder.HasIndex(x => new { x.OrganizationId, x.IncidentId })
            .IsUnique()
            .HasDatabaseName("ux_postmortems_organization_incident");

        builder.HasOne<Organization>()
            .WithMany()
            .HasForeignKey(x => x.OrganizationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Incident>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.IncidentId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }
}
