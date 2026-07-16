using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class SavedPlanTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public SavedPlanTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateAuthenticatedClient(out string email)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        email = $"saved{Guid.NewGuid()}@test.com";
        var response = client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" }).Result;
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<PlanResponse> GeneratePlanAsync(HttpClient client)
    {
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 3,
            SessionMinutes = 20,
            Equipment = new List<string> { "dumbbells", "bodyweight" },
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await client.PostAsJsonAsync("/api/plan", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PlanResponse>())!;
    }

    [Fact]
    public async Task SavePlan_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/plans/save", new { name = "Test", planJson = "{}" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SaveAndListPlan_Works()
    {
        var client = CreateAuthenticatedClient(out _);
        var plan = await GeneratePlanAsync(client);

        var saveResponse = await client.PostAsJsonAsync("/api/plans/save", new
        {
            name = "My Test Plan",
            planJson = JsonSerializer.Serialize(plan)
        });
        saveResponse.EnsureSuccessStatusCode();

        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(saved);
        Assert.Equal("My Test Plan", saved!["name"].ToString());

        var list = await client.GetFromJsonAsync<List<Dictionary<string, object>>>("/api/plans");
        Assert.NotNull(list);
        Assert.Single(list!);
        Assert.Equal("My Test Plan", list[0]["name"].ToString());
    }

    [Fact]
    public async Task LoadSavedPlan_ReturnsOriginalPlan()
    {
        var client = CreateAuthenticatedClient(out _);
        var plan = await GeneratePlanAsync(client);

        var saveResponse = await client.PostAsJsonAsync("/api/plans/save", new
        {
            name = "Load Test",
            planJson = JsonSerializer.Serialize(plan)
        });
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = int.Parse(saved!["id"].ToString()!);

        var loadResponse = await client.GetAsync($"/api/plans/{id}");
        loadResponse.EnsureSuccessStatusCode();
        var loaded = await loadResponse.Content.ReadFromJsonAsync<PlanResponse>();
        Assert.NotNull(loaded);
        Assert.Equal(plan.Criteria.Weeks, loaded!.Criteria.Weeks);
    }

    [Fact]
    public async Task DeleteSavedPlan_Works()
    {
        var client = CreateAuthenticatedClient(out _);
        var plan = await GeneratePlanAsync(client);

        var saveResponse = await client.PostAsJsonAsync("/api/plans/save", new
        {
            name = "Delete Test",
            planJson = JsonSerializer.Serialize(plan)
        });
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = int.Parse(saved!["id"].ToString()!);

        var delete = await client.DeleteAsync($"/api/plans/{id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var load = await client.GetAsync($"/api/plans/{id}");
        Assert.Equal(HttpStatusCode.NotFound, load.StatusCode);
    }

    [Fact]
    public async Task UserCannotAccessOtherUsersPlan()
    {
        var user1 = CreateAuthenticatedClient(out _);
        var user2 = CreateAuthenticatedClient(out _);
        var plan = await GeneratePlanAsync(user1);

        var saveResponse = await user1.PostAsJsonAsync("/api/plans/save", new
        {
            name = "Private Plan",
            planJson = JsonSerializer.Serialize(plan)
        });
        saveResponse.EnsureSuccessStatusCode();
        var saved = await saveResponse.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = int.Parse(saved!["id"].ToString()!);

        var load = await user2.GetAsync($"/api/plans/{id}");
        Assert.Equal(HttpStatusCode.NotFound, load.StatusCode);
    }
}
