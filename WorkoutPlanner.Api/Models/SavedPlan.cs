namespace WorkoutPlanner.Api.Models;

public class SavedPlan
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PlanJson { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
