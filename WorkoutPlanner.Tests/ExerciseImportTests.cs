using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class ExerciseImportTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public ExerciseImportTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void NormalizeId_SlugifiesNames()
    {
        Assert.Equal("barbell-bench-press", ExerciseImportService.NormalizeId("Barbell Bench Press"));
        Assert.Equal("3-4-sit-up", ExerciseImportService.NormalizeId("3/4 Sit-Up"));
    }

    [Fact]
    public async Task Refresh_RequiresAdmin()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsync("/api/admin/exercises/refresh", null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Stats_RequiresAdmin()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/admin/exercises/stats");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_AsAdmin_ImportsFromMockSource()
    {
        var mockJson = """
        [
          {
            "name": "ZZZ Unique Import Test Curl",
            "level": "beginner",
            "equipment": "dumbbell",
            "category": "strength",
            "primaryMuscles": ["biceps"],
            "secondaryMuscles": ["forearms"],
            "images": ["ZZZ_Unique_Import_Test_Curl/0.jpg"]
          },
          {
            "name": "Should Skip Stretch",
            "level": "beginner",
            "equipment": "body only",
            "category": "stretching",
            "primaryMuscles": ["hamstrings"],
            "secondaryMuscles": [],
            "images": []
          }
        ]
        """;

        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.AddHttpClient("free-exercise-db")
                    .ConfigurePrimaryHttpMessageHandler(() => new MockFreeDbHandler(mockJson));
            });
        });

        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await EnsureAdminAsync(client, factory);

        var before = await client.GetFromJsonAsync<List<Dictionary<string, object>>>("/api/admin/exercises");
        Assert.NotNull(before);

        var refresh = await client.PostAsync("/api/admin/exercises/refresh?force=false", null);
        refresh.EnsureSuccessStatusCode();
        var result = await refresh.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(result);

        // added should be at least 1 (the unique curl)
        Assert.True(Convert.ToInt32(result!["added"].ToString()) >= 1, "Expected at least one added exercise");

        var after = await client.GetFromJsonAsync<List<Dictionary<string, object>>>("/api/admin/exercises");
        Assert.NotNull(after);
        Assert.Contains(after!, e => e["id"]?.ToString() == "zzz-unique-import-test-curl");

        // Second refresh without force: duplicate, no new adds for same id
        var refresh2 = await client.PostAsync("/api/admin/exercises/refresh?force=false", null);
        refresh2.EnsureSuccessStatusCode();
        var result2 = await refresh2.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(result2);
        Assert.True(Convert.ToInt32(result2!["duplicates"].ToString()) >= 1);
    }

    private static async Task EnsureAdminAsync(HttpClient client, WebApplicationFactory<Program> factory)
    {
        // Bootstrap admin from Program seed is tomclements@gmail.com / AdminPass123!
        // Prefer promoting a fresh user via the seeded admin if present, else register + role via scope.
        using var scope = factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

        if (!await roleManager.RoleExistsAsync("Admin"))
            await roleManager.CreateAsync(new IdentityRole("Admin"));

        var email = $"admin-import-{Guid.NewGuid():N}@test.com";
        var user = new IdentityUser { UserName = email, Email = email, EmailConfirmed = true };
        await userManager.CreateAsync(user, "Password123!");
        await userManager.AddToRoleAsync(user, "Admin");

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Password123!" });
        login.EnsureSuccessStatusCode();
    }

    private sealed class MockFreeDbHandler : HttpMessageHandler
    {
        private readonly string _json;

        public MockFreeDbHandler(string json) => _json = json;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }
}
