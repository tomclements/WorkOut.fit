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
                : MapPreferenceDto(pref);

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

            ApplyPreferenceDto(pref, dto);
            await db.SaveChangesAsync();
            return Results.Ok(MapPreferenceDto(pref));
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

    private static UserPreferenceDto MapPreferenceDto(UserPreference pref) => new()
    {
        DefaultEquipment = pref.DefaultEquipment ?? new List<string>(),
        DefaultMusic = pref.DefaultMusic,
        DefaultVoice = pref.DefaultVoice,
        DefaultMotionSensor = pref.DefaultMotionSensor,
        DefaultVolume = pref.DefaultVolume,
        DefaultLevel = string.IsNullOrWhiteSpace(pref.DefaultLevel) ? "beginner" : pref.DefaultLevel,
        DefaultGoal = string.IsNullOrWhiteSpace(pref.DefaultGoal) ? "hypertrophy" : pref.DefaultGoal,
        DefaultSplit = string.IsNullOrWhiteSpace(pref.DefaultSplit) ? "full-body" : pref.DefaultSplit,
        DefaultProgression = string.IsNullOrWhiteSpace(pref.DefaultProgression) ? "linear" : pref.DefaultProgression,
        DefaultWeeks = pref.DefaultWeeks is >= 1 and <= 12 ? pref.DefaultWeeks : 4,
        DefaultDaysPerWeek = pref.DefaultDaysPerWeek is >= 1 and <= 7 ? pref.DefaultDaysPerWeek : 5,
        DefaultSessionMinutes = pref.DefaultSessionMinutes is >= 5 and <= 90 ? pref.DefaultSessionMinutes : 20,
        DefaultWorkoutDays = pref.DefaultWorkoutDays?.Where(d => d is >= 0 and <= 6).Distinct().OrderBy(d => d).ToList()
            ?? new List<int> { 0, 1, 2, 3, 4 },
        DefaultIncludeWarmup = pref.DefaultIncludeWarmup,
        DefaultIncludeCooldown = pref.DefaultIncludeCooldown
    };

    private static void ApplyPreferenceDto(UserPreference pref, UserPreferenceDto dto)
    {
        pref.DefaultEquipment = dto.DefaultEquipment ?? new List<string>();
        pref.DefaultMusic = dto.DefaultMusic;
        pref.DefaultVoice = dto.DefaultVoice;
        pref.DefaultMotionSensor = dto.DefaultMotionSensor;
        pref.DefaultVolume = Math.Clamp(dto.DefaultVolume, 0, 100);

        pref.DefaultLevel = string.IsNullOrWhiteSpace(dto.DefaultLevel) ? "beginner" : dto.DefaultLevel.Trim().ToLowerInvariant();
        pref.DefaultGoal = string.IsNullOrWhiteSpace(dto.DefaultGoal) ? "hypertrophy" : dto.DefaultGoal.Trim().ToLowerInvariant();
        pref.DefaultSplit = string.IsNullOrWhiteSpace(dto.DefaultSplit) ? "full-body" : dto.DefaultSplit.Trim().ToLowerInvariant();
        pref.DefaultProgression = string.IsNullOrWhiteSpace(dto.DefaultProgression) ? "linear" : dto.DefaultProgression.Trim().ToLowerInvariant();
        pref.DefaultWeeks = Math.Clamp(dto.DefaultWeeks <= 0 ? 4 : dto.DefaultWeeks, 1, 12);
        pref.DefaultDaysPerWeek = Math.Clamp(dto.DefaultDaysPerWeek <= 0 ? 5 : dto.DefaultDaysPerWeek, 1, 7);
        pref.DefaultSessionMinutes = Math.Clamp(dto.DefaultSessionMinutes <= 0 ? 20 : dto.DefaultSessionMinutes, 5, 90);
        pref.DefaultWorkoutDays = (dto.DefaultWorkoutDays ?? new List<int>())
            .Where(d => d is >= 0 and <= 6)
            .Distinct()
            .OrderBy(d => d)
            .ToList();
        if (pref.DefaultWorkoutDays.Count == 0)
            pref.DefaultWorkoutDays = Enumerable.Range(0, pref.DefaultDaysPerWeek).ToList();
        pref.DefaultIncludeWarmup = dto.DefaultIncludeWarmup;
        pref.DefaultIncludeCooldown = dto.DefaultIncludeCooldown;
    }
}

public class UserExerciseNoteDto
{
    public string Note { get; set; } = string.Empty;
}
