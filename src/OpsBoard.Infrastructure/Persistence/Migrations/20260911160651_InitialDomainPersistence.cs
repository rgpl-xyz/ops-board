using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpsBoard.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialDomainPersistence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "demo_seed_runs",
                columns: table => new
                {
                    seed_key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    fixture_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_demo_seed_runs", x => x.seed_key);
                });

            migrationBuilder.CreateTable(
                name: "organizations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_organizations", x => x.id);
                    table.CheckConstraint("ck_organizations_name_nonblank", "char_length(btrim(name)) > 0");
                });

            migrationBuilder.CreateTable(
                name: "teams",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_teams", x => x.id);
                    table.UniqueConstraint("AK_teams_organization_id_id", x => new { x.organization_id, x.id });
                    table.CheckConstraint("ck_teams_name_nonblank", "char_length(btrim(name)) > 0");
                    table.ForeignKey(
                        name: "FK_teams_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "services",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    health = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_services", x => x.id);
                    table.UniqueConstraint("AK_services_organization_id_id", x => new { x.organization_id, x.id });
                    table.CheckConstraint("ck_services_description_nonblank", "char_length(btrim(description)) > 0");
                    table.CheckConstraint("ck_services_health", "health IN ('Operational','Degraded','Outage')");
                    table.CheckConstraint("ck_services_name_nonblank", "char_length(btrim(name)) > 0");
                    table.CheckConstraint("ck_services_updated_after_created", "updated_at >= created_at");
                    table.CheckConstraint("ck_services_version_positive", "version >= 1");
                    table.ForeignKey(
                        name: "FK_services_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_services_teams_organization_id_team_id",
                        columns: x => new { x.organization_id, x.team_id },
                        principalTable: "teams",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                    table.UniqueConstraint("AK_users_organization_id_id", x => new { x.organization_id, x.id });
                    table.CheckConstraint("ck_users_display_name_nonblank", "char_length(btrim(display_name)) > 0");
                    table.CheckConstraint("ck_users_role", "role IN ('Viewer','Responder','IncidentManager','Administrator')");
                    table.ForeignKey(
                        name: "FK_users_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_users_teams_organization_id_team_id",
                        columns: x => new { x.organization_id, x.team_id },
                        principalTable: "teams",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "incidents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    service_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    resolved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    lifecycle_version = table.Column<long>(type: "bigint", nullable: false),
                    last_history_sequence = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_incidents", x => x.id);
                    table.UniqueConstraint("AK_incidents_organization_id_id", x => new { x.organization_id, x.id });
                    table.CheckConstraint("ck_incidents_description_nonblank", "char_length(btrim(description)) > 0");
                    table.CheckConstraint("ck_incidents_last_history_sequence_nonnegative", "last_history_sequence >= 0");
                    table.CheckConstraint("ck_incidents_lifecycle_version_positive", "lifecycle_version >= 1");
                    table.CheckConstraint("ck_incidents_resolved_at_matches_status", "(status = 'Resolved' AND resolved_at IS NOT NULL AND resolved_at >= created_at AND resolved_at <= updated_at)\nOR (status <> 'Resolved' AND resolved_at IS NULL)");
                    table.CheckConstraint("ck_incidents_severity", "severity IN ('Critical','High','Medium','Low')");
                    table.CheckConstraint("ck_incidents_status", "status IN ('Investigating','Identified','Monitoring','Resolved')");
                    table.CheckConstraint("ck_incidents_title_nonblank", "char_length(btrim(title)) > 0");
                    table.CheckConstraint("ck_incidents_updated_after_created", "updated_at >= created_at");
                    table.CheckConstraint("ck_incidents_version_positive", "version >= 1");
                    table.ForeignKey(
                        name: "FK_incidents_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_incidents_services_organization_id_service_id",
                        columns: x => new { x.organization_id, x.service_id },
                        principalTable: "services",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_incidents_users_organization_id_created_by_user_id",
                        columns: x => new { x.organization_id, x.created_by_user_id },
                        principalTable: "users",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "incident_responders",
                columns: table => new
                {
                    incident_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    joined_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_incident_responders", x => new { x.incident_id, x.user_id });
                    table.ForeignKey(
                        name: "FK_incident_responders_incidents_organization_id_incident_id",
                        columns: x => new { x.organization_id, x.incident_id },
                        principalTable: "incidents",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_incident_responders_users_organization_id_user_id",
                        columns: x => new { x.organization_id, x.user_id },
                        principalTable: "users",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "incident_timeline_entries",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    incident_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence = table.Column<long>(type: "bigint", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    from_status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    to_status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    from_severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    to_severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_incident_timeline_entries", x => x.id);
                    table.CheckConstraint("ck_timeline_payload", "(type = 'IncidentCreated' AND body IS NULL AND from_status IS NULL AND to_status = 'Investigating' AND from_severity IS NULL AND to_severity IS NOT NULL)\nOR (type = 'StatusChanged' AND body IS NULL AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status <> to_status AND from_status IN ('Investigating','Identified','Monitoring') AND to_status IN ('Investigating','Identified','Monitoring') AND from_severity IS NULL AND to_severity IS NULL)\nOR (type = 'SeverityChanged' AND body IS NULL AND from_status IS NULL AND to_status IS NULL AND from_severity IS NOT NULL AND to_severity IS NOT NULL AND from_severity <> to_severity)\nOR (type IN ('ResponderJoined','ResponderLeft') AND body IS NULL AND from_status IS NULL AND to_status IS NULL AND from_severity IS NULL AND to_severity IS NULL)\nOR (type = 'Resolved' AND body IS NULL AND from_status IN ('Investigating','Identified','Monitoring') AND to_status = 'Resolved' AND from_severity IS NULL AND to_severity IS NULL)\nOR (type = 'Reopened' AND body IS NULL AND from_status = 'Resolved' AND to_status = 'Investigating' AND from_severity IS NULL AND to_severity IS NULL)\nOR (type = 'WrittenUpdate' AND body IS NOT NULL AND char_length(btrim(body)) > 0 AND from_status IS NULL AND to_status IS NULL AND from_severity IS NULL AND to_severity IS NULL)");
                    table.CheckConstraint("ck_timeline_sequence_positive", "sequence >= 1");
                    table.CheckConstraint("ck_timeline_type", "type IN ('IncidentCreated','StatusChanged','SeverityChanged','ResponderJoined','ResponderLeft','Resolved','Reopened','WrittenUpdate')");
                    table.ForeignKey(
                        name: "FK_incident_timeline_entries_incidents_organization_id_inciden~",
                        columns: x => new { x.organization_id, x.incident_id },
                        principalTable: "incidents",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_incident_timeline_entries_users_organization_id_actor_user_~",
                        columns: x => new { x.organization_id, x.actor_user_id },
                        principalTable: "users",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "postmortems",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    incident_id = table.Column<Guid>(type: "uuid", nullable: false),
                    summary = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    impact = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    root_cause = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    resolution = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    action_items = table.Column<List<string>>(type: "text[]", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_postmortems", x => x.id);
                    table.CheckConstraint("ck_postmortems_action_items_cardinality", "cardinality(action_items) BETWEEN 1 AND 20");
                    table.CheckConstraint("ck_postmortems_impact_nonblank", "char_length(btrim(impact)) > 0");
                    table.CheckConstraint("ck_postmortems_resolution_nonblank", "char_length(btrim(resolution)) > 0");
                    table.CheckConstraint("ck_postmortems_root_cause_nonblank", "char_length(btrim(root_cause)) > 0");
                    table.CheckConstraint("ck_postmortems_summary_nonblank", "char_length(btrim(summary)) > 0");
                    table.ForeignKey(
                        name: "FK_postmortems_incidents_organization_id_incident_id",
                        columns: x => new { x.organization_id, x.incident_id },
                        principalTable: "incidents",
                        principalColumns: new[] { "organization_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_postmortems_organizations_organization_id",
                        column: x => x.organization_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_incident_responders_organization_incident_user",
                table: "incident_responders",
                columns: new[] { "organization_id", "incident_id", "user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_incident_responders_organization_user",
                table: "incident_responders",
                columns: new[] { "organization_id", "user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_timeline_organization_actor",
                table: "incident_timeline_entries",
                columns: new[] { "organization_id", "actor_user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_timeline_organization_incident_occurred_sequence",
                table: "incident_timeline_entries",
                columns: new[] { "organization_id", "incident_id", "occurred_at", "sequence" });

            migrationBuilder.CreateIndex(
                name: "ux_timeline_incident_sequence",
                table: "incident_timeline_entries",
                columns: new[] { "incident_id", "sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_incidents_organization_created_at_id",
                table: "incidents",
                columns: new[] { "organization_id", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_incidents_organization_created_by_user",
                table: "incidents",
                columns: new[] { "organization_id", "created_by_user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_incidents_organization_service_created_at_id",
                table: "incidents",
                columns: new[] { "organization_id", "service_id", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_incidents_organization_severity_created_at_id",
                table: "incidents",
                columns: new[] { "organization_id", "severity", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_incidents_organization_status_created_at_id",
                table: "incidents",
                columns: new[] { "organization_id", "status", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ux_postmortems_organization_incident",
                table: "postmortems",
                columns: new[] { "organization_id", "incident_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_services_organization_health_id",
                table: "services",
                columns: new[] { "organization_id", "health", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_services_organization_name_id",
                table: "services",
                columns: new[] { "organization_id", "name", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_services_organization_team_id",
                table: "services",
                columns: new[] { "organization_id", "team_id", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_users_organization_team_id",
                table: "users",
                columns: new[] { "organization_id", "team_id", "id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "demo_seed_runs");

            migrationBuilder.DropTable(
                name: "incident_responders");

            migrationBuilder.DropTable(
                name: "incident_timeline_entries");

            migrationBuilder.DropTable(
                name: "postmortems");

            migrationBuilder.DropTable(
                name: "incidents");

            migrationBuilder.DropTable(
                name: "services");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "teams");

            migrationBuilder.DropTable(
                name: "organizations");
        }
    }
}
