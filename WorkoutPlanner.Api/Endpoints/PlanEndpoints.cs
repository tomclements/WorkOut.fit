using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Validators;

namespace WorkoutPlanner.Api.Endpoints;

public static class PlanEndpoints
{
    public static IEndpointRouteBuilder MapPlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/plans/save", async (SavePlanRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var saved = new SavedPlan
            {
                UserId = userId,
                Name = req.Name ?? $"Plan {DateTime.UtcNow:yyyy-MM-dd}",
                PlanJson = req.PlanJson ?? string.Empty,
                CreatedAt = DateTime.UtcNow
            };

            db.SavedPlans.Add(saved);
            await db.SaveChangesAsync();
            return Results.Ok(new { saved.Id, saved.Name, saved.CreatedAt });
        }).RequireAuthorization().WithValidation<SavePlanRequest>();

        app.MapGet("/api/plans", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var plans = await db.SavedPlans
                .Where(p => p.UserId == userId)
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new { p.Id, p.Name, p.CreatedAt })
                .ToListAsync();

            return Results.Ok(plans);
        }).RequireAuthorization();

        app.MapGet("/api/plans/{id:int}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var plan = await db.SavedPlans.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
            if (plan == null) return Results.NotFound();

            return Results.Content(plan.PlanJson, "application/json");
        }).RequireAuthorization();

        app.MapDelete("/api/plans/{id:int}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var plan = await db.SavedPlans.FirstOrDefaultAsync(p => p.Id == id && p.UserId == userId);
            if (plan == null) return Results.NotFound();

            db.SavedPlans.Remove(plan);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
