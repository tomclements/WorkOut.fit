using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WorkoutPlanner.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWeekDayToWorkoutSession : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DayIndex",
                table: "WorkoutSessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Week",
                table: "WorkoutSessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DayIndex",
                table: "WorkoutSessions");

            migrationBuilder.DropColumn(
                name: "Week",
                table: "WorkoutSessions");
        }
    }
}
