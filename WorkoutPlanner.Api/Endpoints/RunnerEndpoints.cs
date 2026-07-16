using System.Security.Claims;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;
using WorkoutPlanner.Api.Validators;

namespace WorkoutPlanner.Api.Endpoints;

public static class RunnerEndpoints
{
    public static IEndpointRouteBuilder MapRunnerEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/runner/sessions", async (SaveSessionRequest req, ClaimsPrincipal user, IWorkoutSessionService service) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var id = await service.SaveSessionAsync(userId, req);
            return Results.Ok(new { Id = id });
        }).RequireAuthorization().WithValidation<SaveSessionRequest>();

        app.MapGet("/api/runner/sessions", async (ClaimsPrincipal user, IWorkoutSessionService service) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var sessions = await service.ListSessionsAsync(userId);
            return Results.Ok(sessions);
        }).RequireAuthorization();

        app.MapGet("/api/runner/sessions/{id:int}", async (int id, ClaimsPrincipal user, IWorkoutSessionService service) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var session = await service.GetSessionAsync(id, userId);
            if (session == null) return Results.NotFound();

            return Results.Ok(session);
        }).RequireAuthorization();

        return app;
    }
}
