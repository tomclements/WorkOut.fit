namespace WorkoutPlanner.Api.Models;

public class Exercise
{    public string Id { get; set; } = string.Empty;
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
    /// <summary>Injury avoidance set (derived at runtime from <see cref="Mechanics"/> when present).</summary>
    public List<string> AvoidFor { get; set; } = new();
    /// <summary>Anatomical movement mechanics — the first-class source of truth for injury tags.
    /// Seed/catalog only; not persisted to the database (EF ignores it).</summary>
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public ExerciseMechanics? Mechanics { get; set; }
}

/// <summary>
/// Structured, name-independent description of how an exercise moves a body.
/// Drives <see cref="InjuryRules"/> instead of name/muscle heuristics.
/// </summary>
public class ExerciseMechanics
{
    /// <summary>Bodyweight held through extended/stiff arms — weight bearing on the hands (closed chain). Supports: plank, push-up, dive body-up, handstand, ring support, cobra press-up.</summary>
    public bool HandSupport { get; set; }
    /// <summary>closed | open — whether the working limbs bear body weight.</summary>
    public string Chain { get; set; } = "open";
    /// <summary>overhead | elevated | horizontal | neutral | low | dependent.</summary>
    public string Shoulder { get; set; } = "neutral";
    /// <summary>extension | flexion | isometric | none (elbow joint demand).</summary>
    public string Elbow { get; set; } = "none";
    /// <summary>neutral | pronated | supinated | mixed | partial | none (hand/grip position).</summary>
    public string Grip { get; set; } = "none";
    /// <summary>True when the movement demands a hard loaded grip while pulling/holding (deadlifts, rows, pull-ups, shrugs, carries). Drives wrist avoidance.</summary>
    public bool GripLoad { get; set; }
    /// <summary>neutral | flexion | extension | axial | rotation | lateral (lumbar/spine loading).</summary>
    public string Spine { get; set; } = "neutral";
    /// <summary>hinge | squat | neutral (hip demand).</summary>
    public string Hip { get; set; } = "neutral";
    /// <summary>deep | moderate | minimal | none (knee flexion demand).</summary>
    public string Knee { get; set; } = "none";
    /// <summary>True when the cervical spine is compressed or heavily loaded (shrugs, handstands, neck work).</summary>
    public bool NeckCompress { get; set; }
    /// <summary>Rehabilitation intent that suppresses joint-risk flags (e.g. "rotator-cuff" keeps shoulder OFF for band pull-aparts).</summary>
    public string? Rehab { get; set; }
}
