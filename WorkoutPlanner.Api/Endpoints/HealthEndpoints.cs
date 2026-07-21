using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;

namespace WorkoutPlanner.Api.Endpoints;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", async (AppDbContext db) =>
        {
            try
            {
                var canConnect = await db.Database.CanConnectAsync();
                if (!canConnect)
                {
                    return Results.Json(new
                    {
                        status = "unhealthy",
                        database = "unreachable",
                        timestamp = DateTime.UtcNow
                    }, statusCode: StatusCodes.Status503ServiceUnavailable);
                }

                // Lightweight round-trip so readiness reflects real queryability
                _ = await db.Exercises.AsNoTracking().Select(e => e.Id).Take(1).ToListAsync();

                return Results.Ok(new
                {
                    status = "healthy",
                    database = "ok",
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception)
            {
                return Results.Json(new
                {
                    status = "unhealthy",
                    database = "error",
                    detail = "An internal error occurred.",
                    timestamp = DateTime.UtcNow
                }, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }).AllowAnonymous().WithTags("Health");

        return app;
    }
}
