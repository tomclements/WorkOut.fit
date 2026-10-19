using System.Text.Json.Serialization;

namespace WorkoutPlanner.Api.Models;

public class PlanResponse
{
    public PlanRequest Criteria { get; set; } = new();
    public List<WeekPlan> Plan { get; set; } = new();
    public string GeneratedAt { get; set; } = DateTime.UtcNow.ToString("O");
    /// <summary>Plain-language overview of how the plan progresses week to week.</summary>
    public string ProgressionSummary { get; set; } = string.Empty;
    /// <summary>Rehab progression chains for the user's selected recovery areas (empty if none).</summary>
    public List<RehabProgressionArea> RehabProgressions { get; set; } = new();
    /// <summary>Longevity legs summary; null when IncludeLongevityLegs is off.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public LongevityLegsSummary? LongevityLegs { get; set; }
}

public class LongevityLegsSummary
{
    /// <summary>Whether longevity legs was enabled in the request.</summary>
    public bool Enabled { get; set; }
    /// <summary>Target number of lower-body sessions per week.</summary>
    public int TargetSessionsPerWeek { get; set; }
    /// <summary>Sessions per week that actually covered each longevity pattern.</summary>
    public List<int> CoveredSessionsPerWeek { get; set; } = new();
    /// <summary>Chosen regressions and the reason each was selected.</summary>
    public List<LongevityRegression> Regressions { get; set; } = new();
    /// <summary>Patterns that could not be covered in the generated plan.</summary>
    public List<string> UncoveredPatterns { get; set; } = new();
    /// <summary>Human-readable summary of the longevity legs configuration.</summary>
    public string Blurb { get; set; } = string.Empty;
    /// <summary>Medical / safety disclaimer for the longevity legs content.</summary>
    public string Disclaimer { get; set; } = string.Empty;
}

public class LongevityRegression
{
    /// <summary>The longevity pattern being regressed, e.g. squat.</summary>
    public string Pattern { get; set; } = string.Empty;
    /// <summary>ID of the chosen regression exercise.</summary>
    public string ChosenId { get; set; } = string.Empty;
    /// <summary>Why this regression was chosen.</summary>
    public string Reason { get; set; } = string.Empty;
}
