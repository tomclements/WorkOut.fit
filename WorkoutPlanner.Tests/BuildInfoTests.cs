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
        Assert.Equal("WorkOut", body["app"]?.ToString());
    }

    [Fact]
    public async Task About_Alias_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/about");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
