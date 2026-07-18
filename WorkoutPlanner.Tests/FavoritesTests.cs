using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace WorkoutPlanner.Tests;

public class FavoritesTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public FavoritesTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> CreateAuthedClientAsync(string email)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "TestPass1"
        });
        if (register.StatusCode == HttpStatusCode.BadRequest)
        {
            await client.PostAsJsonAsync("/api/auth/login", new { email, password = "TestPass1" });
        }

        return client;
    }

    [Fact]
    public async Task Favorites_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/user/favorites");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Ratings_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/user/ratings");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Favorites_AddListAndRemove_Works()
    {
        var client = await CreateAuthedClientAsync($"fav-{Guid.NewGuid():N}@example.com");

        var empty = await client.GetFromJsonAsync<List<string>>("/api/user/favorites");
        Assert.NotNull(empty);
        Assert.Empty(empty!);

        var add = await client.PostAsync("/api/user/favorites/goblet-squat", null);
        Assert.True(add.IsSuccessStatusCode);

        var list = await client.GetFromJsonAsync<List<string>>("/api/user/favorites");
        Assert.NotNull(list);
        Assert.Contains("goblet-squat", list!);

        var del = await client.DeleteAsync("/api/user/favorites/goblet-squat");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var after = await client.GetFromJsonAsync<List<string>>("/api/user/favorites");
        Assert.NotNull(after);
        Assert.DoesNotContain("goblet-squat", after!);
    }

    [Fact]
    public async Task Ratings_LikeDislikeAndClear_Works()
    {
        var client = await CreateAuthedClientAsync($"rate-{Guid.NewGuid():N}@example.com");

        var empty = await client.GetFromJsonAsync<Dictionary<string, List<string>>>("/api/user/ratings");
        Assert.NotNull(empty);
        Assert.Empty(empty!["liked"] ?? new List<string>());
        Assert.Empty(empty["disliked"] ?? new List<string>());

        var like = await client.PutAsJsonAsync("/api/user/ratings/goblet-squat", new { rating = "like" });
        like.EnsureSuccessStatusCode();

        var afterLike = await client.GetFromJsonAsync<Dictionary<string, List<string>>>("/api/user/ratings");
        Assert.Contains("goblet-squat", afterLike!["liked"]!);
        Assert.DoesNotContain("goblet-squat", afterLike["disliked"]!);

        // Switch to dislike — should move out of liked
        var dislike = await client.PutAsJsonAsync("/api/user/ratings/goblet-squat", new { rating = "dislike" });
        dislike.EnsureSuccessStatusCode();

        var afterDislike = await client.GetFromJsonAsync<Dictionary<string, List<string>>>("/api/user/ratings");
        Assert.DoesNotContain("goblet-squat", afterDislike!["liked"]!);
        Assert.Contains("goblet-squat", afterDislike["disliked"]!);

        // Clear
        var clear = await client.PutAsJsonAsync("/api/user/ratings/goblet-squat", new { rating = "none" });
        clear.EnsureSuccessStatusCode();

        var afterClear = await client.GetFromJsonAsync<Dictionary<string, List<string>>>("/api/user/ratings");
        Assert.DoesNotContain("goblet-squat", afterClear!["liked"]!);
        Assert.DoesNotContain("goblet-squat", afterClear["disliked"]!);
    }

    [Fact]
    public async Task GeneratePlan_RespectsDislikedExercises()
    {
        var client = await CreateAuthedClientAsync($"rate-plan-{Guid.NewGuid():N}@example.com");

        // Dislike a common bodyweight move
        await client.PutAsJsonAsync("/api/user/ratings/push-up", new { rating = "dislike" });
        await client.PutAsJsonAsync("/api/user/ratings/bodyweight-squat", new { rating = "dislike" });

        var ratings = await client.GetFromJsonAsync<Dictionary<string, List<string>>>("/api/user/ratings");
        var disliked = ratings!["disliked"] ?? new List<string>();

        var request = new
        {
            weeks = 1,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 40,
            equipment = new[] { "dumbbells", "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            progression = "none",
            seed = 42,
            dislikedExerciseIds = disliked,
            favoriteExerciseIds = new string[] { }
        };

        var response = await client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        var plan = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(plan);

        // Parse plan days via dynamic JSON
        var planJson = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("\"id\":\"push-up\"", planJson);
        Assert.DoesNotContain("\"id\":\"bodyweight-squat\"", planJson);
    }
}
