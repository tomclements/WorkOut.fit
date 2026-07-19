using System.Text.RegularExpressions;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Canonical rules for classifying exercises used by import, seed repair, and planning.
///
/// ## Slots (movement patterns — drive PPL / upper-lower / full-body scheduling)
/// - <c>push</c>  — chest, front/side delts, triceps (pressing / pushing)
/// - <c>pull</c>  — back, rear delts, biceps, traps, forearms, neck (pulling / curling)
/// - <c>legs</c>  — quads, hams, glutes, calves, hips; also olympic lifts &amp; burpees
/// - <c>core</c>  — abs, obliques, lower-back isolation, mountain climbers
/// - <c>carry</c> — loaded carries (farmer's, suitcase)
///
/// We do <b>not</b> use a catch-all <c>total</c> slot. Full-body sessions pick across
/// push/pull/legs/core instead of dumping "misc" moves into every day.
///
/// ## Equipment
/// Required gear is an AND list: the user must have every listed item.
/// free-exercise-db often under-specifies (e.g. incline curl → "dumbbell" only);
/// name heuristics add bench, stability-ball, pull-up bar, etc.
/// </summary>
public static class ExerciseTaxonomy
{
    public static readonly string[] CanonicalSlots = { "push", "pull", "legs", "core", "carry" };

    private static readonly Dictionary<string, string> PrimaryToSlot = new(StringComparer.OrdinalIgnoreCase)
    {
        ["chest"] = "push",
        ["triceps"] = "push",
        ["shoulders"] = "push",
        ["rear-shoulders"] = "pull",
        ["lats"] = "pull",
        ["biceps"] = "pull",
        ["middle back"] = "pull",
        ["traps"] = "pull",
        ["forearms"] = "pull",
        ["neck"] = "pull",
        ["back"] = "pull",
        ["quadriceps"] = "legs",
        ["hamstrings"] = "legs",
        ["calves"] = "legs",
        ["glutes"] = "legs",
        ["adductors"] = "legs",
        ["abductors"] = "legs",
        ["hip-flexors"] = "legs",
        ["legs"] = "legs",
        ["abdominals"] = "core",
        ["core"] = "core",
        ["obliques"] = "core",
        ["lower back"] = "core",
        ["grip"] = "carry"
    };

    /// <summary>Map free-exercise-db equipment strings to our catalog ids.</summary>
    public static readonly Dictionary<string, string[]> SourceEquipmentMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["body only"] = new[] { "bodyweight" },
        ["none"] = new[] { "bodyweight" },
        ["dumbbell"] = new[] { "dumbbells" },
        ["barbell"] = new[] { "barbell" },
        ["kettlebells"] = new[] { "kettlebell" },
        ["cable"] = new[] { "cable" },
        ["machine"] = new[] { "machines" },
        ["bands"] = new[] { "bands" },
        ["medicine ball"] = new[] { "medicine-ball" },
        ["exercise ball"] = new[] { "stability-ball" },
        ["e-z curl bar"] = new[] { "ez-bar" },
        ["foam roll"] = new[] { "foam-roller" }
        // "other" intentionally omitted — handled via name enrichment
    };

    public static string NormalizeForce(string? force) => force?.ToLowerInvariant() switch
    {
        "push" => "push",
        "pull" => "pull",
        "static" => "static",
        _ => "unknown"
    };

    public static string NormalizeMechanic(string? mechanic) => mechanic?.ToLowerInvariant() switch
    {
        "compound" => "compound",
        "isolation" => "isolation",
        _ => "unknown"
    };

    public static string InferSlot(IEnumerable<string>? primaryMuscles, string? force, string? name = null)
    {
        var primary = (primaryMuscles ?? Array.Empty<string>()).ToList();
        var n = (name ?? "").ToLowerInvariant();

        // Name-first for clear patterns
        if (Regex.IsMatch(n, @"farmer.?s?\s*carry|suitcase\s*carry|yoke\s*walk|loaded\s*carry"))
            return "carry";
        if (Regex.IsMatch(n, @"mountain\s*climber"))
            return "core";
        if (Regex.IsMatch(n, @"\bburpee"))
            return "legs";
        if (Regex.IsMatch(n, @"clean|snatch|jerk|thruster"))
            return "legs"; // olympic / power — legs & hips drive

        foreach (var m in primary)
        {
            if (PrimaryToSlot.TryGetValue(m, out var slot))
                return slot;
        }

        // Force as fallback (free-exercise-db force field)
        return force?.ToLowerInvariant() switch
        {
            "push" => "push",
            "pull" => "pull",
            "static" when primary.Any(p => p.Contains("abdom", StringComparison.OrdinalIgnoreCase)
                                            || p.Contains("oblique", StringComparison.OrdinalIgnoreCase)) => "core",
            "static" => "core",
            _ => "core" // safer than a catch-all "total" that matches every day
        };
    }

    public static List<string>? MapSourceEquipment(string? sourceEquipment)
    {
        if (string.IsNullOrWhiteSpace(sourceEquipment)) return null;
        if (string.Equals(sourceEquipment, "other", StringComparison.OrdinalIgnoreCase))
            return new List<string>(); // name enrichment will fill in
        return SourceEquipmentMap.TryGetValue(sourceEquipment, out var mapped)
            ? mapped.ToList()
            : null;
    }

    /// <summary>
    /// Infer required equipment from the exercise name. Returns a sorted, de-duplicated list.
    /// </summary>
    public static List<string> EnrichEquipmentFromName(string name, IEnumerable<string>? existing = null)
    {
        var eq = new HashSet<string>(existing ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        var n = name.ToLowerInvariant();

        // --- Implements / surfaces ---
        if (ContainsAny(n, "exercise ball", "stability ball", "swiss ball", "physio ball", "bosu"))
            eq.Add("stability-ball");

        if (n.Contains("medicine ball"))
            eq.Add("medicine-ball");

        if (Regex.IsMatch(n, @"pull[ -]?up|chin[ -]?up|pullup|chinup"))
            eq.Add("pullup-bar");

        if (n.Contains("cable"))
            eq.Add("cable");

        if (ContainsAny(n, "smith", "leg press", "hack squat", "chest press machine", "pec deck", "lat pulldown machine"))
            eq.Add("machines");

        if (n.Contains("kettlebell"))
            eq.Add("kettlebell");

        if (ContainsAny(n, "barbell", "ez-bar", "ez bar", "olympic bar", "trap bar", "hex bar"))
            eq.Add("barbell");

        if (n.Contains("dumbbell"))
            eq.Add("dumbbells");

        if (Regex.IsMatch(n, @"\bbands?\b") || n.Contains("band "))
            eq.Add("bands");

        if (ContainsAny(n, "foam roll", "foam roller") || n.Contains("smr"))
            eq.Add("foam-roller");

        // Bench / incline surface (very common under-tag in free-exercise-db)
        if (NeedsBench(n))
            eq.Add("bench");

        // Preacher / spider often need a bench or preacher pad — model as bench
        if (ContainsAny(n, "preacher", "spider curl"))
            eq.Add("bench");

        if (eq.Count == 0)
            eq.Add("bodyweight");

        return eq.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static bool NeedsBench(string n)
    {
        // Any incline/decline strength pattern
        if (Regex.IsMatch(n, @"\b(incline|decline)\b"))
        {
            // Almost all incline/decline lifts need a bench or elevated pad
            if (Regex.IsMatch(n, @"curl|press|fly|row|raise|push[ -]?up|sit[ -]?up|crunch|triceps|extension|kickback|chest|bench|prone|hammer"))
                return true;
            // "over incline bench", "against an incline"
            if (n.Contains("bench") || n.Contains("incline bench"))
                return true;
        }

        if (Regex.IsMatch(n, @"\bbench\b") &&
            Regex.IsMatch(n, @"press|fly|dip|pull|row|crunch|sit|curl|kickback|extension|pullover"))
            return true;

        if (ContainsAny(n, "flat bench", "on a bench", "lying on bench", "seated on bench"))
            return true;

        return false;
    }

    private static bool ContainsAny(string haystack, params string[] needles) =>
        needles.Any(haystack.Contains);

    /// <summary>Apply full taxonomy normalization to an exercise in-place.</summary>
    public static void Reclassify(Exercise ex, string? sourceForce = null, string? sourceMechanic = null)
    {
        if (!string.IsNullOrWhiteSpace(sourceForce))
            ex.Force = NormalizeForce(sourceForce);
        else if (string.IsNullOrWhiteSpace(ex.Force) || ex.Force == "unknown")
            ex.Force = InferForceFromName(ex.Name, ex.Slot);

        if (!string.IsNullOrWhiteSpace(sourceMechanic))
            ex.Mechanic = NormalizeMechanic(sourceMechanic);
        else if (string.IsNullOrWhiteSpace(ex.Mechanic))
            ex.Mechanic = "unknown";
        else
            ex.Mechanic = NormalizeMechanic(ex.Mechanic);

        ex.Equipment = EnrichEquipmentFromName(ex.Name, ex.Equipment);
        ex.Slot = InferSlot(ex.Primary, ex.Force, ex.Name);
    }

    private static string InferForceFromName(string name, string? slot)
    {
        if (string.Equals(slot, "push", StringComparison.OrdinalIgnoreCase)) return "push";
        if (string.Equals(slot, "pull", StringComparison.OrdinalIgnoreCase)) return "pull";
        var n = name.ToLowerInvariant();
        if (Regex.IsMatch(n, @"press|push|fly|dip|extension")) return "push";
        if (Regex.IsMatch(n, @"row|pull|chin|curl|lat |face pull")) return "pull";
        return "unknown";
    }

    public static bool IsCanonicalSlot(string? slot) =>
        CanonicalSlots.Contains(slot ?? "", StringComparer.OrdinalIgnoreCase);
}
