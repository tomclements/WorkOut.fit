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
    public async Task GeneratePlan_DumbbellsOnly_DoesNotIncludeBenchExercises()
    {
        var request = new PlanRequest
        {
            Weeks = 4,
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

        var exerciseNames = result!.Plan
            .SelectMany(w => w.Days)
            .Where(d => d.Type == "workout")
            .SelectMany(d => d.Exercises)
            .Select(e => e.Name)
            .ToList();

        Assert.DoesNotContain("Dumbbell Bench Press", exerciseNames);
        Assert.DoesNotContain("Dumbbell Chest Fly", exerciseNames);
        Assert.DoesNotContain("Dumbbell Step-Up", exerciseNames);
        Assert.DoesNotContain("Pull-Up", exerciseNames);
    }

    [Fact]
    public async Task GeneratePlan_WithBench_IncludesBenchExercises()
    {
        var request = new PlanRequest
        {
            Weeks = 4,
            DaysPerWeek = 5,
            SessionMinutes = 20,
            Equipment = new List<string> { "dumbbells", "bodyweight", "bench" },
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

        Assert.Contains("Dumbbell Bench Press", exerciseNames);
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
}
