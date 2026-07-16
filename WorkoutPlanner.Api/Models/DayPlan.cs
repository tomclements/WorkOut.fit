namespace WorkoutPlanner.Api.Models;

public class DayPlan
{
    public string Type { get; set; } = "rest";
    public int DayIndex { get; set; }
    public string Day { get; set; } = string.Empty;
    public string Focus { get; set; } = string.Empty;
    public int EstimatedMinutes { get; set; }
    public List<PlanExercise> Exercises { get; set; } = new();
    public string Note { get; set; } = string.Empty;
}
