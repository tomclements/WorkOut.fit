namespace WorkoutPlanner.Api.Models;

/// <summary>A rehab path for one injury area: ordered stages from gentle to loaded.</summary>
public class RehabProgressionArea
{
    /// <summary>Injury area key matching the UI checkbox value (shoulder, knee, ...).</summary>
    public string Area { get; set; } = string.Empty;
    /// <summary>Human label, e.g. "Shoulder".</summary>
    public string Label { get; set; } = string.Empty;
    public List<RehabProgressionStage> Stages { get; set; } = new();
}

public class RehabProgressionStage
{
    /// <summary>1-based stage number — advance only when the current stage is pain-free.</summary>
    public int Stage { get; set; }
    public string Name { get; set; } = string.Empty;
    /// <summary>Short "how to" cue.</summary>
    public string Cue { get; set; } = string.Empty;
    /// <summary>"Stop if…" guidance for this stage.</summary>
    public string StopIf { get; set; } = string.Empty;
    /// <summary>Optional catalog/mobility id used for a demo thumbnail (/demos/{id}.webp).</summary>
    public string? DemoExerciseId { get; set; }
}
