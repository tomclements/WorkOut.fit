using System.Net;
using System.Net.Http.Json;

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
        var client = _factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
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
            // already exists from a prior test run on shared factory DB — try login
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
}
