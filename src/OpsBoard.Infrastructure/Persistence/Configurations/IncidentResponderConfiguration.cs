using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Domain.Entities;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class IncidentResponderConfiguration : IEntityTypeConfiguration<IncidentResponder>
{
    public void Configure(EntityTypeBuilder<IncidentResponder> builder)
    {
        builder.ToTable("incident_responders");
        builder.HasKey(x => new { x.IncidentId, x.UserId });
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.IncidentId).HasColumnName("incident_id").IsRequired();
        builder.Property(x => x.UserId).HasColumnName("user_id").IsRequired();
        builder.Property(x => x.JoinedAt).HasColumnName("joined_at").IsRequired();

        builder.HasOne<Incident>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.IncidentId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<User>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.UserId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.OrganizationId, x.IncidentId, x.UserId })
            .HasDatabaseName("ix_incident_responders_organization_incident_user");
        builder.HasIndex(x => new { x.OrganizationId, x.UserId })
            .HasDatabaseName("ix_incident_responders_organization_user");
    }
}
