using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OpsBoard.Domain.Entities;
using OpsBoard.Domain.Enums;

namespace OpsBoard.Infrastructure.Persistence.Configurations;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users", t =>
        {
            t.HasCheckConstraint("ck_users_display_name_nonblank", "char_length(btrim(display_name)) > 0");
            t.HasCheckConstraint(
                "ck_users_role",
                "role IN ('Viewer','Responder','IncidentManager','Administrator')");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasColumnName("id");
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.TeamId).HasColumnName("team_id").IsRequired();
        builder.Property(x => x.DisplayName).HasColumnName("display_name").HasMaxLength(120).IsRequired();
        builder.Property(x => x.Role)
            .HasColumnName("role")
            .HasMaxLength(32)
            .HasConversion(MappingStyles.EnumToString<UserRole>())
            .IsRequired();
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

        builder.HasIndex(x => new { x.OrganizationId, x.TeamId, x.Id })
            .HasDatabaseName("ix_users_organization_team_id");
    }
}
