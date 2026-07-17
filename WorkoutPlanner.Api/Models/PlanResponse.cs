namespace WorkoutPlanner.Api.Models;

public class PlanResponse
{
    public PlanRequest Criteria { get; set; } = new();
    public List<WeekPlan> Plan { get; set; } = new();
    public string GeneratedAt { get; set; } = DateTime.UtcNow.ToString("O");
    /// <summary>Plain-language overview of how the plan progresses week to week.</summary>
    public string ProgressionSummary { get; set; } = string.Empty;
}
