namespace WorkoutPlanner.Api.Models;

public class WorkoutSession
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string PlanName { get; set; } = string.Empty;
    public int? SavedPlanId { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int DurationSeconds { get; set; }
    public List<CompletedExercise> Exercises { get; set; } = new();
}

public class CompletedExercise
{
    public int Id { get; set; }
    public int WorkoutSessionId { get; set; }
    public string ExerciseId { get; set; } = string.Empty;
    public string ExerciseName { get; set; } = string.Empty;
    public int TargetSets { get; set; }
    public List<CompletedSet> Sets { get; set; } = new();
}

public class CompletedSet
{
    public int Id { get; set; }
    public int CompletedExerciseId { get; set; }
    public int Reps { get; set; }
    public int DurationSeconds { get; set; }
}
