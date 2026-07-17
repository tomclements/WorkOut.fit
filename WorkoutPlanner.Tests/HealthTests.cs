using System.Net;
using System.Net.Http.Json;

namespace WorkoutPlanner.Tests;

public class HealthTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public HealthTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Health_ReturnsHealthy_WhenDatabaseAvailable()
    {
        var response = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(body);
        Assert.Equal("healthy", body!["status"]?.ToString());
        Assert.Equal("ok", body["database"]?.ToString());
    }
}
