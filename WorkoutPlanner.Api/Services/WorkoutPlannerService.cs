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
        string split = string.IsNullOrWhiteSpace(req.Split) ? InferSplit(req.Goal) : req.Split.ToLowerInvariant();
        string goal = NormalizeGoal(req.Goal);
        int userLevelNum = LevelToNum(req.Level);
        var favoriteIds = new HashSet<string>(req.FavoriteExerciseIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);

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
        var recentUses = new List<HashSet<string>>();

        for (int w = 1; w <= weeks; w++)
        {
            var workoutDays = new List<DayPlan>();
            for (int i = 0; i < workoutIndices.Length; i++)
            {
                int dayIdx = workoutIndices[i];
                var (focusLabel, slotOrder) = GetSessionTemplate(split, dayIdx, i, effectiveDays);
                var session = BuildSession(dayIdx, w, i + 1, targetTime, selectedEquipment,
                    userLevelNum, goal, split, focusLabel, slotOrder, exercises, recentUses, favoriteIds,
                    req.IncludeWarmup, req.IncludeCooldown, req.Restrictions);

                recentUses.Add(new HashSet<string>(session.Exercises.Select(e => e.Id)));
                if (recentUses.Count > 2) recentUses.RemoveAt(0);

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
                        Note = "Rest / mobility"
                    });
                }
            }

            plan.Add(new WeekPlan { Week = w, Days = fullDays });
        }

        return new PlanResponse { Criteria = req, Plan = plan, GeneratedAt = DateTime.UtcNow.ToString("O") };
    }

    private DayPlan BuildSession(int dayIdx, int week, int dayNumber, int targetTime,
        List<string> equipment, int userLevelNum, string goal, string split, string focusLabel, List<string> slotOrder,
        List<Exercise> allExercises, List<HashSet<string>> recentUses, HashSet<string> favoriteIds, bool includeWarmup, bool includeCooldown,
        List<string> restrictions)
    {
        var pool = allExercises
            .Where(e => LevelToNum(e.Level) <= userLevelNum && HasEquipment(e, equipment) && !IsRestricted(e, restrictions))
            .ToList();

        var banned = new HashSet<string>(recentUses.SelectMany(s => s));
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

        var usedToday = new HashSet<string>();
        int timeUsed = 0;
        const int transition = 30;

        foreach (var slot in slotOrder)
        {
            bool MatchesSlot(Exercise e) =>
                split == "full-body"
                || (isBro && MatchesBroFocus(e, slot))
                || (!isBro && (e.Slot == slot || e.Slot == "total"));

            var candidates = pool
                .Where(e => MatchesSlot(e) && !usedToday.Contains(e.Id))
                .Where(e => !banned.Contains(e.Id) || pool.Count(x => MatchesSlot(x) && !usedToday.Contains(x.Id)) < 3)
                .OrderByDescending(e => favoriteIds.Contains(e.Id))
                // Prefer exercises whose primary muscles are tightly aligned with the bro focus
                .ThenByDescending(e => isBro ? BroMuscleMatchScore(e, slot) : e.Primary.Count)
                .ThenBy(e => e.Name)
                .ToList();

            if (!candidates.Any()) continue;

            var ex = candidates.First();
            int sets = ComputeSets(ex, goal, userLevelNum, week, isBro);
            string reps = ComputeReps(ex, goal, week);
            int rest = ComputeRest(ex, goal);
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
                Sets = sets,
                RepsDisplay = reps,
                Rest = rest,
                WorkDuration = ex.WorkDuration,
                IsTimeBased = ex.IsTimeBased,
                Primary = ex.Primary,
                Progression = ProgressionHint(goal, week, isBro),
                DemoUrl = ex.DemoUrl
            });
            usedToday.Add(ex.Id);
            timeUsed += exerciseDuration;
        }

        session.EstimatedMinutes = (int)Math.Round(
            (timeUsed + (includeWarmup ? 180 : 0) + (includeCooldown ? 120 : 0)) / 60.0);

        return session;
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

    private static bool HasEquipment(Exercise ex, List<string> selected)
    {
        return ex.Equipment.All(eq => selected.Contains(eq, StringComparer.OrdinalIgnoreCase));
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

    private static int ComputeSets(Exercise ex, string goal, int userLevelNum, int week, bool broSplit = false)
    {
        int sets = ex.BaseSets;
        if (goal == "strength") sets += 1;
        if (goal == "endurance" || goal == "fat-loss") sets = Math.Max(2, sets - 1);
        // Bro split: higher per-session volume for the trained body part
        if (broSplit && (goal == "hypertrophy" || goal == "strength")) sets += 1;
        if (userLevelNum >= 3) sets += 1;
        if (week > 1 && (goal == "strength" || goal == "hypertrophy")) sets = Math.Min(6, sets + 1);
        return Math.Clamp(sets, 1, broSplit ? 6 : 5);
    }

    private static string ComputeReps(Exercise ex, string goal, int week)
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

        int add = Math.Min(4, week - 1);
        min += add;
        max += add;

        return ex.IsTimeBased ? $"{min}-{max} sec" : $"{min}-{max}";
    }

    private static int ComputeRest(Exercise ex, string goal)
    {
        int r = ex.RestSec;
        if (goal == "strength") r += 30;
        else if (goal == "endurance" || goal == "fat-loss") r = Math.Max(20, r - 30);
        else if (goal == "hypertrophy") r = Math.Max(30, r - 15);
        return Math.Clamp(r, 20, 300);
    }

    private static string ProgressionHint(string goal, int week, bool broSplit = false)
    {
        if (week == 1)
            return broSplit
                ? "Body-part day: push high quality volume on this muscle group; leave 1–2 reps in reserve."
                : "Learn the movement; use a weight you can control with good form.";
        if (goal == "strength")
            return "If you completed all sets last week, add a small amount of weight.";
        if (goal == "endurance" || goal == "fat-loss")
            return "Aim for the top of the rep range or reduce rest slightly.";
        if (broSplit)
            return "Chase a strong pump with controlled form; add reps or a small load when the top of the range feels easy.";
        return "Add reps, sets, or weight when the top of the range feels easy.";
    }

    /// <summary>
    /// Returns a human-readable focus label and the ordered pick list for the session.
    /// For bro-split, picks are body-part focus keys (chest, back, legs, shoulders, arms, core).
    /// For other splits, picks are movement slots (push, pull, legs, core, carry).
    /// </summary>
    private static (string FocusLabel, List<string> SlotOrder) GetSessionTemplate(
        string split, int dayIdx, int workoutIndex, int daysPerWeek)
    {
        switch (split)
        {
            case "upper-lower":
                return (workoutIndex % 2 == 0)
                    ? ("Upper body", new List<string> { "push", "pull", "push", "core" })
                    : ("Lower body", new List<string> { "legs", "legs", "core", "carry" });
            case "ppl":
                int r = workoutIndex % 3;
                if (r == 0) return ("Push", new List<string> { "push", "push", "core" });
                if (r == 1) return ("Pull", new List<string> { "pull", "pull", "core" });
                return ("Legs", new List<string> { "legs", "legs", "core" });
            case "bro-split":
                return GetBroSessionTemplate(workoutIndex, daysPerWeek);
            case "full-body":
            default:
                var baseSlots = new List<string> { "legs", "push", "pull", "core" };
                int offset = (dayIdx + workoutIndex) % baseSlots.Count;
                var rotated = baseSlots.Skip(offset).Concat(baseSlots.Take(offset)).ToList();
                return ("Full body", rotated);
        }
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

    private static string InferSplit(string? goal) => goal?.ToLowerInvariant() switch
    {
        "upper" or "upper-lower" or "lower" => "upper-lower",
        "ppl" or "push-pull-legs" or "push / pull / legs" => "ppl",
        "bro" or "bro-split" or "bro split" => "bro-split",
        "full-body" or "full body" or "total" or "total-body" or "total body" => "full-body",
        _ => "full-body"
    };

    private static string NormalizeGoal(string? goal) => goal?.ToLowerInvariant() switch
    {
        "strength" => "strength",
        "hypertrophy" or "muscle-building" or "muscle building" => "hypertrophy",
        "endurance" => "endurance",
        "fat-loss" or "fat loss" => "fat-loss",
        _ => "hypertrophy"
    };
}
