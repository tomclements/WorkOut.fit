namespace WorkoutPlanner.Api.Models;

public class PlanResponse
{
    public PlanRequest Criteria { get; set; } = new();
    public List<WeekPlan> Plan { get; set; } = new();
    public string GeneratedAt { get; set; } = DateTime.UtcNow.ToString("O");
}
