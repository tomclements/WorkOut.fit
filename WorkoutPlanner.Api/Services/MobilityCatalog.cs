using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Curated warm-up and cool-down moves selected from the muscles worked in a session.
/// Always bodyweight / no special gear so they never fail the equipment filter.
/// </summary>
public static class MobilityCatalog
{
    public sealed record Move(
        string Id,
        string Name,
        /// <summary>warmup | cooldown | both</summary>
        string Phase,
        /// <summary>Muscles this move prepares or stretches (free-db style names).</summary>
        string[] Targets,
        /// <summary>general pulse-raiser, activate (prep), stretch (cool-down).</summary>
        string Role,
        int DurationSec,
        string Cue);

    // Normalized keys used for matching primary muscles from the exercise library
    private static readonly Dictionary<string, string> MuscleNormalize = new(StringComparer.OrdinalIgnoreCase)
    {
        ["chest"] = "chest",
        ["pectorals"] = "chest",
        ["triceps"] = "triceps",
        ["shoulders"] = "shoulders",
        ["delts"] = "shoulders",
        ["deltoids"] = "shoulders",
        ["rear-shoulders"] = "shoulders",
        ["lats"] = "back",
        ["middle back"] = "back",
        ["lower back"] = "back",
        ["traps"] = "back",
        ["back"] = "back",
        ["biceps"] = "biceps",
        ["forearms"] = "forearms",
        ["quadriceps"] = "quads",
        ["quads"] = "quads",
        ["hamstrings"] = "hamstrings",
        ["glutes"] = "glutes",
        ["calves"] = "calves",
        ["adductors"] = "hips",
        ["abductors"] = "hips",
        ["hip-flexors"] = "hips",
        ["hips"] = "hips",
        ["legs"] = "quads",
        ["abdominals"] = "core",
        ["core"] = "core",
        ["obliques"] = "core",
        ["neck"] = "neck",
        ["grip"] = "forearms"
    };

    private static readonly Move[] Catalog =
    {
        // --- General pulse raisers (always first in warm-up) ---
        new("wu-march", "March in place", "warmup", Array.Empty<string>(), "general", 40,
            "Light pace, swing arms, raise heart rate gently"),
        new("wu-jacks", "Jumping jacks", "warmup", Array.Empty<string>(), "general", 40,
            "Soft landings; skip or step-jacks if joints prefer"),
        new("wu-high-knees", "High knees (easy)", "warmup", Array.Empty<string>(), "general", 35,
            "Low intensity — just get blood moving"),

        // --- Activation / dynamic prep ---
        new("wu-arm-circles", "Arm circles", "warmup", new[] { "shoulders", "chest", "back" }, "activate", 35,
            "Small to large circles, both directions"),
        new("wu-scap-pushup", "Scapular push-ups", "warmup", new[] { "chest", "shoulders", "triceps" }, "activate", 35,
            "Plank or knees: spread then squeeze shoulder blades"),
        new("wu-band-disloc", "Open-chest arm swings", "warmup", new[] { "chest", "shoulders" }, "activate", 30,
            "Cross-body then open wide; easy range"),
        new("wu-cat-cow", "Cat–cow", "warmup", new[] { "back", "core" }, "activate", 40,
            "On all fours, slow spinal flexion/extension"),
        new("wu-bird-dog", "Bird dog", "warmup", new[] { "back", "core", "glutes" }, "activate", 40,
            "Opposite arm/leg, hold 2s, brace midsection"),
        new("wu-dead-bug", "Dead bug", "warmup", new[] { "core" }, "activate", 40,
            "Low back pressed to floor; slow opposite limbs"),
        new("wu-hip-circles", "Standing hip circles", "warmup", new[] { "hips", "glutes", "quads", "hamstrings" }, "activate", 35,
            "Hands on hips, slow circles each way"),
        new("wu-leg-swings", "Leg swings", "warmup", new[] { "hamstrings", "hips", "quads", "glutes" }, "activate", 35,
            "Front-to-back then side-to-side, controlled"),
        new("wu-bw-squat", "Bodyweight squat (easy)", "warmup", new[] { "quads", "glutes", "hamstrings" }, "activate", 40,
            "Shallow to full as you warm; no load"),
        new("wu-glute-bridge", "Glute bridge", "warmup", new[] { "glutes", "hamstrings", "core" }, "activate", 35,
            "Squeeze glutes at top, no lower-back arch"),
        new("wu-calf-raise", "Calf raises", "warmup", new[] { "calves" }, "activate", 30,
            "Full ankle range, both feet"),
        new("wu-wrist-circles", "Wrist circles & open/close", "warmup", new[] { "forearms", "biceps", "triceps" }, "activate", 30,
            "Prep elbows/wrists before curling or pressing"),
        new("wu-shoulder-rolls", "Shoulder rolls", "warmup", new[] { "shoulders", "back", "neck" }, "activate", 30,
            "Slow forward and back, relax neck"),
        new("wu-torso-twist", "Standing torso twists", "warmup", new[] { "core", "back" }, "activate", 30,
            "Feet planted, gentle rotation"),

        // --- Cool-down stretches ---
        new("cd-chest-door", "Chest doorway stretch", "cooldown", new[] { "chest", "shoulders" }, "stretch", 40,
            "Elbow at 90°, lean gently; breathe 4–5 slow breaths"),
        new("cd-tricep-oh", "Overhead triceps stretch", "cooldown", new[] { "triceps", "shoulders" }, "stretch", 35,
            "Elbow to ceiling, light pressure on elbow"),
        new("cd-cross-body", "Cross-body shoulder stretch", "cooldown", new[] { "shoulders", "back" }, "stretch", 35,
            "Arm across chest, soft shoulders"),
        new("cd-child-pose", "Child’s pose", "cooldown", new[] { "back", "shoulders", "hips" }, "stretch", 45,
            "Hips to heels, arms reach forward, relax"),
        new("cd-thread-needle", "Thread the needle", "cooldown", new[] { "back", "shoulders" }, "stretch", 40,
            "On all fours, thread arm under; both sides"),
        new("cd-quad-stand", "Standing quad stretch", "cooldown", new[] { "quads", "hips" }, "stretch", 40,
            "Hold ankle, knees together, tall posture"),
        new("cd-ham-hinge", "Standing hamstring hinge", "cooldown", new[] { "hamstrings", "back" }, "stretch", 40,
            "Soft knees, hinge at hips, long spine"),
        new("cd-fig4", "Figure-4 glute stretch", "cooldown", new[] { "glutes", "hips" }, "stretch", 40,
            "Seated or lying; ankle on opposite knee"),
        new("cd-calf-wall", "Calf wall stretch", "cooldown", new[] { "calves" }, "stretch", 35,
            "Back heel down, both straight and bent knee"),
        new("cd-hip-flexor", "Half-kneeling hip flexor stretch", "cooldown", new[] { "hips", "quads" }, "stretch", 40,
            "Tuck pelvis, gentle forward shift"),
        new("cd-cobra", "Prone press-up / cobra", "cooldown", new[] { "core", "back" }, "stretch", 35,
            "Gentle extension, hips stay down"),
        new("cd-knees-chest", "Knees to chest", "cooldown", new[] { "core", "back", "glutes" }, "stretch", 40,
            "Supine hug knees, rock gently"),
        new("cd-forearm-stretch", "Forearm flexor/extensor stretch", "cooldown", new[] { "forearms", "biceps" }, "stretch", 30,
            "Arm straight, gentle palm up then palm down"),
        new("cd-neck-side", "Neck side stretch", "cooldown", new[] { "neck", "shoulders" }, "stretch", 30,
            "Ear toward shoulder, no force"),
        new("cd-breathe", "Box breathing (easy)", "cooldown", Array.Empty<string>(), "stretch", 40,
            "In 4 · hold 4 · out 4 · hold 4 — downshift nervous system"),
    };

    public static IReadOnlyList<string> NormalizeMuscles(IEnumerable<string>? primaries)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in primaries ?? Array.Empty<string>())
        {
            if (MuscleNormalize.TryGetValue(p.Trim(), out var key))
                set.Add(key);
            else if (!string.IsNullOrWhiteSpace(p))
                set.Add(p.Trim().ToLowerInvariant());
        }
        return set.ToList();
    }

    /// <summary>
    /// Rank muscles by how often they appear as primary in the working set.
    /// </summary>
    public static List<string> RankMuscles(IEnumerable<PlanExercise> workExercises)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var ex in workExercises)
        {
            foreach (var m in NormalizeMuscles(ex.Primary))
            {
                counts.TryGetValue(m, out var c);
                counts[m] = c + 1;
            }
        }
        return counts
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => kv.Key)
            .ToList();
    }

    public static List<PlanExercise> BuildWarmup(IReadOnlyList<string> rankedMuscles, Random rng, int budgetSec = 180)
    {
        var picks = new List<Move>();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // 1) General pulse raiser
        var generals = Catalog.Where(m => (m.Phase is "warmup" or "both") && m.Role == "general").ToList();
        if (generals.Count > 0)
        {
            var g = generals[rng.Next(generals.Count)];
            picks.Add(g);
            used.Add(g.Id);
        }

        // 2) Muscle-specific activation (up to ~3)
        var activators = Catalog
            .Where(m => (m.Phase is "warmup" or "both") && m.Role == "activate")
            .OrderByDescending(m => ScoreTargets(m.Targets, rankedMuscles))
            .ThenBy(_ => rng.Next())
            .ToList();

        foreach (var m in activators)
        {
            if (picks.Count >= 4) break;
            if (used.Contains(m.Id)) continue;
            if (m.Targets.Length > 0 && ScoreTargets(m.Targets, rankedMuscles) <= 0
                && rankedMuscles.Count > 0)
            {
                // Still allow one general activation if no muscle match later
                continue;
            }
            if (m.Targets.Length > 0 && ScoreTargets(m.Targets, rankedMuscles) <= 0)
                continue;
            picks.Add(m);
            used.Add(m.Id);
        }

        // Fallback activations if day muscles were empty or unmatched
        if (picks.Count < 3)
        {
            foreach (var m in activators)
            {
                if (picks.Count >= 3) break;
                if (used.Contains(m.Id)) continue;
                picks.Add(m);
                used.Add(m.Id);
            }
        }

        return FitBudget(picks, budgetSec, "warmup");
    }

    public static List<PlanExercise> BuildCooldown(IReadOnlyList<string> rankedMuscles, Random rng, int budgetSec = 120)
    {
        var stretches = Catalog
            .Where(m => (m.Phase is "cooldown" or "both") && m.Role == "stretch")
            .OrderByDescending(m => ScoreTargets(m.Targets, rankedMuscles))
            .ThenBy(_ => rng.Next())
            .ToList();

        var picks = new List<Move>();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var m in stretches)
        {
            if (picks.Count >= 3) break;
            if (used.Contains(m.Id)) continue;
            // Prefer targeted stretches; allow general breathing last
            if (m.Targets.Length > 0 && ScoreTargets(m.Targets, rankedMuscles) <= 0 && rankedMuscles.Count > 0)
                continue;
            picks.Add(m);
            used.Add(m.Id);
        }

        // Always try to end with breathing if room
        var breathe = Catalog.FirstOrDefault(m => m.Id == "cd-breathe");
        if (breathe != null && !used.Contains(breathe.Id) && picks.Count < 3)
            picks.Add(breathe);

        if (picks.Count == 0)
        {
            foreach (var m in stretches.Take(2))
                picks.Add(m);
        }

        return FitBudget(picks, budgetSec, "cooldown");
    }

    private static int ScoreTargets(string[] targets, IReadOnlyList<string> ranked)
    {
        if (targets.Length == 0) return 0;
        int score = 0;
        for (int i = 0; i < ranked.Count; i++)
        {
            if (targets.Any(t => t.Equals(ranked[i], StringComparison.OrdinalIgnoreCase)))
                score += Math.Max(1, 10 - i); // higher weight for top muscles
        }
        return score;
    }

    private static List<PlanExercise> FitBudget(List<Move> picks, int budgetSec, string phase)
    {
        var result = new List<PlanExercise>();
        int used = 0;
        foreach (var m in picks)
        {
            if (used + m.DurationSec > budgetSec + 25 && result.Count >= 2)
                break;
            result.Add(ToPlanExercise(m, phase));
            used += m.DurationSec + 10; // small transition
        }
        return result;
    }

    private static PlanExercise ToPlanExercise(Move m, string phase) => new()
    {
        Id = m.Id,
        Name = m.Name,
        Slot = phase,
        Phase = phase,
        Sets = 1,
        RepsDisplay = $"{m.DurationSec}s",
        Rest = 10,
        WorkDuration = m.DurationSec,
        IsTimeBased = true,
        Primary = m.Targets.Length > 0 ? m.Targets.ToList() : new List<string> { "full body" },
        Progression = m.Cue,
        DemoUrl = "https://www.youtube.com/results?search_query=" +
                  Uri.EscapeDataString(m.Name + " exercise mobility")
    };
}
