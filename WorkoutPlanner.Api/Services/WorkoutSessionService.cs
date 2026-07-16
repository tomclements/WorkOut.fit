using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public class WorkoutSessionService : IWorkoutSessionService
{
    private readonly AppDbContext _db;

    public WorkoutSessionService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<int> SaveSessionAsync(string userId, SaveSessionRequest request)
    {
        var session = new WorkoutSession
        {
            UserId = userId,
            PlanName = request.PlanName ?? "Workout",
            SavedPlanId = request.SavedPlanId,
            StartedAt = request.StartedAt,
            CompletedAt = request.CompletedAt,
            DurationSeconds = request.DurationSeconds,
            Exercises = request.Exercises.Select(e => new CompletedExercise
            {
                ExerciseId = e.ExerciseId,
                ExerciseName = e.ExerciseName,
                TargetSets = e.TargetSets,
                Sets = e.Sets.Select(s => new CompletedSet
                {
                    Reps = s.Reps,
                    DurationSeconds = s.DurationSeconds
                }).ToList()
            }).ToList()
        };

        _db.WorkoutSessions.Add(session);
        await _db.SaveChangesAsync();
        return session.Id;
    }

    public async Task<IEnumerable<object>> ListSessionsAsync(string userId)
    {
        return await _db.WorkoutSessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.StartedAt)
            .Select(s => new
            {
                s.Id,
                s.PlanName,
                s.StartedAt,
                s.CompletedAt,
                s.DurationSeconds,
                ExerciseCount = s.Exercises.Count,
                TotalSets = s.Exercises.Sum(e => e.Sets.Count)
            })
            .ToListAsync();
    }

    public async Task<WorkoutSession?> GetSessionAsync(int id, string userId)
    {
        return await _db.WorkoutSessions
            .Include(s => s.Exercises)
            .ThenInclude(e => e.Sets)
            .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
    }
}
