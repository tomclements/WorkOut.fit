using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Deterministic injury-tag engine driven by each exercise's anatomical
/// <see cref="ExerciseMechanics"/> plus its primary muscle list. This is the single
/// source of truth for <c>avoidFor</c> at catalog/DB seed time.
/// Mechanics and muscle-based passes always run fully; rehabilitation is handled
/// as a server-side allowlist during plan generation, not as tag suppression.
/// </summary>
public static class InjuryRules
{
    private static readonly string[] ArmMuscles = { "biceps", "triceps", "forearms" };
    private static readonly string[] LegMuscles =
        { "quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors" };

    /// <summary>
    /// Maps each injury area to the primary muscles that, when worked, stress that area.
    /// </summary>
    private static readonly Dictionary<string, string[]> MuscleToInjury = new(StringComparer.OrdinalIgnoreCase)
    {
        ["shoulder"] = new[] { "shoulders", "rear-shoulders", "traps" },
        ["elbow"]    = new[] { "biceps", "triceps", "forearms" },
        ["wrist"]    = new[] { "forearms" },
        ["knee"]     = LegMuscles,
        ["lower-back"] = new[] { "lower back" },
        ["neck"]     = new[] { "neck" }
    };

    /// <summary>
    /// Maps UI rehab checkbox values (injury area names) to the <c>mechanics.rehab</c>
    /// string values stored on exercises. Used to match user rehab selections to exercises.
    /// </summary>
    public static readonly Dictionary<string, string[]> RehabToMechanics = new(StringComparer.OrdinalIgnoreCase)
    {
        ["shoulder"] = new[] { "rotator-cuff" },
        ["knee"]     = new[] { "patellar" }
    };

    /// <summary>
    /// Server-side allowlist of exercise IDs that are permitted for a given injury area
    /// despite appearing in <c>avoidFor</c>. Only rehab-appropriate exercises should
    /// be listed here; the list is conservative and will grow over time.
    /// </summary>
    public static readonly Dictionary<string, HashSet<string>> AllowlistedExerciseIds = new(StringComparer.OrdinalIgnoreCase)
    {
        ["shoulder"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "band-pull-apart",
            "external-rotation",
            "external-rotation-with-band"
        }
    };

    /// <summary>
    /// Returns true if the exercise's <c>mechanics.rehab</c> matches any of the user's
    /// selected rehab areas via <see cref="RehabToMechanics"/>.
    /// </summary>
    public static bool MatchesRehab(Exercise ex, List<string> rehabAreas)
    {
        if (rehabAreas == null || rehabAreas.Count == 0) return false;
        var mechRehab = ex.Mechanics?.Rehab;
        if (string.IsNullOrWhiteSpace(mechRehab)) return false;
        foreach (var area in rehabAreas)
        {
            if (RehabToMechanics.TryGetValue(area, out var mechanicsValues) &&
                mechanicsValues.Any(v => v.Equals(mechRehab, StringComparison.OrdinalIgnoreCase)))
                return true;
        }
        return false;
    }

    public static List<string> ComputeAvoidance(Exercise ex)
    {
        var avoid = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var m = ex.Mechanics;
        var primary = ex.Primary ?? new List<string>();
        var secondary = ex.Secondary ?? new List<string>();
        var allMuscles = primary.Concat(secondary).ToList();

        Shoulder(avoid, m, primary);
        Elbow(avoid, m, primary);
        Wrist(avoid, m);
        Knee(avoid, m, primary);
        LowerBack(avoid, m, primary);
        Neck(avoid, m, primary);

        // Muscle-based safety net — always runs.
        // If an exercise's primary or secondary muscles target an injured area, tag it.
        foreach (var kvp in MuscleToInjury)
        {
            if (allMuscles.Any(p => kvp.Value.Contains(p, StringComparer.OrdinalIgnoreCase)))
                avoid.Add(kvp.Key);
        }

        return avoid.OrderBy(a => a, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void Shoulder(HashSet<string> avoid, ExerciseMechanics? m,
        List<string> primary)
    {
        if (m is null)
        {
            if (primary.Contains("shoulders", StringComparer.OrdinalIgnoreCase)) avoid.Add("shoulder");
            return;
        }

        var supported = m.HandSupport;
        var pos = m.Shoulder ?? "neutral";

        if (supported
            || pos.Equals("overhead", StringComparison.OrdinalIgnoreCase)
            || pos.Equals("elevated", StringComparison.OrdinalIgnoreCase)
            || pos.Equals("horizontal", StringComparison.OrdinalIgnoreCase)
            || primary.Contains("shoulders", StringComparer.OrdinalIgnoreCase))
        {
            avoid.Add("shoulder");
        }
    }

    private static void Elbow(HashSet<string> avoid, ExerciseMechanics? m, List<string> primary)
    {
        var armPrimary = primary.Any(p => ArmMuscles.Contains(p, StringComparer.OrdinalIgnoreCase));

        if (m is null)
        {
            if (armPrimary) avoid.Add("elbow");
            return;
        }

        var elbow = m.Elbow ?? "none";
        var loadsElbow =
            elbow.Equals("extension", StringComparison.OrdinalIgnoreCase) ||
            elbow.Equals("flexion", StringComparison.OrdinalIgnoreCase);

        // Isometric holds (plank, handstand, dead-hang) don't load the elbow joint enough to tag.
        if (loadsElbow || armPrimary)
            avoid.Add("elbow");
    }

    private static void Wrist(HashSet<string> avoid, ExerciseMechanics? m)
    {
        if (m is null) return;
        if (m.HandSupport || m.GripLoad) avoid.Add("wrist");
    }

    private static void Knee(HashSet<string> avoid, ExerciseMechanics? m, List<string> primary)
    {
        var leg = primary.Any(p => LegMuscles.Contains(p, StringComparer.OrdinalIgnoreCase));

        if (m is null)
        {
            if (leg) avoid.Add("knee");
            return;
        }

        var knee = m.Knee ?? "none";
        var deepFlex =
            knee.Equals("deep", StringComparison.OrdinalIgnoreCase) ||
            knee.Equals("moderate", StringComparison.OrdinalIgnoreCase);

        if (deepFlex || leg || m.Hip.Equals("squat", StringComparison.OrdinalIgnoreCase))
            avoid.Add("knee");
    }

    private static void LowerBack(HashSet<string> avoid, ExerciseMechanics? m, List<string> primary)
    {
        if (m is null)
        {
            if (primary.Contains("lower back", StringComparer.OrdinalIgnoreCase)) avoid.Add("lower-back");
            return;
        }

        var spine = m.Spine ?? "neutral";
        var loaded = spine switch
        {
            "flexion" or "axial" or "rotation" or "lateral" or "extension" => true,
            _ => false
        };

        if (loaded || m.Hip.Equals("hinge", StringComparison.OrdinalIgnoreCase))
            avoid.Add("lower-back");
    }

    private static void Neck(HashSet<string> avoid, ExerciseMechanics? m, List<string> primary)
    {
        if (m is null)
        {
            if (primary.Contains("neck", StringComparer.OrdinalIgnoreCase)) avoid.Add("neck");
            return;
        }
        if (m.NeckCompress) avoid.Add("neck");
    }
}