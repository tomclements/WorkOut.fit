using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;

namespace WorkoutPlanner.Api.Endpoints;

public static class DashboardEndpoints
{
    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/dashboard", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var plans = await db.SavedPlans
                .Where(p => p.UserId == userId)
                .OrderByDescending(p => p.CreatedAt)
                .ToListAsync();

            var sessions = await db.WorkoutSessions
                .Where(s => s.UserId == userId)
                .OrderByDescending(s => s.StartedAt)
                .Include(s => s.Exercises)
                .ThenInclude(e => e.Sets)
                .ToListAsync();

            var planStats = plans.Select(p => new
            {
                p.Id,
                p.Name,
                p.CreatedAt,
                UseCount = sessions.Count(s => s.SavedPlanId == p.Id),
                LastUsed = sessions
                    .Where(s => s.SavedPlanId == p.Id)
                    .OrderByDescending(s => s.StartedAt)
                    .Select(s => (DateTime?)s.StartedAt)
                    .FirstOrDefault()
            }).ToList();

            var totalDuration = sessions.Sum(s => s.DurationSeconds);
            var totalSets = sessions.SelectMany(s => s.Exercises).Sum(e => e.Sets.Count);
            var totalReps = sessions.SelectMany(s => s.Exercises).SelectMany(e => e.Sets).Sum(s => s.Reps);

            var recentSessions = sessions.Take(5).Select(s => new
            {
                s.Id,
                s.PlanName,
                s.StartedAt,
                s.DurationSeconds,
                Sets = s.Exercises.Sum(e => e.Sets.Count),
                Reps = s.Exercises.SelectMany(e => e.Sets).Sum(set => set.Reps)
            }).ToList();

            return Results.Ok(new
            {
                TotalPlans = plans.Count,
                TotalSessions = sessions.Count,
                TotalDurationSeconds = totalDuration,
                TotalSets = totalSets,
                TotalReps = totalReps,
                Plans = planStats,
                RecentSessions = recentSessions
            });
        }).RequireAuthorization();

        return app;
    }
}
