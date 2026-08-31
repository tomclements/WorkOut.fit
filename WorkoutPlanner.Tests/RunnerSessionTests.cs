using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class RunnerSessionTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public RunnerSessionTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateAuthenticatedClient(out string email)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        email = $"runner{Guid.NewGuid()}@test.com";
        var response = client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" }).Result;
        response.EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task SaveSession_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/runner/sessions", new { planName = "Test" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SaveAndRetrieveSession_Works()
    {
        var client = CreateAuthenticatedClient(out _);

        var payload = new SaveSessionRequest
        {
            PlanName = "Morning Workout",
            Week = 2,
            DayIndex = 3,
            StartedAt = DateTime.UtcNow.AddMinutes(-30),
            CompletedAt = DateTime.UtcNow,
            DurationSeconds = 1800,
            Exercises = new List<CompletedExerciseDto>
            {
                new()
                {
                    ExerciseId = "goblet-squat",
                    ExerciseName = "Goblet Squat",
                    TargetSets = 3,
                    Sets = new List<CompletedSetDto>
                    {
                        new() { Reps = 10, DurationSeconds = 45 },
                        new() { Reps = 10, DurationSeconds = 48 },
                        new() { Reps = 9, DurationSeconds = 50 }
                    }
                }
            }
        };

        var saveResponse = await client.PostAsJsonAsync("/api/runner/sessions", payload);
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(saved);
        var id = int.Parse(saved!["id"].ToString()!);

        var list = await client.GetFromJsonAsync<List<Dictionary<string, object>>>("/api/runner/sessions");
        Assert.NotNull(list);
        Assert.Single(list!);
        Assert.Equal("Morning Workout", list[0]["planName"].ToString());
        Assert.Equal(1, int.Parse(list[0]["exerciseCount"].ToString()!));
        Assert.Equal(3, int.Parse(list[0]["totalSets"].ToString()!));

        var detail = await client.GetFromJsonAsync<WorkoutSession>($"/api/runner/sessions/{id}");
        Assert.NotNull(detail);
        Assert.Single(detail!.Exercises);
        Assert.Equal(3, detail.Exercises[0].Sets.Count);
        Assert.Null(detail.Exercises[0].WeightKg);
        Assert.Equal(2, detail.Week);
        Assert.Equal(3, detail.DayIndex);
    }

    [Fact]
    public async Task SaveAndRetrieveSession_RoundTripsWorkingWeightKg()
    {
        var client = CreateAuthenticatedClient(out _);

        var payload = new SaveSessionRequest
        {
            PlanName = "Weighted Day",
            Week = 1,
            DayIndex = 0,
            StartedAt = DateTime.UtcNow.AddMinutes(-20),
            CompletedAt = DateTime.UtcNow,
            DurationSeconds = 1200,
            Exercises = new List<CompletedExerciseDto>
            {
                new()
                {
                    ExerciseId = "goblet-squat",
                    ExerciseName = "Goblet Squat",
                    TargetSets = 3,
                    WeightKg = 24.5m,
                    Sets = new List<CompletedSetDto>
                    {
                        new() { Reps = 10, DurationSeconds = 30 },
                        new() { Reps = 10, DurationSeconds = 30 },
                        new() { Reps = 8, DurationSeconds = 30 }
                    }
                },
                new()
                {
                    ExerciseId = "push-up",
                    ExerciseName = "Push-Up",
                    TargetSets = 2,
                    WeightKg = null,
                    Sets = new List<CompletedSetDto>
                    {
                        new() { Reps = 12, DurationSeconds = 30 }
                    }
                }
            }
        };

        var saveResponse = await client.PostAsJsonAsync("/api/runner/sessions", payload);
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = int.Parse(saved!["id"].ToString()!);

        var detail = await client.GetFromJsonAsync<WorkoutSession>($"/api/runner/sessions/{id}");
        Assert.NotNull(detail);
        Assert.Equal(2, detail!.Exercises.Count);

        var squat = detail.Exercises.Single(e => e.ExerciseId == "goblet-squat");
        Assert.Equal(24.5m, squat.WeightKg);
        Assert.Equal(3, squat.Sets.Count);

        var pushUp = detail.Exercises.Single(e => e.ExerciseId == "push-up");
        Assert.Null(pushUp.WeightKg);
    }

    [Fact]
    public async Task SaveSession_BlankOrZeroWeight_StoresUnknownNotZero()
    {
        var client = CreateAuthenticatedClient(out _);

        var payload = new SaveSessionRequest
        {
            PlanName = "Unknown load",
            StartedAt = DateTime.UtcNow,
            DurationSeconds = 300,
            Exercises = new List<CompletedExerciseDto>
            {
                new()
                {
                    ExerciseId = "bench-press",
                    ExerciseName = "Bench Press",
                    TargetSets = 1,
                    WeightKg = 0,
                    Sets = new List<CompletedSetDto> { new() { Reps = 5, DurationSeconds = 20 } }
                }
            }
        };

        var saveResponse = await client.PostAsJsonAsync("/api/runner/sessions", payload);
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = int.Parse(saved!["id"].ToString()!);

        var detail = await client.GetFromJsonAsync<WorkoutSession>($"/api/runner/sessions/{id}");
        Assert.NotNull(detail);
        Assert.Null(detail!.Exercises[0].WeightKg);
    }

    [Fact]
    public async Task UserCannotAccessOtherUsersSession()
    {
        var user1 = CreateAuthenticatedClient(out _);
        var user2 = CreateAuthenticatedClient(out _);

        var payload = new SaveSessionRequest
        {
            PlanName = "Private",
            StartedAt = DateTime.UtcNow,
            DurationSeconds = 600,
            Exercises = new List<CompletedExerciseDto>()
        };

        var saveResponse = await user1.PostAsJsonAsync("/api/runner/sessions", payload);
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = int.Parse(saved!["id"].ToString()!);

        var detail = await user2.GetAsync($"/api/runner/sessions/{id}");
        Assert.Equal(HttpStatusCode.NotFound, detail.StatusCode);
    }

    [Fact]
    public async Task LastLoads_ReturnsLatestWeightPerExercise()
    {
        var client = CreateAuthenticatedClient(out _);

        // Earlier session: goblet-squat 20 kg
        var earlier = new SaveSessionRequest
        {
            PlanName = "Early",
            StartedAt = DateTime.UtcNow.AddDays(-2),
            DurationSeconds = 1200,
            Exercises = new List<CompletedExerciseDto>
            {
                new()
                {
                    ExerciseId = "goblet-squat",
                    ExerciseName = "Goblet Squat",
                    TargetSets = 3,
                    WeightKg = 20m,
                    Sets = new List<CompletedSetDto> { new() { Reps = 10, DurationSeconds = 30 } }
                }
            }
        };
        (await client.PostAsJsonAsync("/api/runner/sessions", earlier)).EnsureSuccessStatusCode();

        // Later session: goblet-squat 30 kg
        var later = new SaveSessionRequest
        {
            PlanName = "Late",
            StartedAt = DateTime.UtcNow,
            DurationSeconds = 1200,
            Exercises = new List<CompletedExerciseDto>
            {
                new()
                {
                    ExerciseId = "goblet-squat",
                    ExerciseName = "Goblet Squat",
                    TargetSets = 3,
                    WeightKg = 30m,
                    Sets = new List<CompletedSetDto> { new() { Reps = 10, DurationSeconds = 30 } }
                }
            }
        };
        (await client.PostAsJsonAsync("/api/runner/sessions", later)).EnsureSuccessStatusCode();

        var loads = await client.GetFromJsonAsync<Dictionary<string, decimal>>("/api/runner/last-loads");
        Assert.NotNull(loads);
        Assert.Single(loads!);
        Assert.Equal(30m, loads["goblet-squat"]);
    }

    [Fact]
    public async Task LastLoads_OmitsExercisesWithOnlyNullWeight()
    {
        var client = CreateAuthenticatedClient(out _);

        var payload = new SaveSessionRequest
        {
            PlanName = "No weights",
            StartedAt = DateTime.UtcNow,
            DurationSeconds = 600,
            Exercises = new List<CompletedExerciseDto>
            {
                new()
                {
                    ExerciseId = "push-up",
                    ExerciseName = "Push-Up",
                    TargetSets = 2,
                    WeightKg = null,
                    Sets = new List<CompletedSetDto> { new() { Reps = 12, DurationSeconds = 30 } }
                }
            }
        };
        (await client.PostAsJsonAsync("/api/runner/sessions", payload)).EnsureSuccessStatusCode();

        var loads = await client.GetFromJsonAsync<Dictionary<string, decimal>>("/api/runner/last-loads");
        Assert.NotNull(loads);
        Assert.Empty(loads!);
    }

    [Fact]
    public async Task LastLoads_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/runner/last-loads");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
