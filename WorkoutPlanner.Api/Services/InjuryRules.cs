using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Deterministic injury-tag engine driven by each exercise's anatomical
/// <see cref="ExerciseMechanics"/> plus its primary muscle list. This is the single
/// source of truth for <c>avoidFor</c> at catalog/DB seed time.
/// A muscle-based pass runs unconditionally at the end so that exercises whose
/// primary muscles target an injured area are always tagged — even when the
/// mechanics-based check suppresses the tag for rehabilitative intent.
/// </summary>
public static class InjuryRules
{
    private static readonly string[] ArmMuscles = { "biceps", "triceps", "forearms" };
    private static readonly string[] LegMuscles =
        { "quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors" };

    /// <summary>
    /// Maps each injury area to the primary muscles that, when worked, stress that area.
    /// Runs unconditionally so rehab intent never suppresses a genuine muscle→joint match.
    /// </summary>
    private static readonly Dictionary<string, string[]> MuscleToInjury = new(StringComparer.OrdinalIgnoreCase)
    {
        ["shoulder"] = new[] { "shoulders", "traps" },
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

        bool rehabilitative =
            !string.IsNullOrWhiteSpace(m?.Rehab) &&
            (m!.Rehab.Equals("rotator-cuff", StringComparison.OrdinalIgnoreCase) ||
             m.Rehab.Equals("patellar", StringComparison.OrdinalIgnoreCase));

        Shoulder(avoid, m, primary, rehabilitative);
        Elbow(avoid, m, primary);
        Wrist(avoid, m);
        Knee(avoid, m, primary);
        LowerBack(avoid, m, primary);
        Neck(avoid, m, primary);

        // Muscle-based safety net — always runs, never suppressed by rehab intent.
        // If an exercise's primary muscles target an injured area, tag it.
        foreach (var kvp in MuscleToInjury)
        {
            if (primary.Any(p => kvp.Value.Contains(p, StringComparer.OrdinalIgnoreCase)))
                avoid.Add(kvp.Key);
        }

        return avoid.OrderBy(a => a, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void Shoulder(HashSet<string> avoid, ExerciseMechanics? m,
        List<string> primary, bool rehabilitative)
    {
        if (rehabilitative) return;

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