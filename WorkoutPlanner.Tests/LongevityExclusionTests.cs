using System.Net.Http.Json;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class LongevityExclusionTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public LongevityExclusionTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    public static TheoryData<string, PlanRequest> ExclusionCases()
    {
        var data = new TheoryData<string, PlanRequest>();

        data.Add("bro-split-bodyweight-5d", new PlanRequest
        {
            Seed = 3003,
            Weeks = 4,
            DaysPerWeek = 5,
            WorkoutDays = new List<int> { 0, 1, 2, 3, 4 },
            SessionMinutes = 20,
            Equipment = new List<string> { "bodyweight" },
            Split = "bro-split",
            Goal = "hypertrophy",
            Level = "beginner",
            IncludeWarmup = true,
            IncludeCooldown = true,
            Restrictions = new List<string>(),
            Rehab = new List<string>(),
            FavoriteExerciseIds = new List<string>(),
            DislikedExerciseIds = new List<string>(),
            AvoidExerciseIds = new List<string>(),
            Progression = "linear",
            MixMode = "strength"
        });

        data.Add("full-body-dumbbells-bench-3d", new PlanRequest
        {
            Seed = 1001,
            Weeks = 4,
            DaysPerWeek = 3,
            WorkoutDays = new List<int> { 0, 2, 4 },
            SessionMinutes = 45,
            Equipment = new List<string> { "dumbbells", "bench" },
            Split = "full-body",
            Goal = "hypertrophy",
            Level = "beginner",
            IncludeWarmup = true,
            IncludeCooldown = true,
            Restrictions = new List<string>(),
            Rehab = new List<string>(),
            FavoriteExerciseIds = new List<string>(),
            DislikedExerciseIds = new List<string>(),
            AvoidExerciseIds = new List<string>(),
            Progression = "linear",
            MixMode = "strength"
        });

        data.Add("upper-lower-bands-bodyweight-4d", new PlanRequest
        {
            Seed = 2002,
            Weeks = 4,
            DaysPerWeek = 4,
            WorkoutDays = new List<int> { 0, 1, 3, 4 },
            SessionMinutes = 45,
            Equipment = new List<string> { "bands", "bodyweight" },
            Split = "upper-lower",
            Goal = "hypertrophy",
            Level = "intermediate",
            IncludeWarmup = true,
            IncludeCooldown = true,
            Restrictions = new List<string>(),
            Rehab = new List<string>(),
            FavoriteExerciseIds = new List<string>(),
            DislikedExerciseIds = new List<string>(),
            AvoidExerciseIds = new List<string>(),
            Progression = "linear",
            MixMode = "strength"
        });

        data.Add("hybrid-bodyweight-4d", new PlanRequest
        {
            Seed = 4004,
            Weeks = 4,
            DaysPerWeek = 4,
            WorkoutDays = new List<int> { 0, 1, 3, 4 },
            SessionMinutes = 35,
            Equipment = new List<string> { "bodyweight" },
            Split = "full-body",
            Goal = "hypertrophy",
            Level = "beginner",
            IncludeWarmup = true,
            IncludeCooldown = true,
            Restrictions = new List<string>(),
            Rehab = new List<string>(),
            FavoriteExerciseIds = new List<string>(),
            DislikedExerciseIds = new List<string>(),
            AvoidExerciseIds = new List<string>(),
            Progression = "none",
            MixMode = "hybrid"
        });

        return data;
    }

    [Theory]
    [MemberData(nameof(ExclusionCases))]
    public async Task GeneralPlan_ExcludesLongevityOnlyExerciseIds(string name, PlanRequest baseRequest)
    {
        var forbiddenIds = LongevityLegsCatalog.LongevityOnlyExerciseIds;

        foreach (var seedOffset in new[] { 0, 1, 2, 3, 4 })
        {
            var request = new PlanRequest
            {
                Weeks = baseRequest.Weeks,
                DaysPerWeek = baseRequest.DaysPerWeek,
                WorkoutDays = new List<int>(baseRequest.WorkoutDays),
                SessionMinutes = baseRequest.SessionMinutes,
                Equipment = new List<string>(baseRequest.Equipment),
                Split = baseRequest.Split,
                Goal = baseRequest.Goal,
                Level = baseRequest.Level,
                IncludeWarmup = baseRequest.IncludeWarmup,
                IncludeCooldown = baseRequest.IncludeCooldown,
                Restrictions = new List<string>(baseRequest.Restrictions),
                Rehab = new List<string>(baseRequest.Rehab),
                FavoriteExerciseIds = new List<string>(baseRequest.FavoriteExerciseIds),
                DislikedExerciseIds = new List<string>(baseRequest.DislikedExerciseIds),
                AvoidExerciseIds = new List<string>(baseRequest.AvoidExerciseIds),
                Progression = baseRequest.Progression,
                MixMode = baseRequest.MixMode,
                Seed = baseRequest.Seed + seedOffset
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

            Assert.All(exerciseIds, id =>
                Assert.False(forbiddenIds.Contains(id),
                    $"{name}: exercise id '{id}' is reserved for Longevity Legs and should not appear in general plans."));
        }
    }
}
