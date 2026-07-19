namespace WorkoutPlanner.Api.Models;

public class Exercise
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<string> Equipment { get; set; } = new();
    public string Level { get; set; } = "beginner";
    public List<string> Primary { get; set; } = new();
    public List<string> Secondary { get; set; } = new();
    /// <summary>Movement pattern for scheduling: push, pull, legs, core, or carry.</summary>
    public string Slot { get; set; } = "push";
    /// <summary>push | pull | static | unknown (from free-exercise-db force).</summary>
    public string Force { get; set; } = "unknown";
    /// <summary>compound | isolation | unknown.</summary>
    public string Mechanic { get; set; } = "unknown";
    public int BaseSets { get; set; } = 3;
    public int RepsMin { get; set; } = 8;
    public int RepsMax { get; set; } = 12;
    public bool IsTimeBased { get; set; }
    public int WorkDuration { get; set; } = 30;
    public int RestSec { get; set; } = 60;
    public string? DemoUrl { get; set; }
    /// <summary>Optional illustration URL (typically free-exercise-db on GitHub raw).</summary>
    public string? ImageUrl { get; set; }
    public List<string> AvoidFor { get; set; } = new();
}
