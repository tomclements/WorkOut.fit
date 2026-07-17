using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Endpoints;

public static class UserEndpoints
{
    public static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/user/preferences", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var pref = await db.UserPreferences
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId);

            var dto = pref == null
                ? new UserPreferenceDto()
                : new UserPreferenceDto
                {
                    DefaultEquipment = pref.DefaultEquipment,
                    DefaultMusic = pref.DefaultMusic,
                    DefaultVoice = pref.DefaultVoice,
                    DefaultMotionSensor = pref.DefaultMotionSensor,
                    DefaultVolume = pref.DefaultVolume
                };

            return Results.Ok(dto);
        }).RequireAuthorization();

        app.MapPut("/api/user/preferences", async (UserPreferenceDto dto, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var pref = await db.UserPreferences.FirstOrDefaultAsync(p => p.UserId == userId);
            if (pref == null)
            {
                pref = new UserPreference { UserId = userId };
                db.UserPreferences.Add(pref);
            }

            pref.DefaultEquipment = dto.DefaultEquipment ?? new List<string>();
            pref.DefaultMusic = dto.DefaultMusic;
            pref.DefaultVoice = dto.DefaultVoice;
            pref.DefaultMotionSensor = dto.DefaultMotionSensor;
            pref.DefaultVolume = Math.Clamp(dto.DefaultVolume, 0, 100);

            await db.SaveChangesAsync();
            return Results.Ok(dto);
        }).RequireAuthorization();

        app.MapGet("/api/user/favorites", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var ids = await db.UserFavoriteExercises
                .AsNoTracking()
                .Where(f => f.UserId == userId)
                .Select(f => f.ExerciseId)
                .ToListAsync();
            return Results.Ok(ids);
        }).RequireAuthorization();

        app.MapPost("/api/user/favorites/{exerciseId}", async (string exerciseId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            if (await db.UserFavoriteExercises.AnyAsync(f => f.UserId == userId && f.ExerciseId == exerciseId))
                return Results.Ok();

            db.UserFavoriteExercises.Add(new UserFavoriteExercise { UserId = userId, ExerciseId = exerciseId });
            await db.SaveChangesAsync();
            return Results.Ok();
        }).RequireAuthorization();

        app.MapDelete("/api/user/favorites/{exerciseId}", async (string exerciseId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var fav = await db.UserFavoriteExercises.FirstOrDefaultAsync(f => f.UserId == userId && f.ExerciseId == exerciseId);
            if (fav != null)
            {
                db.UserFavoriteExercises.Remove(fav);
                await db.SaveChangesAsync();
            }
            return Results.NoContent();
        }).RequireAuthorization();

        app.MapGet("/api/user/notes/{exerciseId}", async (string exerciseId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var note = await db.UserExerciseNotes
                .AsNoTracking()
                .FirstOrDefaultAsync(n => n.UserId == userId && n.ExerciseId == exerciseId);
            return Results.Ok(new { exerciseId, note = note?.Note ?? string.Empty });
        }).RequireAuthorization();

        app.MapPut("/api/user/notes/{exerciseId}", async (string exerciseId, UserExerciseNoteDto dto, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Results.Unauthorized();

            var note = await db.UserExerciseNotes.FirstOrDefaultAsync(n => n.UserId == userId && n.ExerciseId == exerciseId);
            if (note == null)
            {
                note = new UserExerciseNote { UserId = userId, ExerciseId = exerciseId };
                db.UserExerciseNotes.Add(note);
            }
            note.Note = dto.Note ?? string.Empty;
            await db.SaveChangesAsync();
            return Results.Ok(new { exerciseId, note = note.Note });
        }).RequireAuthorization();

        return app;
    }
}

public class UserExerciseNoteDto
{
    public string Note { get; set; } = string.Empty;
}
