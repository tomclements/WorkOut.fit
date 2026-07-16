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

        app.MapPost("/api/plan", async (PlanRequest request, IWorkoutPlannerService service) =>
        {
            try
            {
                var plan = await service.GeneratePlan(request);
                var anyWorkouts = plan.Plan.SelectMany(w => w.Days).Any(d => d.Type == "workout" && d.Exercises.Count > 0);
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
