namespace WorkoutPlanner.Api.Models;

public class SaveSessionRequest
{
    public string PlanName { get; set; } = string.Empty;
    public int? SavedPlanId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int DurationSeconds { get; set; }
    public List<CompletedExerciseDto> Exercises { get; set; } = new();
}

public class CompletedExerciseDto
{
    public string ExerciseId { get; set; } = string.Empty;
    public string ExerciseName { get; set; } = string.Empty;
    public int TargetSets { get; set; }
    public List<CompletedSetDto> Sets { get; set; } = new();
}

public class CompletedSetDto
{
    public int Reps { get; set; }
    public int DurationSeconds { get; set; }
}
