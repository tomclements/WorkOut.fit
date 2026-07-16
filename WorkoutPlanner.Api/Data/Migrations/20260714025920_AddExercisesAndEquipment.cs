using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WorkoutPlanner.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExercisesAndEquipment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EquipmentOptions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EquipmentOptions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Exercises",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Equipment = table.Column<string>(type: "TEXT", nullable: false),
                    Level = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Primary = table.Column<string>(type: "TEXT", nullable: false),
                    Secondary = table.Column<string>(type: "TEXT", nullable: false),
                    Slot = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    BaseSets = table.Column<int>(type: "INTEGER", nullable: false),
                    RepsMin = table.Column<int>(type: "INTEGER", nullable: false),
                    RepsMax = table.Column<int>(type: "INTEGER", nullable: false),
                    IsTimeBased = table.Column<bool>(type: "INTEGER", nullable: false),
                    WorkDuration = table.Column<int>(type: "INTEGER", nullable: false),
                    RestSec = table.Column<int>(type: "INTEGER", nullable: false),
                    DemoUrl = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Exercises", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EquipmentOptions");

            migrationBuilder.DropTable(
                name: "Exercises");
        }
    }
}
