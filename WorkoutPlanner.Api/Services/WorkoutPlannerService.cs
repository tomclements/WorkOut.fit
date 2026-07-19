using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public class WorkoutPlannerService : IWorkoutPlannerService
{
    private readonly IServiceScopeFactory _scopeFactory;

    private static readonly string[] DayNames =
    {
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    };

    private static readonly Dictionary<int, int[]> DayPatterns = new()
    {
        [1] = new[] { 2 },
        [2] = new[] { 0, 3 },
        [3] = new[] { 0, 2, 4 },
        [4] = new[] { 0, 1, 3, 4 },
        [5] = new[] { 0, 1, 2, 4, 5 },
        [6] = new[] { 0, 1, 2, 3, 4, 5 },
        [7] = new[] { 0, 1, 2, 3, 4, 5, 6 }
    };

    /// <summary>
    /// Maps bro-split focus keys to primary muscle names in the exercise catalog.
    /// </summary>
    private static readonly Dictionary<string, HashSet<string>> BroFocusMuscles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["chest"] = new(StringComparer.OrdinalIgnoreCase) { "chest" },
        ["back"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "lats", "middle back", "traps", "lower back", "back"
        },
        ["legs"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "quadriceps", "hamstrings", "glutes", "calves", "legs",
            "adductors", "abductors", "hip-flexors"
        },
        ["shoulders"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "shoulders", "rear-shoulders"
        },
        ["arms"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "biceps", "triceps", "forearms"
        },
        ["core"] = new(StringComparer.OrdinalIgnoreCase)
        {
            "abdominals", "core", "obliques"
        }
    };

    public WorkoutPlannerService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<PlanResponse> GeneratePlan(PlanRequest req)
    {
        int weeks = Math.Clamp(req.Weeks, 1, 12);
        int daysPerWeek = Math.Clamp(req.DaysPerWeek, 1, 7);
        int sessionMinutes = Math.Clamp(req.SessionMinutes, 5, 90);
        var selectedEquipment = req.Equipment ?? new List<string>();
        // Split and goal are independent: never treat goal as a split type.
        string goal = NormalizeGoal(req.Goal);
        string split = NormalizeSplit(req.Split);
        string progression = NormalizeProgression(req.Progression);
        int userLevelNum = LevelToNum(req.Level);
        var favoriteIds = new HashSet<string>(req.FavoriteExerciseIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
        var dislikedIds = new HashSet<string>(req.DislikedExerciseIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
        var avoidIds = new HashSet<string>(req.AvoidExerciseIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
        // Dislikes are also soft-avoided for variety / preference
        foreach (var id in dislikedIds) avoidIds.Add(id);

        // Fresh seed each generation when client sends 0 / omits it
        int seed = req.Seed != 0 ? req.Seed : Random.Shared.Next(1, int.MaxValue);
        var rng = new Random(seed);

        var workoutIndices = req.WorkoutDays?.Count > 0
            ? req.WorkoutDays.Distinct().OrderBy(d => d).Where(d => d >= 0 && d <= 6).ToArray()
            : DayPatterns[daysPerWeek];
        // Bro split days-per-week should match selected workout days when provided
        int effectiveDays = workoutIndices.Length > 0 ? workoutIndices.Length : daysPerWeek;
        int reserved = (req.IncludeWarmup ? 3 : 0) + (req.IncludeCooldown ? 2 : 0);
        int targetTime = Math.Max(5, sessionMinutes - reserved) * 60;

        using var scope = _scopeFactory.CreateScope();
        await using var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var exercises = await db.Exercises.AsNoTracking().ToListAsync();

        var plan = new List<WeekPlan>();
        // Soft-avoid exercises used recently in this plan so weeks don't clone each other
        var planWideRecent = new List<string>();
        // Merge client avoid-list (previous plan) with in-plan variety
        var dynamicAvoid = new HashSet<string>(avoidIds, StringComparer.OrdinalIgnoreCase);

        for (int w = 1; w <= weeks; w++)
        {
            var mods = GetWeekProgression(progression, w, weeks, goal);
            var workoutDays = new List<DayPlan>();
            for (int i = 0; i < workoutIndices.Length; i++)
            {
                int dayIdx = workoutIndices[i];
                var (focusLabel, slotOrder) = GetSessionTemplate(split, dayIdx, i, effectiveDays, rng);
                var session = BuildSession(dayIdx, w, i + 1, targetTime, selectedEquipment,
                    userLevelNum, goal, split, focusLabel, slotOrder, exercises, planWideRecent, favoriteIds, dislikedIds,
                    req.IncludeWarmup, req.IncludeCooldown, req.Restrictions, mods, rng, dynamicAvoid);

                foreach (var id in session.Exercises.Select(e => e.Id))
                {
                    planWideRecent.Add(id);
                    dynamicAvoid.Add(id);
                }
                // Keep plan-wide memory bounded so we don't exhaust the pool on long plans
                while (planWideRecent.Count > Math.Max(12, effectiveDays * 4))
                {
                    var drop = planWideRecent[0];
                    planWideRecent.RemoveAt(0);
                    // Only drop from dynamicAvoid if it wasn't in the original client avoid list
                    if (!avoidIds.Contains(drop) && !planWideRecent.Contains(drop))
                        dynamicAvoid.Remove(drop);
                }

                workoutDays.Add(session);
            }

            var fullDays = new List<DayPlan>();
            int wi = 0;
            for (int d = 0; d < 7; d++)
            {
                if (wi < workoutDays.Count && workoutDays[wi].DayIndex == d)
                {
                    fullDays.Add(workoutDays[wi]);
                    wi++;
                }
                else
                {
                    fullDays.Add(new DayPlan
                    {
                        Type = "rest",
                        DayIndex = d,
                        Day = DayNames[d],
                        Note = mods.Phase == "deload"
                            ? "Rest / light mobility — recovery week"
                            : "Rest / mobility"
                    });
                }
            }

            plan.Add(new WeekPlan
            {
                Week = w,
                Phase = mods.Phase,
                PhaseLabel = mods.PhaseLabel,
                FocusNote = mods.FocusNote,
                Days = fullDays
            });
        }

        req.Progression = progression;
        req.Split = split;
        req.Goal = goal;
        req.Seed = seed;
        return new PlanResponse
        {
            Criteria = req,
            Plan = plan,
            GeneratedAt = DateTime.UtcNow.ToString("O"),
            ProgressionSummary = BuildProgressionSummary(progression, weeks, goal)
        };
    }

    private DayPlan BuildSession(int dayIdx, int week, int dayNumber, int targetTime,
        List<string> equipment, int userLevelNum, string goal, string split, string focusLabel, List<string> slotOrder,
        List<Exercise> allExercises, List<string> planWideRecent, HashSet<string> favoriteIds, HashSet<string> dislikedIds,
        bool includeWarmup, bool includeCooldown,
        List<string> restrictions, WeekProgression mods, Random rng, HashSet<string> avoidIds)
    {
        var pool = allExercises
            .Where(e => LevelToNum(e.Level) <= userLevelNum && HasEquipment(e, equipment) && !IsRestricted(e, restrictions))
            .ToList();

        bool isBro = split == "bro-split";
        var session = new DayPlan
        {
            Type = "workout",
            DayIndex = dayIdx,
            Day = DayNames[dayIdx],
            Focus = string.IsNullOrWhiteSpace(focusLabel)
                ? string.Join(" / ", slotOrder.Select(Capitalize))
                : focusLabel,
            Exercises = new List<PlanExercise>()
        };

        var usedToday = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int timeUsed = 0;
        const int transition = 30;

        foreach (var slot in slotOrder)
        {
            bool MatchesSlot(Exercise e) =>
                split == "full-body"
                || (isBro && MatchesBroFocus(e, slot))
                // Slot must match the scheduled movement pattern (no catch-all "total")
                || (!isBro && string.Equals(e.Slot, slot, StringComparison.OrdinalIgnoreCase));

            var candidates = pool
                .Where(e => MatchesSlot(e) && !usedToday.Contains(e.Id))
                .ToList();

            // Prefer never using disliked exercises when alternatives exist
            var withoutDisliked = candidates.Where(e => !dislikedIds.Contains(e.Id)).ToList();
            if (withoutDisliked.Count > 0)
                candidates = withoutDisliked;

            // Bro body-part days: stick to primary-muscle matches when we have enough options
            if (isBro && BroFocusMuscles.ContainsKey(slot) &&
                !slot.Equals("core", StringComparison.OrdinalIgnoreCase))
            {
                var primaryHits = candidates
                    .Where(e => e.Primary.Any(p => BroFocusMuscles[slot].Contains(p)))
                    .ToList();
                if (primaryHits.Count >= 2)
                    candidates = primaryHits;
            }

            if (candidates.Count == 0) continue;

            var ex = PickWeightedExercise(candidates, favoriteIds, avoidIds, planWideRecent, isBro, slot, rng);
            if (ex == null) continue;

            int sets = ComputeSets(ex, goal, userLevelNum, isBro, mods);
            string reps = ComputeReps(ex, goal, mods);
            int rest = ComputeRest(ex, goal, mods);
            int exerciseDuration = sets * (ex.WorkDuration + rest) + transition;

            // Bro split tolerates slightly fuller sessions (high per-muscle volume)
            int softLimit = isBro ? targetTime + 90 : targetTime + 60;
            int hardSkip = isBro ? targetTime + 150 : targetTime + 120;
            int minExercises = isBro ? 4 : 3;

            if (timeUsed + exerciseDuration > softLimit)
            {
                if (session.Exercises.Count >= minExercises) break;
                if (timeUsed + exerciseDuration > hardSkip) continue;
            }

            session.Exercises.Add(new PlanExercise
            {
                Id = ex.Id,
                Name = ex.Name,
                Slot = ex.Slot,
                Phase = "work",
                Sets = sets,
                RepsDisplay = reps,
                Rest = rest,
                WorkDuration = ex.WorkDuration,
                IsTimeBased = ex.IsTimeBased,
                Primary = ex.Primary,
                Progression = ProgressionHint(goal, week, isBro, mods),
                DemoUrl = !string.IsNullOrWhiteSpace(ex.DemoUrl)
                    ? ex.DemoUrl
                    : ExRxCatalog.GetUrl(ex.Id, ex.Name),
                ImageUrl = ex.ImageUrl,
                // Prebuilt animated WebP when the exercise has free-exercise-db stills
                DemoAnimUrl = !string.IsNullOrWhiteSpace(ex.ImageUrl)
                    ? $"/demos/{ex.Id}.webp"
                    : null
            });
            usedToday.Add(ex.Id);
            timeUsed += exerciseDuration;
        }

        // No main lifts → empty session (do not pad with mobility alone)
        if (session.Exercises.Count == 0)
        {
            session.EstimatedMinutes = 0;
            return session;
        }

        // Muscle-aware warm-up / cool-down based on what this session actually trains
        var rankedMuscles = MobilityCatalog.RankMuscles(session.Exercises);
        // Bro-split: merge body-part focus tags when the work set is thin
        if (isBro)
        {
            var fromFocus = new List<string>();
            foreach (var focus in slotOrder)
            {
                if (BroFocusMuscles.TryGetValue(focus, out var muscles))
                    fromFocus.AddRange(muscles);
            }
            if (fromFocus.Count > 0)
            {
                var merged = MobilityCatalog.NormalizeMuscles(fromFocus)
                    .Concat(rankedMuscles)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                // Prefer frequency ranking from work lifts first, then focus leftovers
                rankedMuscles = rankedMuscles
                    .Concat(merged.Where(m => !rankedMuscles.Contains(m, StringComparer.OrdinalIgnoreCase)))
                    .ToList();
            }
        }

        var ordered = new List<PlanExercise>();
        int mobilityTime = 0;

        if (includeWarmup)
        {
            var warmup = MobilityCatalog.BuildWarmup(rankedMuscles, rng, budgetSec: 180);
            foreach (var m in warmup)
            {
                ordered.Add(m);
                mobilityTime += m.WorkDuration + m.Rest;
            }
        }

        ordered.AddRange(session.Exercises);

        if (includeCooldown)
        {
            var cooldown = MobilityCatalog.BuildCooldown(rankedMuscles, rng, budgetSec: 120);
            foreach (var m in cooldown)
            {
                ordered.Add(m);
                mobilityTime += m.WorkDuration + m.Rest;
            }
        }

        session.Exercises = ordered;
        session.EstimatedMinutes = (int)Math.Round((timeUsed + mobilityTime) / 60.0);

        return session;
    }

    /// <summary>
    /// Weighted random pick: favorites get a boost, recently used / avoided get a penalty.
    /// Still allows avoided items if the pool is thin so sessions never go empty.
    /// </summary>
    private static Exercise? PickWeightedExercise(
        List<Exercise> candidates,
        HashSet<string> favoriteIds,
        HashSet<string> avoidIds,
        List<string> planWideRecent,
        bool isBro,
        string slot,
        Random rng)
    {
        if (candidates.Count == 0) return null;
        if (candidates.Count == 1) return candidates[0];

        var recentSet = new HashSet<string>(planWideRecent.TakeLast(24), StringComparer.OrdinalIgnoreCase);
        var weights = new int[candidates.Count];
        int total = 0;

        for (int i = 0; i < candidates.Count; i++)
        {
            var e = candidates[i];
            int w = 10;

            if (favoriteIds.Contains(e.Id)) w += 12;
            if (avoidIds.Contains(e.Id)) w -= 10;
            if (recentSet.Contains(e.Id)) w -= 6;

            // Small quality nudge — not enough to dominate randomness
            if (isBro)
                w += Math.Min(3, BroMuscleMatchScore(e, slot));
            else
                w += Math.Min(2, e.Primary.Count);

            // Keep every candidate in play at least a little
            w = Math.Max(1, w);
            weights[i] = w;
            total += w;
        }

        int roll = rng.Next(total);
        for (int i = 0; i < candidates.Count; i++)
        {
            roll -= weights[i];
            if (roll < 0) return candidates[i];
        }

        return candidates[^1];
    }

    private static bool MatchesBroFocus(Exercise ex, string focus)
    {
        if (string.IsNullOrWhiteSpace(focus)) return true;
        if (!BroFocusMuscles.TryGetValue(focus, out var muscles)) return false;

        // Prefer primary-muscle alignment (true body-part days)
        if (ex.Primary.Any(p => muscles.Contains(p))) return true;

        // Allow secondary hits so isolation work can still fill a session
        if (ex.Secondary.Any(p => muscles.Contains(p))) return true;

        // Core catalog often uses slot rather than primary muscle tags
        if (focus.Equals("core", StringComparison.OrdinalIgnoreCase) &&
            ex.Slot.Equals("core", StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static int BroMuscleMatchScore(Exercise ex, string focus)
    {
        if (!BroFocusMuscles.TryGetValue(focus, out var muscles)) return 0;
        int primaryHits = ex.Primary.Count(p => muscles.Contains(p));
        int secondaryHits = ex.Secondary.Count(p => muscles.Contains(p));
        // Primary matches rank well above secondary-only hits
        return primaryHits * 10 + secondaryHits;
    }

    /// <summary>
    /// User must have every piece of equipment the exercise requires.
    /// Empty exercise equipment is treated as bodyweight-only.
    /// </summary>
    private static bool HasEquipment(Exercise ex, List<string> selected)
    {
        if (selected == null || selected.Count == 0) return false;
        var required = (ex.Equipment == null || ex.Equipment.Count == 0)
            ? new List<string> { "bodyweight" }
            : ex.Equipment;
        return required.All(eq => selected.Contains(eq, StringComparer.OrdinalIgnoreCase));
    }

    private static bool IsRestricted(Exercise ex, List<string> restrictions)
    {
        if (restrictions == null || restrictions.Count == 0) return false;
        return ex.AvoidFor.Any(a => restrictions.Contains(a, StringComparer.OrdinalIgnoreCase));
    }

    private static int LevelToNum(string? level) => level?.ToLowerInvariant() switch
    {
        "intermediate" => 2,
        "advanced" => 3,
        _ => 1
    };

    private static string Capitalize(string s) =>
        string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s[1..];

    private sealed record WeekProgression(
        string Phase,
        string PhaseLabel,
        string FocusNote,
        int SetDelta,
        int RepDelta,
        int RestDelta);

    private static string NormalizeProgression(string? progression) => progression?.ToLowerInvariant() switch
    {
        "none" or "flat" or "off" => "none",
        "wave" or "undulating" or "daily undulating" => "wave",
        "block" or "periodized" or "periodization" => "block",
        "linear" or "progressive" or "standard" => "linear",
        _ => "linear"
    };

    /// <summary>
    /// Maps each week to a training phase with set/rep/rest modifiers.
    /// </summary>
    private static WeekProgression GetWeekProgression(string progression, int week, int totalWeeks, string goal)
    {
        if (progression == "none" || totalWeeks <= 1)
        {
            return new WeekProgression(
                "base",
                "Steady week",
                "Keep effort consistent. Focus on solid form rather than chasing numbers.",
                0, 0, 0);
        }

        if (progression == "wave")
        {
            // Alternate volume (odd) and intensity (even); final week deload if 4+ weeks
            if (totalWeeks >= 4 && week == totalWeeks)
                return DeloadWeek(goal);

            bool volumeWeek = week % 2 == 1;
            if (volumeWeek)
            {
                return new WeekProgression(
                    "volume",
                    "Volume week",
                    "More sets, moderate weight. Leave 2–3 reps in reserve on most sets.",
                    SetDelta: 1,
                    RepDelta: goal == "strength" ? 1 : 2,
                    RestDelta: -5);
            }

            return new WeekProgression(
                "intensity",
                "Intensity week",
                "Slightly fewer reps, push closer to your limit (about 1 rep left in the tank). Rest a bit longer.",
                SetDelta: 0,
                RepDelta: goal == "strength" ? -1 : 0,
                RestDelta: 15);
        }

        if (progression == "block")
        {
            // Thirds: accumulate → intensify → peak/deload
            double t = (double)week / totalWeeks;
            if (t <= 0.4)
            {
                int build = Math.Min(2, (week - 1) / Math.Max(1, totalWeeks / 4));
                return new WeekProgression(
                    "build",
                    "Build block",
                    "Accumulate work capacity: more volume, controlled effort. Master technique.",
                    SetDelta: 1 + build / 2,
                    RepDelta: 1 + build,
                    RestDelta: 0);
            }
            if (t <= 0.75)
            {
                return new WeekProgression(
                    "peak",
                    "Intensify block",
                    "Heavier relative effort, slightly lower reps. Progress load when form stays crisp.",
                    SetDelta: goal == "strength" ? 1 : 0,
                    RepDelta: goal == "strength" ? -1 : 0,
                    RestDelta: 20);
            }
            if (week == totalWeeks || t > 0.9)
                return DeloadWeek(goal);

            return new WeekProgression(
                "peak",
                "Peak week",
                "Quality over quantity. Hit strong sets, then stop before form breaks down.",
                SetDelta: 0,
                RepDelta: goal == "endurance" || goal == "fat-loss" ? 1 : -1,
                RestDelta: 25);
        }

        // linear (default): ramp up; deload every 4th week and on the final week of 5+ week plans
        bool isDeload = (week > 1 && week % 4 == 0) || (totalWeeks >= 5 && week == totalWeeks);
        if (isDeload)
            return DeloadWeek(goal);

        int step = week - 1 - (week / 4); // don't count deload weeks as hard progression steps
        step = Math.Max(0, step);
        string label = week == 1 ? "Foundation week" : "Build week";
        string note = week == 1
            ? "Establish baseline weights you can control. Leave 2–3 reps in reserve."
            : "Nudge difficulty: add a little weight, an extra rep, or keep the same load feeling smoother.";

        return new WeekProgression(
            week == 1 ? "base" : "build",
            label,
            note,
            SetDelta: Math.Min(2, step / 2 + ((goal is "strength" or "hypertrophy") && step > 0 ? 1 : 0)),
            RepDelta: Math.Min(3, step),
            RestDelta: goal == "strength" ? Math.Min(20, step * 5) : 0);
    }

    private static WeekProgression DeloadWeek(string goal) =>
        new(
            "deload",
            "Recovery (deload)",
            "Reduce volume and effort (~60% of a hard week). Sleep, mobility, and easy movement count. Come back fresh next week.",
            SetDelta: -1,
            RepDelta: goal == "strength" ? 1 : -1,
            RestDelta: 10);

    private static string BuildProgressionSummary(string progression, int weeks, string goal)
    {
        string goalWord = goal switch
        {
            "strength" => "getting stronger",
            "hypertrophy" => "building muscle",
            "endurance" => "building endurance",
            "fat-loss" => "fat loss and conditioning",
            _ => "your goal"
        };

        return progression switch
        {
            "none" =>
                $"Steady plan for {weeks} week{(weeks == 1 ? "" : "s")} focused on {goalWord}. Difficulty stays similar each week so you can practice consistency.",
            "wave" =>
                $"Wave progression for {weeks} week{(weeks == 1 ? "" : "s")}: alternate higher-volume and higher-intensity weeks for {goalWord}." +
                (weeks >= 4 ? " The last week is a lighter recovery week." : ""),
            "block" =>
                $"Block periodization for {weeks} week{(weeks == 1 ? "" : "s")}: build capacity first, then intensify, then ease off. Tuned for {goalWord}.",
            _ =>
                $"Linear progression for {weeks} week{(weeks == 1 ? "" : "s")}: gradually harder training for {goalWord}, with planned recovery (deload) weeks so you don’t burn out."
        };
    }

    private static int ComputeSets(Exercise ex, string goal, int userLevelNum, bool broSplit, WeekProgression mods)
    {
        int sets = ex.BaseSets;
        if (goal == "strength") sets += 1;
        if (goal == "endurance" || goal == "fat-loss") sets = Math.Max(2, sets - 1);
        // Bro split: higher per-session volume for the trained body part
        if (broSplit && (goal == "hypertrophy" || goal == "strength") && mods.Phase != "deload") sets += 1;
        if (userLevelNum >= 3 && mods.Phase != "deload") sets += 1;
        sets += mods.SetDelta;
        int maxSets = broSplit ? 6 : 5;
        if (mods.Phase == "deload") maxSets = 4;
        return Math.Clamp(sets, 1, maxSets);
    }

    private static string ComputeReps(Exercise ex, string goal, WeekProgression mods)
    {
        int min = ex.RepsMin;
        int max = ex.RepsMax;

        switch (goal)
        {
            case "strength":
                min = Math.Max(3, min - 4);
                max = Math.Max(min + 1, max - 4);
                break;
            case "hypertrophy":
                min = Math.Max(6, min);
                max = Math.Max(min + 2, max);
                break;
            case "endurance":
            case "fat-loss":
                min += 2;
                max += 4;
                break;
        }

        min = Math.Max(1, min + mods.RepDelta);
        max = Math.Max(min + 1, max + mods.RepDelta);

        return ex.IsTimeBased ? $"{min}-{max} sec" : $"{min}-{max}";
    }

    private static int ComputeRest(Exercise ex, string goal, WeekProgression mods)
    {
        int r = ex.RestSec;
        if (goal == "strength") r += 30;
        else if (goal == "endurance" || goal == "fat-loss") r = Math.Max(20, r - 30);
        else if (goal == "hypertrophy") r = Math.Max(30, r - 15);
        r += mods.RestDelta;
        return Math.Clamp(r, 20, 300);
    }

    private static string ProgressionHint(string goal, int week, bool broSplit, WeekProgression mods)
    {
        if (mods.Phase == "deload")
            return "Deload: use lighter loads (~60% effort). Stop well short of failure and prioritize recovery.";

        if (week == 1 || mods.Phase == "base")
            return broSplit
                ? "Body-part day: quality volume on this muscle group; leave 1–2 reps in reserve."
                : "Learn the movement; use a weight you can control with good form.";

        if (mods.Phase is "intensity" or "peak")
            return goal == "strength"
                ? "Intensity focus: if last week felt solid, add a small amount of weight. Rest fully between hard sets."
                : "Push quality sets near the top of the rep range, but stop if form slips.";

        if (goal == "strength")
            return "If you completed all sets last week cleanly, add a small amount of weight.";
        if (goal == "endurance" || goal == "fat-loss")
            return "Aim for the top of the rep range or keep rest short while staying controlled.";
        if (broSplit)
            return "Chase a strong pump with controlled form; add reps or a small load when the top of the range feels easy.";
        return "Add reps, a set, or a little weight when the top of the range feels easy.";
    }

    /// <summary>
    /// Returns a human-readable focus label and the ordered pick list for the session.
    /// For bro-split, picks are body-part focus keys (chest, back, legs, shoulders, arms, core).
    /// For other splits, picks are movement slots (push, pull, legs, core, carry).
    /// </summary>
    private static (string FocusLabel, List<string> SlotOrder) GetSessionTemplate(
        string split, int dayIdx, int workoutIndex, int daysPerWeek, Random? rng = null)
    {
        switch (split)
        {
            case "upper-lower":
                return (workoutIndex % 2 == 0)
                    ? ("Upper body", ShuffleCopy(new List<string> { "push", "pull", "push", "core" }, rng))
                    : ("Lower body", ShuffleCopy(new List<string> { "legs", "legs", "core", "carry" }, rng));
            case "ppl":
                int r = workoutIndex % 3;
                if (r == 0) return ("Push", ShuffleCopy(new List<string> { "push", "push", "core" }, rng));
                if (r == 1) return ("Pull", ShuffleCopy(new List<string> { "pull", "pull", "core" }, rng));
                return ("Legs", ShuffleCopy(new List<string> { "legs", "legs", "core" }, rng));
            case "bro-split":
                return GetBroSessionTemplate(workoutIndex, daysPerWeek);
            case "full-body":
            default:
                var baseSlots = new List<string> { "legs", "push", "pull", "core" };
                // Random rotation so full-body sessions don't always start with the same pattern
                if (rng != null)
                    return ("Full body", ShuffleCopy(baseSlots, rng));
                int offset = (dayIdx + workoutIndex) % baseSlots.Count;
                var rotated = baseSlots.Skip(offset).Concat(baseSlots.Take(offset)).ToList();
                return ("Full body", rotated);
        }
    }

    private static List<string> ShuffleCopy(List<string> source, Random? rng)
    {
        var list = source.ToList();
        if (rng == null || list.Count < 2) return list;
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    /// <summary>
    /// Classic bodybuilding bro split: one (or two) major muscle groups per day, high volume.
    /// Templates scale from 1–7 training days; 4–5 day schedules are the classic targets.
    /// </summary>
    private static (string FocusLabel, List<string> SlotOrder) GetBroSessionTemplate(
        int workoutIndex, int daysPerWeek)
    {
        // Each entry: display label + ordered muscle-focus picks for exercise selection
        var template = daysPerWeek switch
        {
            1 => new List<(string, string[])>
            {
                ("Full body", new[] { "chest", "back", "legs", "shoulders", "arms", "core" })
            },
            2 => new List<(string, string[])>
            {
                ("Upper body", new[] { "chest", "back", "shoulders", "arms", "core" }),
                ("Lower body", new[] { "legs", "legs", "legs", "core" })
            },
            3 => new List<(string, string[])>
            {
                ("Chest & shoulders", new[] { "chest", "chest", "shoulders", "shoulders", "core" }),
                ("Back & arms", new[] { "back", "back", "arms", "arms", "core" }),
                ("Legs", new[] { "legs", "legs", "legs", "legs", "core" })
            },
            4 => new List<(string, string[])>
            {
                ("Chest", new[] { "chest", "chest", "chest", "chest", "core" }),
                ("Back", new[] { "back", "back", "back", "back", "core" }),
                ("Legs", new[] { "legs", "legs", "legs", "legs", "core" }),
                ("Shoulders & arms", new[] { "shoulders", "shoulders", "arms", "arms", "core" })
            },
            5 => new List<(string, string[])>
            {
                ("Chest", new[] { "chest", "chest", "chest", "chest", "core" }),
                ("Back", new[] { "back", "back", "back", "back", "core" }),
                ("Legs", new[] { "legs", "legs", "legs", "legs", "core" }),
                ("Shoulders", new[] { "shoulders", "shoulders", "shoulders", "core" }),
                ("Arms", new[] { "arms", "arms", "arms", "arms", "core" })
            },
            6 => new List<(string, string[])>
            {
                ("Chest", new[] { "chest", "chest", "chest", "chest", "core" }),
                ("Back", new[] { "back", "back", "back", "back", "core" }),
                ("Legs", new[] { "legs", "legs", "legs", "legs", "core" }),
                ("Shoulders", new[] { "shoulders", "shoulders", "shoulders", "core" }),
                ("Arms", new[] { "arms", "arms", "arms", "arms", "core" }),
                ("Core & weak points", new[] { "core", "core", "arms", "shoulders", "back" })
            },
            _ => new List<(string, string[])>
            {
                ("Chest", new[] { "chest", "chest", "chest", "chest", "core" }),
                ("Back", new[] { "back", "back", "back", "back", "core" }),
                ("Legs", new[] { "legs", "legs", "legs", "legs", "core" }),
                ("Shoulders", new[] { "shoulders", "shoulders", "shoulders", "core" }),
                ("Arms", new[] { "arms", "arms", "arms", "arms", "core" }),
                ("Core & weak points", new[] { "core", "core", "arms", "shoulders" }),
                ("Full body pump", new[] { "chest", "back", "legs", "shoulders", "arms" })
            }
        };

        var day = template[workoutIndex % template.Count];
        return (day.Item1, day.Item2.ToList());
    }

    /// <summary>
    /// Normalize split independently of goal. Defaults to full-body when missing/unknown.
    /// </summary>
    private static string NormalizeSplit(string? split) => split?.ToLowerInvariant().Trim() switch
    {
        "upper" or "upper-lower" or "lower" or "upper/lower" or "upper / lower" => "upper-lower",
        "ppl" or "push-pull-legs" or "push / pull / legs" or "push-pull-legs" => "ppl",
        "bro" or "bro-split" or "bro split" or "body-part" or "body part" => "bro-split",
        "full-body" or "full body" or "total" or "total-body" or "total body" or null or "" => "full-body",
        // Legacy clients sometimes sent split values in the goal field only; still accept known aliases.
        _ => "full-body"
    };

    private static string NormalizeGoal(string? goal) => goal?.ToLowerInvariant() switch
    {
        "strength" => "strength",
        "hypertrophy" or "muscle-building" or "muscle building" or "muscle" => "hypertrophy",
        "endurance" => "endurance",
        "fat-loss" or "fat loss" => "fat-loss",
        // Never treat a split name as a training goal
        "full-body" or "full body" or "ppl" or "upper-lower" or "bro-split" => "hypertrophy",
        _ => "hypertrophy"
    };
}
