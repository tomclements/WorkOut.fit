using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public interface IExerciseImportService
{
    Task<ExerciseImportResult> RefreshFromFreeExerciseDbAsync(bool force = false, CancellationToken ct = default);
    Task<ExerciseLibraryStats> GetLibraryStatsAsync(CancellationToken ct = default);
}
