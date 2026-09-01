using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Deterministic injury-tag engine driven by each exercise's anatomical
/// <see cref="ExerciseMechanics"/> plus its primary muscle list. This is the single
/// source of truth for <c>avoidFor</c> at catalog/DB seed time. Mechanics and
/// muscle-based passes always run fully; rehabilitation is handled as a server-side
/// allowlist during plan generation, not as tag suppression.
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
        ["knee"]     = new[] { "patellar" },
        ["rotator-cuff"] = new[] { "rotator-cuff" },
        ["patellar"] = new[] { "patellar" }
    };

    /// <summary>
    /// Server-side allowlist of exercise IDs that are permitted for a given injury area
    /// despite appearing in <c>avoidFor</c>. Parent rehab areas cover their specific
    /// children (e.g. shoulder rehab covers rotator-cuff restrictions).
    /// </summary>
    public static readonly Dictionary<string, HashSet<string>> AllowlistedExerciseIds = new(StringComparer.OrdinalIgnoreCase)
    {
        ["shoulder"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "band-pull-apart",
            "external-rotation",
            "external-rotation-with-band"
        },
        ["rotator-cuff"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "band-pull-apart",
            "external-rotation",
            "external-rotation-with-band"
        }
    };

    /// <summary>
    /// Maps specific injury tags to their parent joint for rehab-allowlist coverage.
    /// When the user selects shoulder rehab, rotator-cuff restrictions are also allowlisted.
    /// </summary>
    private static readonly Dictionary<string, string> SpecificToParent = new(StringComparer.OrdinalIgnoreCase)
    {
        ["rotator-cuff"] = "shoulder",
        ["patellar"] = "knee"
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

    /// <summary>
    /// Returns true when the exercise ID is on the server-side allowlist for the given
    /// injury area AND the user has selected that area (or its parent) for rehab.
    /// Centralized here so WorkoutPlannerService does not need its own copy.
    /// </summary>
    public static bool IsAllowlisted(string exerciseId, string injuryArea, List<string>? rehab)
    {
        if (rehab == null || rehab.Count == 0) return false;

        // Direct match: user selected rehab for this exact area
        if (rehab.Contains(injuryArea, StringComparer.OrdinalIgnoreCase))
        {
            if (AllowlistedExerciseIds.TryGetValue(injuryArea, out var allowed) &&
                allowed.Contains(exerciseId))
                return true;
        }

        // Parent covers specific: e.g. shoulder rehab covers rotator-cuff restrictions
        if (SpecificToParent.TryGetValue(injuryArea, out var parent) &&
            rehab.Contains(parent, StringComparer.OrdinalIgnoreCase))
        {
            if (AllowlistedExerciseIds.TryGetValue(injuryArea, out var allowed) &&
                allowed.Contains(exerciseId))
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
        RotatorCuff(avoid, m, primary);
        Patellar(avoid, m);

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

    private static void RotatorCuff(HashSet<string> avoid, ExerciseMechanics? m,
        List<string> primary)
    {
        if (m is null) return;

        var pos = m.Shoulder ?? "neutral";
        var isOverheadStyle =
            pos.Equals("overhead", StringComparison.OrdinalIgnoreCase) ||
            pos.Equals("elevated", StringComparison.OrdinalIgnoreCase) ||
            pos.Equals("horizontal", StringComparison.OrdinalIgnoreCase);
        var isRehabRotatorCuff =
            (m.Rehab ?? "").Equals("rotator-cuff", StringComparison.OrdinalIgnoreCase);

        if (isOverheadStyle || isRehabRotatorCuff)
        {
            avoid.Add("rotator-cuff");
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

    private static void Patellar(HashSet<string> avoid, ExerciseMechanics? m)
    {
        if (m is null) return;

        var knee = m.Knee ?? "none";
        var isDeep = knee.Equals("deep", StringComparison.OrdinalIgnoreCase);
        var isRehabPatellar =
            (m.Rehab ?? "").Equals("patellar", StringComparison.OrdinalIgnoreCase);

        if (isDeep || isRehabPatellar)
        {
            avoid.Add("patellar");
        }
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
