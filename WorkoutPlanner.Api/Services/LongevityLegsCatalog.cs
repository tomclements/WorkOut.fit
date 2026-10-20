using WorkoutPlanner.Api.Models;

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

    public static readonly IReadOnlyList<string> Patterns = ["squat", "hinge", "calf", "lunge", "step-up"];

    public const string ShoulderLimitation = "shoulder";
    public const string KneeLimitation = "knee";
    public const string LowerBackLimitation = "lower-back";
    public const string NoEquipmentLimitation = "no-equipment";

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> EquivalenceGroups =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["squat"] = new[] { "goblet-squat", "kettlebell-goblet-squat", "dumbbell-squat-to-a-bench", "leg-press", "box-squat" },
            ["hinge"] = new[] { "db-romanian-deadlift", "romanian-deadlift", "stiff-legged-dumbbell-deadlift" },
            ["calf"] = new[] { "standing-dumbbell-calf-raise", "standing-calf-raises", "smith-machine-calf-raise" },
            ["lunge"] = new[] { "dumbbell-rear-lunge", "split-squat-with-dumbbells", "db-lunge" },
            ["step-up"] = new[] { "db-step-up", "dumbbell-step-ups" }
        };

    public static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, IReadOnlyList<string>>> Regressions =
        new Dictionary<string, IReadOnlyDictionary<string, IReadOnlyList<string>>>(StringComparer.OrdinalIgnoreCase)
        {
            ["squat"] = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
            {
                [ShoulderLimitation] = new[] { "goblet-squat", "kettlebell-goblet-squat", "leg-press", "bodyweight-box-squat" },
                [KneeLimitation] = new[] { "bodyweight-box-squat", "leg-press" },
                [LowerBackLimitation] = new[] { "leg-press", "goblet-squat", "bodyweight-box-squat" },
                [NoEquipmentLimitation] = new[] { "bodyweight-box-squat", "bodyweight-squat" }
            },
            ["hinge"] = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
            {
                [ShoulderLimitation] = new[] { "banded-rdl", "hip-hinge-dowel", "barbell-hip-thrust", "barbell-glute-bridge", "single-leg-glute-bridge", "belt-squat" },
                [KneeLimitation] = new[] { "single-leg-glute-bridge", "butt-lift-bridge", "barbell-glute-bridge", "barbell-hip-thrust" },
                [LowerBackLimitation] = new[] { "barbell-glute-bridge", "butt-lift-bridge", "barbell-hip-thrust", "single-leg-glute-bridge" },
                [NoEquipmentLimitation] = new[] { "hip-hinge-dowel", "single-leg-rdl-supported", "butt-lift-bridge" }
            },
            ["calf"] = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
            {
                [ShoulderLimitation] = new[] { "standing-calf-raise-bodyweight", "seated-calf-raise", "seated-calf-raise-bodyweight" },
                [KneeLimitation] = new[] { "seated-calf-raise", "seated-calf-raise-bodyweight" },
                [LowerBackLimitation] = new[] { "standing-calf-raises", "seated-calf-raise", "standing-calf-raise-bodyweight", "seated-calf-raise-bodyweight" },
                [NoEquipmentLimitation] = new[] { "standing-calf-raise-bodyweight", "seated-calf-raise-bodyweight" }
            },
            ["lunge"] = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
            {
                [ShoulderLimitation] = new[] { "goblet-reverse-lunge", "bodyweight-split-squat-supported", "bodyweight-reverse-lunge" },
                [KneeLimitation] = new[] { "bodyweight-split-squat-supported", "assisted-step-up" },
                [LowerBackLimitation] = new[] { "split-squat-with-dumbbells", "bodyweight-split-squat-supported" },
                [NoEquipmentLimitation] = new[] { "bodyweight-reverse-lunge", "bodyweight-split-squat-supported" }
            },
            ["step-up"] = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
            {
                [ShoulderLimitation] = new[] { "goblet-step-up", "assisted-step-up", "step-up-with-knee-raise" },
                [KneeLimitation] = new[] { "assisted-step-up" },
                [LowerBackLimitation] = new[] { "assisted-step-up" },
                [NoEquipmentLimitation] = new[] { "assisted-step-up" }
            }
        };

    public static readonly IReadOnlySet<string> KneeSafeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "bodyweight-box-squat",
        "seated-calf-raise-bodyweight",
        "single-leg-glute-bridge",
        "butt-lift-bridge",
        "assisted-step-up"
    };

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Ladders =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["squat"] = new[] { "bodyweight-box-squat", "bodyweight-squat", "goblet-squat" },
            ["hinge"] = new[] { "hip-hinge-dowel", "single-leg-rdl-supported", "banded-rdl" },
            ["calf"] = new[] { "seated-calf-raise-bodyweight", "standing-calf-raise-bodyweight", "standing-dumbbell-calf-raise" },
            ["lunge"] = new[] { "bodyweight-split-squat-supported", "bodyweight-reverse-lunge", "goblet-reverse-lunge" },
            ["step-up"] = new[] { "assisted-step-up", "step-up-with-knee-raise", "goblet-step-up" }
        };

    public const string Blurb = "Longevity Legs. Strong legs help you get up, climb stairs, and keep walking well as you age. Research in older adults links stronger legs and a faster walking pace with better long-term health, and even modest strength gains seem to help. This focus adds squats, hip hinges, calf raises, lunges and step-ups 2-3 times a week, at 2-3 sets of 8-15 reps, stopping with about 2 reps in reserve. Cardio helps you keep strength; gradually adding load builds it.";

    public const string Disclaimer = "General fitness guidance, not medical advice. Check with your clinician if you have an injury or health condition, and stop any exercise that causes pain.";

    private static readonly IReadOnlyList<string> ActiveLimitationOrder = [ShoulderLimitation, KneeLimitation, LowerBackLimitation];

    private static readonly IReadOnlyDictionary<string, string> LimitationReasons =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [ShoulderLimitation] = "Chosen to keep load off the rotator cuff and shoulder (no weights hanging from the hands).",
            [KneeLimitation] = "Chosen as a knee-friendlier option.",
            [LowerBackLimitation] = "Chosen to keep load off the lower back."
        };

    public sealed record LongevityPick(Exercise? Exercise, string? RegressionReason);

    /// <summary>
    /// Picks the best exercise for a Longevity Legs pattern from the supplied pool.
    /// </summary>
    /// <param name="pattern">One of <see cref="Patterns"/>.</param>
    /// <param name="pool">
    /// Candidates already filtered by level and equipment but NOT by injury restrictions;
    /// Resolve applies restrictions itself. Lookup by id is performed case-insensitively.
    /// </param>
    /// <param name="restrictions">User-selected injury restrictions.</param>
    /// <param name="rehab">User-selected rehab areas; gates the <see cref="KneeSafeIds"/> bypass.</param>
    /// <param name="rng">Reserved for future use; B6 will pass a separate Random so plan seeds stay reproducible.</param>
    /// <param name="recent">Recently-used exercise ids to de-duplicate; case-insensitive.</param>
    /// <returns>The chosen exercise and an optional user-facing regression reason.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="pattern"/> is unknown.</exception>
    /// <remarks>
    /// Selection tiers, in order:
    /// 1. <see cref="EquivalenceGroups"/> for the pattern.
    /// 2. For each active limitation (shoulder, knee, lower-back) in that order,
    ///    <see cref="Regressions"/>[(pattern, limitation)]. A limitation is active when
    ///    <paramref name="restrictions"/> contains one of its tags.
    /// 3. <see cref="Regressions"/>[(pattern, "no-equipment")].
    /// Within a tier, ids are walked in order. The first allowed id present in the pool and
    /// not in <paramref name="recent"/> wins. If every allowed id present is recent, the first
    /// allowed present id wins. The first tier that yields a result stops the search.
    /// Allowed(e): e.AvoidFor has no tag in restrictions (ordinal, case-insensitive), except
    /// that when e.Id is in <see cref="KneeSafeIds"/> and rehab contains "knee" or "patellar",
    /// the "knee" and "patellar" tags are ignored for e. All other restricted tags still block.
    /// As a belt-and-braces guard, an exercise whose mechanics.shoulder is "dependent" is never
    /// returned when restrictions contain "rotator-cuff" or "shoulder".
    /// </remarks>
    public static LongevityPick Resolve(
        string pattern,
        IReadOnlyCollection<Exercise> pool,
        IReadOnlyCollection<string>? restrictions,
        IReadOnlyCollection<string>? rehab,
        Random rng,
        IReadOnlyCollection<string>? recent)
    {
        if (!Patterns.Contains(pattern, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException($"Unknown Longevity Legs pattern: {pattern}", nameof(pattern));

        var normPattern = pattern.ToLowerInvariant();
        var group = EquivalenceGroups[normPattern];

        var picked = TryPick(group, pool, restrictions, rehab, recent);
        if (picked is not null)
            return new LongevityPick(picked, null);

        foreach (var limitation in ActiveLimitationOrder)
        {
            if (!IsLimitationActive(limitation, restrictions))
                continue;

            var regressionIds = Regressions[normPattern][limitation];
            picked = TryPick(regressionIds, pool, restrictions, rehab, recent);
            if (picked is not null)
                return new LongevityPick(picked, LimitationReasons[limitation]);
        }

        var noEquipmentIds = Regressions[normPattern][NoEquipmentLimitation];
        picked = TryPick(noEquipmentIds, pool, restrictions, rehab, recent);
        if (picked is not null)
            return new LongevityPick(picked, "Bodyweight option chosen because the usual equipment isn't selected.");

        var reason = $"No {pattern} option fits your equipment and restrictions.";
        if (IsLimitationActive(KneeLimitation, restrictions) && !HasKneeOrPatellarRehab(rehab))
            reason += " Talk to your clinician about knee-friendly options.";

        return new LongevityPick(null, reason);
    }

    private static Exercise? TryPick(
        IReadOnlyList<string> ids,
        IReadOnlyCollection<Exercise> pool,
        IReadOnlyCollection<string>? restrictions,
        IReadOnlyCollection<string>? rehab,
        IReadOnlyCollection<string>? recent)
    {
        Exercise? firstAllowed = null;

        foreach (var id in ids)
        {
            var exercise = pool.FirstOrDefault(e =>
                string.Equals(e.Id, id, StringComparison.OrdinalIgnoreCase));
            if (exercise is null)
                continue;

            if (!IsAllowed(exercise, restrictions, rehab))
                continue;

            firstAllowed ??= exercise;

            if (recent is null || !recent.Contains(exercise.Id, StringComparer.OrdinalIgnoreCase))
                return exercise;
        }

        return firstAllowed;
    }

    private static bool IsAllowed(Exercise exercise, IReadOnlyCollection<string>? restrictions, IReadOnlyCollection<string>? rehab)
    {
        if (restrictions is null || restrictions.Count == 0)
            return true;

        var effectiveRestrictions = restrictions;
        if (KneeSafeIds.Contains(exercise.Id) && HasKneeOrPatellarRehab(rehab))
        {
            effectiveRestrictions = restrictions
                .Where(r => !IsKneeOrPatellarTag(r))
                .ToList();
            if (effectiveRestrictions.Count == 0)
                return true;
        }

        var avoid = exercise.AvoidFor;
        if (avoid is not null && avoid.Any(a => effectiveRestrictions.Contains(a, StringComparer.OrdinalIgnoreCase)))
            return false;

        // Belt-and-braces: dependent shoulder mechanics are excluded whenever the user has
        // restricted the shoulder or rotator cuff, regardless of stored avoidFor.
        if (string.Equals(exercise.Mechanics?.Shoulder, "dependent", StringComparison.OrdinalIgnoreCase) &&
            restrictions.Any(r => IsShoulderOrRotatorCuffTag(r)))
        {
            return false;
        }

        return true;
    }

    private static bool IsLimitationActive(string limitation, IReadOnlyCollection<string>? restrictions)
    {
        if (restrictions is null || restrictions.Count == 0)
            return false;

        return limitation switch
        {
            ShoulderLimitation => restrictions.Any(IsShoulderOrRotatorCuffTag),
            KneeLimitation => restrictions.Any(IsKneeOrPatellarTag),
            LowerBackLimitation => restrictions.Any(r => string.Equals(r, "lower-back", StringComparison.OrdinalIgnoreCase)),
            _ => false
        };
    }

    internal static bool HasKneeOrPatellarRehab(IReadOnlyCollection<string>? rehab)
        => rehab is not null && rehab.Any(IsKneeOrPatellarTag);

    private static bool IsKneeOrPatellarTag(string value)
        => string.Equals(value, "knee", StringComparison.OrdinalIgnoreCase) ||
           string.Equals(value, "patellar", StringComparison.OrdinalIgnoreCase);

    private static bool IsShoulderOrRotatorCuffTag(string value)
        => string.Equals(value, "shoulder", StringComparison.OrdinalIgnoreCase) ||
           string.Equals(value, "rotator-cuff", StringComparison.OrdinalIgnoreCase);
}
