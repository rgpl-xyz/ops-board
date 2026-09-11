using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class IncidentTimelineEntryConfiguration : IEntityTypeConfiguration<IncidentTimelineEntry>
{
    public void Configure(EntityTypeBuilder<IncidentTimelineEntry> builder)
    {
        builder.ToTable("incident_timeline_entries", t =>
        {
            t.HasCheckConstraint("ck_timeline_sequence_positive", "sequence >= 1");
            t.HasCheckConstraint(
                "ck_timeline_type",
                "type IN ('IncidentCreated','StatusChanged','SeverityChanged','ResponderJoined','ResponderLeft','Resolved','Reopened','WrittenUpdate')");
            t.HasCheckConstraint(
                "ck_timeline_payload",
                """
                (type = 'IncidentCreated' AND body IS NULL AND from_status IS NULL AND to_status = 'Investigating' AND from_severity IS NULL AND to_severity IS NOT NULL)
                OR (type = 'StatusChanged' AND body IS NULL AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status <> to_status AND from_status IN ('Investigating','Identified','Monitoring') AND to_status IN ('Investigating','Identified','Monitoring') AND from_severity IS NULL AND to_severity IS NULL)
                OR (type = 'SeverityChanged' AND body IS NULL AND from_status IS NULL AND to_status IS NULL AND from_severity IS NOT NULL AND to_severity IS NOT NULL AND from_severity <> to_severity)
                OR (type IN ('ResponderJoined','ResponderLeft') AND body IS NULL AND from_status IS NULL AND to_status IS NULL AND from_severity IS NULL AND to_severity IS NULL)
                OR (type = 'Resolved' AND body IS NULL AND from_status IN ('Investigating','Identified','Monitoring') AND to_status = 'Resolved' AND from_severity IS NULL AND to_severity IS NULL)
                OR (type = 'Reopened' AND body IS NULL AND from_status = 'Resolved' AND to_status = 'Investigating' AND from_severity IS NULL AND to_severity IS NULL)
                OR (type = 'WrittenUpdate' AND body IS NOT NULL AND char_length(btrim(body)) > 0 AND from_status IS NULL AND to_status IS NULL AND from_severity IS NULL AND to_severity IS NULL)
                """);
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.IncidentId).HasColumnName("incident_id").IsRequired();
        builder.Property(x => x.ActorUserId).HasColumnName("actor_user_id").IsRequired();
        builder.Property(x => x.Sequence).HasColumnName("sequence").IsRequired();
        builder.Property(x => x.OccurredAt).HasColumnName("occurred_at").IsRequired();
        builder.Property(x => x.Type)
            .HasColumnName("type")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<TimelineEntryType>())
            .IsRequired();
        builder.Property(x => x.Body).HasColumnName("body").HasMaxLength(4000);
        builder.Property(x => x.FromStatus)
            .HasColumnName("from_status")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<IncidentStatus>());
        builder.Property(x => x.ToStatus)
            .HasColumnName("to_status")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<IncidentStatus>());
        builder.Property(x => x.FromSeverity)
            .HasColumnName("from_severity")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<IncidentSeverity>());
        builder.Property(x => x.ToSeverity)
            .HasColumnName("to_severity")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<IncidentSeverity>());

        builder.HasIndex(x => new { x.IncidentId, x.Sequence })
            .IsUnique()
            .HasDatabaseName("ux_timeline_incident_sequence");
        builder.HasIndex(x => new { x.OrganizationId, x.IncidentId, x.OccurredAt, x.Sequence })
            .HasDatabaseName("ix_timeline_organization_incident_occurred_sequence");
        builder.HasIndex(x => new { x.OrganizationId, x.ActorUserId })
            .HasDatabaseName("ix_timeline_organization_actor");

        builder.HasOne<Incident>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.IncidentId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.ActorUserId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }
}
