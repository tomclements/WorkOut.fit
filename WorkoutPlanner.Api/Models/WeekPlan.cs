namespace WorkoutPlanner.Api.Models;

public class WeekPlan
{
    public int Week { get; set; }
    /// <summary>Machine key: base, build, peak, deload, volume, intensity.</summary>
    public string Phase { get; set; } = string.Empty;
    /// <summary>User-facing label, e.g. "Build week" or "Recovery (deload)".</summary>
    public string PhaseLabel { get; set; } = string.Empty;
    /// <summary>Short coaching note for the week.</summary>
    public string FocusNote { get; set; } = string.Empty;
    public List<DayPlan> Days { get; set; } = new();
}
