namespace WorkoutPlanner.Api.Services;

public static class LongevityLegsCatalog
{
    /// <summary>
    /// ids reserved for the Longevity Legs module; excluded from general plan pools and swap/picker lists until B6 opts them in.
    /// </summary>
    public static readonly IReadOnlySet<string> LongevityOnlyExerciseIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "bodyweight-box-squat",
        "assisted-step-up",
        "bodyweight-split-squat-supported",
        "bodyweight-reverse-lunge",
        "standing-calf-raise-bodyweight",
        "seated-calf-raise-bodyweight",
        "goblet-step-up",
        "goblet-reverse-lunge",
        "hip-hinge-dowel",
        "single-leg-rdl-supported",
        "banded-rdl",
        "belt-squat"
    };

    public static bool IsLongevityOnly(string id) => LongevityOnlyExerciseIds.Contains(id);
}
