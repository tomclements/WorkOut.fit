namespace WorkoutPlanner.Api.Models;

public class PlanRequest
{
    public int Weeks { get; set; } = 4;
    public int DaysPerWeek { get; set; } = 3;
    public int SessionMinutes { get; set; } = 30;
    public List<string> Equipment { get; set; } = new();
    public string Goal { get; set; } = "full-body";
    public string Level { get; set; } = "beginner";
    public bool IncludeWarmup { get; set; } = true;
    public bool IncludeCooldown { get; set; } = true;
    public List<string> Restrictions { get; set; } = new();
}
