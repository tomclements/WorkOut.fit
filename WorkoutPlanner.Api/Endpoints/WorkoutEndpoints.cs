using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;
using WorkoutPlanner.Api.Validators;

namespace WorkoutPlanner.Api.Endpoints;

public static class WorkoutEndpoints
{
    public static IEndpointRouteBuilder MapWorkoutEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/equipment", async (AppDbContext db) =>
        {
            var equipment = await db.EquipmentOptions
                .AsNoTracking()
                .OrderBy(e => e.Name)
                .ToListAsync();
            return Results.Ok(equipment);
        }).AllowAnonymous();

        app.MapGet("/api/exercises", async (AppDbContext db) =>
        {
            var exercises = await db.Exercises
                .AsNoTracking()
                .OrderBy(e => e.Name)
                .ToListAsync();
            return Results.Ok(exercises);
        }).AllowAnonymous();

        app.MapPost("/api/plan", async (PlanRequest request, IWorkoutPlannerService service) =>
        {
            try
            {
                // Guard against clients sending unsigned 32-bit seeds that overflow int
                if (request.Seed < 0)
                    request.Seed = unchecked((int)((uint)request.Seed & 0x7fffffff));
                if (request.Seed == 0)
                    request.Seed = Random.Shared.Next(1, int.MaxValue);

                var plan = await service.GeneratePlan(request);
                // Warm-up/cool-down alone don't count — need real training moves
                var anyWorkouts = plan.Plan.SelectMany(w => w.Days).Any(d =>
                    d.Type == "workout" &&
                    d.Exercises.Any(e =>
                        string.IsNullOrEmpty(e.Phase) ||
                        e.Phase.Equals("work", StringComparison.OrdinalIgnoreCase)));
                if (!anyWorkouts)
                {
                    return Results.BadRequest(new { error = "No exercises could be generated with the selected equipment and restrictions. Try relaxing the filters." });
                }
                return Results.Ok(plan);
            }
            catch (Exception ex)
            {
                return Results.Problem($"Failed to generate plan: {ex.Message}");
            }
        }).AllowAnonymous().WithValidation<PlanRequest>();

        return app;
    }
}
