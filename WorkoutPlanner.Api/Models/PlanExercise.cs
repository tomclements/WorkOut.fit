using System.Text.Json.Serialization;

namespace WorkoutPlanner.Api.Models;

public class PlanExercise
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Slot { get; set; } = string.Empty;
    /// <summary>work (main lifts) | warmup | cooldown</summary>
    public string Phase { get; set; } = "work";
    public int Sets { get; set; }
    public string RepsDisplay { get; set; } = string.Empty;
    public int Rest { get; set; }
    public int WorkDuration { get; set; }
    public bool IsTimeBased { get; set; }
    public List<string> Primary { get; set; } = new();
    public string Progression { get; set; } = string.Empty;
    public string? DemoUrl { get; set; }
    public string? ImageUrl { get; set; }
    /// <summary>In-app animated demo path, e.g. /demos/{id}.webp (from free-exercise-db stills).</summary>
    public string? DemoAnimUrl { get; set; }
    /// <summary>Squat, hinge, calf, lunge, or step-up pattern when part of the longevity legs progression.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LongevityPattern { get; set; }
    /// <summary>Why a simpler regression was chosen for this pattern.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RegressionNote { get; set; }
}
