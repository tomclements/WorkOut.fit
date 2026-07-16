using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WorkoutPlanner.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAvoidForAndRestrictions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AvoidFor",
                table: "Exercises",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvoidFor",
                table: "Exercises");
        }
    }
}
