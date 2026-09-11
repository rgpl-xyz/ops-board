using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class ServiceConfiguration : IEntityTypeConfiguration<Service>
{
    public void Configure(EntityTypeBuilder<Service> builder)
    {
        builder.ToTable("services", t =>
        {
            t.HasCheckConstraint("ck_services_name_nonblank", "char_length(btrim(name)) > 0");
            t.HasCheckConstraint("ck_services_description_nonblank", "char_length(btrim(description)) > 0");
            t.HasCheckConstraint("ck_services_version_positive", "version >= 1");
            t.HasCheckConstraint("ck_services_updated_after_created", "updated_at >= created_at");
            t.HasCheckConstraint(
                "ck_services_health",
                "health IN ('Operational','Degraded','Outage')");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.TeamId).HasColumnName("team_id").IsRequired();
        builder.Property(x => x.Name).HasColumnName("name").HasMaxLength(120).IsRequired();
        builder.Property(x => x.Description).HasColumnName("description").HasMaxLength(2000).IsRequired();
        builder.Property(x => x.Health)
            .HasColumnName("health")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<ServiceHealth>())
            .IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        builder.Property(x => x.Version).HasColumnName("version").IsConcurrencyToken().IsRequired();
        MappingStyles.ConfigureTenantAlternateKey(builder);

        builder.HasOne<Organization>()
            .WithMany()
            .HasForeignKey(x => x.OrganizationId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Team>()
            .WithMany()
            .HasForeignKey(x => new { x.OrganizationId, x.TeamId })
            .HasPrincipalKey(x => new { x.OrganizationId, x.Id })
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => new { x.OrganizationId, x.Name, x.Id })
            .HasDatabaseName("ix_services_organization_name_id");
        builder.HasIndex(x => new { x.OrganizationId, x.TeamId, x.Id })
            .HasDatabaseName("ix_services_organization_team_id");
        builder.HasIndex(x => new { x.OrganizationId, x.Health, x.Id })
            .HasDatabaseName("ix_services_organization_health_id");
    }
}
