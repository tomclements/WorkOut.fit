using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public interface IWorkoutSessionService
{
    Task<int> SaveSessionAsync(string userId, SaveSessionRequest request);
    Task<IEnumerable<object>> ListSessionsAsync(string userId);
    Task<WorkoutSession?> GetSessionAsync(int id, string userId);
}
