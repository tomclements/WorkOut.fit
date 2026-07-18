using System.Net;
using System.Net.Http.Json;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class PlanGenerationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public PlanGenerationTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Theory]
    [InlineData(1, 3, 30, "full-body", "beginner")]
    [InlineData(4, 5, 20, "full-body", "beginner")]
    [InlineData(8, 6, 45, "ppl", "intermediate")]
    [InlineData(12, 7, 60, "strength", "advanced")]
    [InlineData(2, 4, 15, "fat-loss", "beginner")]
    public async Task GeneratePlan_ReturnsValidPlan(int weeks, int days, int minutes, string goal, string level)
    {
        var request = new PlanRequest
        {
            Weeks = weeks,
            DaysPerWeek = days,
            SessionMinutes = minutes,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Goal = goal,
            Level = level
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);
        Assert.Equal(weeks, result!.Plan.Count);
        Assert.All(result.Plan, w => Assert.Equal(7, w.Days.Count));
        Assert.All(result.Plan, w => Assert.Equal(w.Week, w.Week));
    }

    [Fact]
    public async Task GeneratePlan_DumbbellsOnly_DoesNotIncludeBenchRequiredIds()
    {
        // IDs that require bench (or pull-up bar) in the seed library
        var forbiddenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "db-bench-press", "db-chest-fly", "db-step-up", "pull-up"
        };

        var request = new PlanRequest
        {
            Weeks = 4,
            DaysPerWeek = 5,
            SessionMinutes = 30,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Split = "full-body",
            Goal = "hypertrophy",
            Level = "beginner",
            Progression = "none",
            Seed = 7
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var exerciseIds = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .SelectMany(d => d.Exercises)
            .Select(e => e.Id)
            .ToList();

        Assert.DoesNotContain(exerciseIds, id => forbiddenIds.Contains(id));
    }

    [Fact]
    public async Task GeneratePlan_WithBench_CanIncludeBenchRequiredIds()
    {
        // Selection is randomized; try several seeds until a known bench-required id appears.
        var benchIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "db-bench-press", "db-chest-fly", "db-step-up"
        };

        var found = false;
        for (int seed = 1; seed <= 40 && !found; seed++)
        {
            var request = new PlanRequest
            {
                Weeks = 2,
                DaysPerWeek = 5,
                SessionMinutes = 45,
                Equipment = new List<string> { "dumbbells", "bodyweight", "bench" },
                Split = "full-body",
                Goal = "hypertrophy",
                Level = "beginner",
                Progression = "none",
                Seed = seed
            };

            var response = await _client.PostAsJsonAsync("/api/plan", request);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
            Assert.NotNull(result);

            var ids = result!.Plan
                .SelectMany(w => w.Days)
                .Where(d => d.Type == "workout")
                .SelectMany(d => d.Exercises)
                .Select(e => e.Id);

            found = ids.Any(id => benchIds.Contains(id));
        }

        Assert.True(found, "Expected at least one bench-required exercise across random seeds when bench is selected");
    }

    [Fact]
    public async Task GeneratePlan_EachWorkoutHasExercises()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            SessionMinutes = 20,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var workouts = result!.Plan.SelectMany(w => w.Days).Where(d => d.Type == "workout").ToList();
        Assert.All(workouts, d => Assert.NotEmpty(d.Exercises));
        Assert.All(workouts, d => Assert.True(d.EstimatedMinutes > 0));
    }

    [Fact]
    public async Task GeneratePlan_ShoulderRestriction_ExcludesOverheadPress()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            SessionMinutes = 20,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Restrictions = new List<string> { "shoulder" },
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var exerciseNames = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .SelectMany(d => d.Exercises)
            .Select(e => e.Name)
            .ToList();

        Assert.DoesNotContain("Dumbbell Overhead Press", exerciseNames);
        Assert.DoesNotContain("Push-Up", exerciseNames);
        Assert.NotEmpty(exerciseNames);
    }

    [Fact]
    public async Task GeneratePlan_NoMatchingExercises_ReturnsBadRequest()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            SessionMinutes = 20,
            Equipment = new List<string> { "bench" },
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GeneratePlan_ExercisesHaveDemoLinks()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            SessionMinutes = 20,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var exercises = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .SelectMany(d => d.Exercises)
            .ToList();

        Assert.All(exercises, e => Assert.False(string.IsNullOrWhiteSpace(e.DemoUrl)));
    }

    [Fact]
    public async Task GeneratePlan_IncludesImageUrlsWhenAvailable()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            SessionMinutes = 30,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench", "barbell" },
            Split = "full-body",
            Goal = "hypertrophy",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var exercises = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .SelectMany(d => d.Exercises)
            .ToList();

        Assert.NotEmpty(exercises);
        var withImages = exercises.Count(e => !string.IsNullOrWhiteSpace(e.ImageUrl));
        Assert.True(withImages > 0, "Expected at least some plan exercises to include imageUrl");
    }

    [Fact]
    public async Task GeneratePlan_BroSplit_UsesBodyPartFocusLabels()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            WorkoutDays = new List<int> { 0, 1, 2, 3, 4 },
            SessionMinutes = 45,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench", "barbell", "pull-up-bar" },
            Split = "bro-split",
            Goal = "hypertrophy",
            Level = "intermediate"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var workouts = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .OrderBy(d => d.DayIndex)
            .ToList();

        Assert.Equal(5, workouts.Count);
        Assert.Equal("Chest", workouts[0].Focus);
        Assert.Equal("Back", workouts[1].Focus);
        Assert.Equal("Legs", workouts[2].Focus);
        Assert.Equal("Shoulders", workouts[3].Focus);
        Assert.Equal("Arms", workouts[4].Focus);
        Assert.All(workouts, d => Assert.NotEmpty(d.Exercises));
    }

    [Fact]
    public async Task GeneratePlan_BroSplit_ChestDayTargetsChest()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            WorkoutDays = new List<int> { 0, 1, 2, 3, 4 },
            SessionMinutes = 45,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench", "barbell", "pull-up-bar" },
            Split = "bro-split",
            Goal = "hypertrophy",
            Level = "intermediate"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var chestDay = result!.Plan
            .SelectMany(w => w.Days)
            .First(d => d.Type == "workout" && d.Focus == "Chest");

        // Most chest-day exercises should list chest as a primary or secondary muscle
        var withChest = chestDay.Exercises.Count(e =>
            e.Primary.Any(p => p.Equals("chest", StringComparison.OrdinalIgnoreCase)));
        Assert.True(withChest >= Math.Max(1, chestDay.Exercises.Count / 2),
            $"Expected majority chest-focused exercises, got {withChest}/{chestDay.Exercises.Count}");
    }

    [Fact]
    public async Task GeneratePlan_BroSplit_FourDay_CombinesShouldersAndArms()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 4,
            WorkoutDays = new List<int> { 0, 1, 2, 3 },
            SessionMinutes = 40,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench", "barbell" },
            Split = "bro-split",
            Goal = "hypertrophy",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var focuses = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .Select(d => d.Focus)
            .ToList();

        Assert.Contains("Chest", focuses);
        Assert.Contains("Back", focuses);
        Assert.Contains("Legs", focuses);
        Assert.Contains("Shoulders & arms", focuses);
    }

    [Theory]
    [InlineData("linear")]
    [InlineData("wave")]
    [InlineData("block")]
    [InlineData("none")]
    public async Task GeneratePlan_ProgressionModes_HavePhases(string progression)
    {
        var request = new PlanRequest
        {
            Weeks = 8,
            DaysPerWeek = 3,
            SessionMinutes = 30,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Split = "full-body",
            Goal = "hypertrophy",
            Level = "beginner",
            Progression = progression
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);
        Assert.Equal(8, result!.Plan.Count);
        Assert.False(string.IsNullOrWhiteSpace(result.ProgressionSummary));
        Assert.Equal(progression, result.Criteria.Progression);
        Assert.All(result.Plan, w =>
        {
            Assert.False(string.IsNullOrWhiteSpace(w.Phase));
            Assert.False(string.IsNullOrWhiteSpace(w.PhaseLabel));
            Assert.False(string.IsNullOrWhiteSpace(w.FocusNote));
        });

        if (progression is "linear" or "wave" or "block")
        {
            Assert.Contains(result.Plan, w => w.Phase == "deload");
        }

        if (progression == "none")
        {
            Assert.All(result.Plan, w => Assert.Equal("base", w.Phase));
        }
    }

    [Fact]
    public async Task GeneratePlan_DifferentSeeds_CanVaryExerciseMix()
    {
        async Task<HashSet<string>> IdsForSeed(int seed, List<string>? avoid = null)
        {
            var req = new PlanRequest
            {
                Weeks = 1,
                DaysPerWeek = 3,
                WorkoutDays = new List<int> { 0, 2, 4 },
                SessionMinutes = 40,
                Equipment = new List<string> { "dumbbells", "bodyweight", "bench", "barbell", "pull-up-bar", "kettlebell", "bands" },
                Split = "full-body",
                Goal = "hypertrophy",
                Level = "intermediate",
                Progression = "none",
                Seed = seed,
                AvoidExerciseIds = avoid ?? new List<string>()
            };
            var response = await _client.PostAsJsonAsync("/api/plan", req);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
            return result!.Plan
                .SelectMany(w => w.Days)
                .Where(d => d.Type == "workout")
                .SelectMany(d => d.Exercises)
                .Select(e => e.Id)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        var a = await IdsForSeed(11);
        var b = await IdsForSeed(99, a.ToList());
        Assert.NotEmpty(a);
        Assert.NotEmpty(b);
        Assert.False(a.SetEquals(b),
            $"Expected different exercise mixes. A={string.Join(',', a.OrderBy(x => x))} B={string.Join(',', b.OrderBy(x => x))}");
        // With avoid list, overlap should be low
        var overlap = a.Intersect(b, StringComparer.OrdinalIgnoreCase).Count();
        Assert.True(overlap < a.Count,
            $"Expected avoid list to reduce overlap; overlap={overlap}/{a.Count}");
    }

    [Fact]
    public async Task GeneratePlan_PreservesSplitAndGoalIndependently()
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 4,
            WorkoutDays = new List<int> { 0, 1, 3, 4 },
            SessionMinutes = 30,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench" },
            Split = "ppl",
            Goal = "strength",
            Level = "intermediate",
            Progression = "none",
            Seed = 42
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);
        Assert.Equal("ppl", result!.Criteria.Split);
        Assert.Equal("strength", result.Criteria.Goal);
        Assert.Equal(new[] { 0, 1, 3, 4 }, result.Criteria.WorkoutDays);
    }

    [Fact]
    public async Task GeneratePlan_Linear_DeloadHasFewerSetsThanPeakBuild()
    {
        var request = new PlanRequest
        {
            Weeks = 4,
            DaysPerWeek = 3,
            SessionMinutes = 40,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench" },
            Split = "full-body",
            Goal = "hypertrophy",
            Level = "intermediate",
            Progression = "linear"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var week3 = result!.Plan.First(w => w.Week == 3);
        var week4 = result.Plan.First(w => w.Week == 4);
        Assert.Equal("deload", week4.Phase);

        double AvgSets(WeekPlan w) =>
            w.Days.Where(d => d.Type == "workout").SelectMany(d => d.Exercises).DefaultIfEmpty()
                .Average(e => e?.Sets ?? 0);

        Assert.True(AvgSets(week4) <= AvgSets(week3),
            $"Expected deload week sets ({AvgSets(week4)}) <= build week sets ({AvgSets(week3)})");
    }

    [Theory]
    [InlineData("bro-split")]
    [InlineData("ppl")]
    [InlineData("upper-lower")]
    public async Task GeneratePlan_SplitVariants_ReturnWorkouts(string split)
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 5,
            SessionMinutes = 30,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench" },
            Split = split,
            Goal = "hypertrophy",
            Level = "beginner"
        };

        var response = await _client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(result);

        var workouts = result!.Plan.SelectMany(w => w.Days).Where(d => d.Type == "workout").ToList();
        Assert.NotEmpty(workouts);
        Assert.All(workouts, d => Assert.NotEmpty(d.Exercises));
        Assert.Equal(split, result.Criteria.Split);
    }
}
