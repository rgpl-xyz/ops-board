using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class IncidentConfiguration : IEntityTypeConfiguration<Incident>
{
    public void Configure(EntityTypeBuilder<Incident> builder)
    {
        builder.ToTable("incidents", t =>
        {
            t.HasCheckConstraint("ck_incidents_title_nonblank", "char_length(btrim(title)) > 0");
            t.HasCheckConstraint("ck_incidents_description_nonblank", "char_length(btrim(description)) > 0");
            t.HasCheckConstraint("ck_incidents_version_positive", "version >= 1");
            t.HasCheckConstraint("ck_incidents_lifecycle_version_positive", "lifecycle_version >= 1");
            t.HasCheckConstraint("ck_incidents_last_history_sequence_nonnegative", "last_history_sequence >= 0");
            t.HasCheckConstraint("ck_incidents_updated_after_created", "updated_at >= created_at");
            t.HasCheckConstraint(
                "ck_incidents_status",
                "status IN ('Investigating','Identified','Monitoring','Resolved')");
            t.HasCheckConstraint(
                "ck_incidents_severity",
                "severity IN ('Critical','High','Medium','Low')");
            t.HasCheckConstraint(
                "ck_incidents_resolved_at_matches_status",
                """
                (status = 'Resolved' AND resolved_at IS NOT NULL AND resolved_at >= created_at AND resolved_at <= updated_at)
                OR (status <> 'Resolved' AND resolved_at IS NULL)
                """);
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.ServiceId).HasColumnName("service_id").IsRequired();
        builder.Property(x => x.CreatedByUserId).HasColumnName("created_by_user_id").IsRequired();
        builder.Property(x => x.Title).HasColumnName("title").HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasColumnName("description").HasMaxLength(10000).IsRequired();
        builder.Property(x => x.Severity)
            .HasColumnName("severity")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<IncidentSeverity>())
            .IsRequired();
        builder.Property(x => x.Status)
            .HasColumnName("status")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<IncidentStatus>())
            .IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        builder.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
        builder.Property(x => x.Version).HasColumnName("version").IsConcurrencyToken().IsRequired();
        builder.Property(x => x.LifecycleVersion).HasColumnName("lifecycle_version").IsRequired();
        builder.Property(x => x.LastHistorySequence).HasColumnName("last_history_sequence").IsRequired();
        MappingStyles.ConfigureTenantAlternateKey(builder);

        builder.HasOne<Organization>()
            .WithMany()
            .HasForeignKey(x => x.OrganizationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Service>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.ServiceId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.CreatedByUserId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.OrganizationId, x.CreatedAt, x.Id })
            .HasDatabaseName("ix_incidents_organization_created_at_id");
        builder.HasIndex(x => new { x.OrganizationId, x.Status, x.CreatedAt, x.Id })
            .HasDatabaseName("ix_incidents_organization_status_created_at_id");
        builder.HasIndex(x => new { x.OrganizationId, x.Severity, x.CreatedAt, x.Id })
            .HasDatabaseName("ix_incidents_organization_severity_created_at_id");
        builder.HasIndex(x => new { x.OrganizationId, x.ServiceId, x.CreatedAt, x.Id })
            .HasDatabaseName("ix_incidents_organization_service_created_at_id");
        builder.HasIndex(x => new { x.OrganizationId, x.CreatedByUserId })
            .HasDatabaseName("ix_incidents_organization_created_by_user");
    }
}
