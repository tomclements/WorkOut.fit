using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WorkoutPlanner.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPlanFormDefaultsToUserPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefaultDaysPerWeek",
                table: "UserPreferences",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "DefaultGoal",
                table: "UserPreferences",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "DefaultIncludeCooldown",
                table: "UserPreferences",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "DefaultIncludeWarmup",
                table: "UserPreferences",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "DefaultLevel",
                table: "UserPreferences",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DefaultProgression",
                table: "UserPreferences",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "DefaultSessionMinutes",
                table: "UserPreferences",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "DefaultSplit",
                table: "UserPreferences",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "DefaultWeeks",
                table: "UserPreferences",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "DefaultWorkoutDays",
                table: "UserPreferences",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultDaysPerWeek",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultGoal",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultIncludeCooldown",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultIncludeWarmup",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultLevel",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultProgression",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultSessionMinutes",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultSplit",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultWeeks",
                table: "UserPreferences");

            migrationBuilder.DropColumn(
                name: "DefaultWorkoutDays",
                table: "UserPreferences");
        }
    }
}
