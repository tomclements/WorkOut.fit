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
}
