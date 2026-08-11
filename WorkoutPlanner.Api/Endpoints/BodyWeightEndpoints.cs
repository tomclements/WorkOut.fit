using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Endpoints;

public static class BodyWeightEndpoints
{
    public static IEndpointRouteBuilder MapBodyWeightEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/body-weight", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var entries = await db.BodyWeightEntries
                .AsNoTracking()
                .Where(e => e.UserId == userId)
                .OrderByDescending(e => e.WeighedAt)
                .ThenByDescending(e => e.CreatedAt)
                .Take(200)
                .Select(e => new { e.Id, e.WeightKg, e.WeighedAt })
                .ToListAsync();

            var latest = entries.FirstOrDefault();
            var weight30DaysAgo = entries.LastOrDefault(e => e.WeighedAt >= DateTime.UtcNow.AddDays(-30));

            decimal? change30Days = null;
            if (latest != null && weight30DaysAgo != null && weight30DaysAgo.Id != latest.Id)
            {
                change30Days = latest.WeightKg - weight30DaysAgo.WeightKg;
            }

            return Results.Ok(new
            {
                entries,
                latestWeightKg = (decimal?)latest?.WeightKg,
                change30Days
            });
        }).RequireAuthorization();

        app.MapPost("/api/body-weight", async (AddBodyWeightRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();
            if (req.WeightKg is < 20 or > 500)
                return Results.BadRequest(new { errors = new[] { "Weight must be between 20 and 500 kg." } });

            var weighedAt = req.WeighedAt?.ToUniversalTime() ?? DateTime.UtcNow;
            // Keep the measurement on its calendar day (UTC) so the chart has clean buckets.
            weighedAt = weighedAt.Date;

            var entry = new BodyWeightEntry
            {
                UserId = userId,
                WeightKg = Math.Round(req.WeightKg, 2),
                WeighedAt = weighedAt,
                CreatedAt = DateTime.UtcNow
            };

            db.BodyWeightEntries.Add(entry);
            await db.SaveChangesAsync();

            return Results.Created($"/api/body-weight/{entry.Id}", new
            {
                entry.Id,
                entry.WeightKg,
                entry.WeighedAt
            });
        }).RequireAuthorization();

        app.MapDelete("/api/body-weight/{id:int}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var entry = await db.BodyWeightEntries
                .FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
            if (entry == null) return Results.NotFound();

            db.BodyWeightEntries.Remove(entry);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
