using System.Net;
using System.Net.Http.Json;

namespace WorkoutPlanner.Tests;

public class BuildInfoTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public BuildInfoTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Build_ReturnsCommitInfo()
    {
        var response = await _client.GetAsync("/api/build");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(body);
        Assert.True(body!.ContainsKey("commit") || body.ContainsKey("shortCommit"));
        Assert.False(string.IsNullOrWhiteSpace(body["shortCommit"]?.ToString()));
        Assert.Equal("Plan4Strength", body["app"]?.ToString());
    }

    [Fact]
    public async Task About_Alias_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/about");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("/privacy")]
    [InlineData("/privacy.html")]
    public async Task PrivacyPage_ReturnsPublicHtml(string path)
    {
        var response = await _client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("text/html", response.Content.Headers.ContentType?.MediaType);

        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains("Privacy policy", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("WorkOut.fit", html);
        Assert.Contains("Plan4Strength", html);
        Assert.Contains("Strava", html);
        Assert.Contains("Render", html);
        Assert.Contains("body weight", html, StringComparison.OrdinalIgnoreCase);
    }
}
