namespace WorkoutPlanner.Api.Models;

public class PlanExercise
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Slot { get; set; } = string.Empty;
    public int Sets { get; set; }
    public string RepsDisplay { get; set; } = string.Empty;
    public int Rest { get; set; }
    public int WorkDuration { get; set; }
    public bool IsTimeBased { get; set; }
    public List<string> Primary { get; set; } = new();
    public string Progression { get; set; } = string.Empty;
    public string? DemoUrl { get; set; }
}
