namespace WorkoutPlanner.Api.Models;

public class PlanRequest
{
    public int Weeks { get; set; } = 4;
    public int DaysPerWeek { get; set; } = 3;
    public List<int> WorkoutDays { get; set; } = new();
    public int SessionMinutes { get; set; } = 30;
    public List<string> Equipment { get; set; } = new();
    public string Split { get; set; } = "full-body";
    public string Goal { get; set; } = "hypertrophy";
    public string Level { get; set; } = "beginner";
    public bool IncludeWarmup { get; set; } = true;
    public bool IncludeCooldown { get; set; } = true;
    public List<string> Restrictions { get; set; } = new();
    public List<string> FavoriteExerciseIds { get; set; } = new();
    /// <summary>Exercises the user dislikes — strongly deprioritized or skipped when alternatives exist.</summary>
    public List<string> DislikedExerciseIds { get; set; } = new();

    /// <summary>
    /// How the plan progresses across weeks: none, linear, wave, or block.
    /// </summary>
    public string Progression { get; set; } = "linear";

    /// <summary>
    /// Random seed for exercise selection. Different seeds produce different exercise mixes.
    /// </summary>
    public int Seed { get; set; }

    /// <summary>
    /// Soft-avoid these exercise IDs when regenerating (prefer alternatives).
    /// </summary>
    public List<string> AvoidExerciseIds { get; set; } = new();
}
