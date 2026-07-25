using System.Net;
using System.Net.Http.Json;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class FeedbackTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public FeedbackTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task SubmitFeedback_Anonymous_Succeeds()
    {
        var req = new SubmitFeedbackRequest
        {
            Category = "suggestion",
            Message = "Please add more dumbbell variations for home gyms.",
            ContactEmail = "someone@example.com",
            PageUrl = "https://example.com/feedback.html"
        };

        var response = await _client.PostAsJsonAsync("/api/feedback", req);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(body);
        Assert.True(body!.ContainsKey("message") || body.ContainsKey("id"));
    }

    [Fact]
    public async Task SubmitFeedback_TooShort_ReturnsBadRequest()
    {
        var req = new SubmitFeedbackRequest
        {
            Category = "bug",
            Message = "hi"
        };

        var response = await _client.PostAsJsonAsync("/api/feedback", req);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SubmitFeedback_HoneypotFilled_StillOk()
    {
        var req = new SubmitFeedbackRequest
        {
            Category = "other",
            Message = "This looks like a bot filling the hidden field.",
            Website = "http://spam.example"
        };

        var response = await _client.PostAsJsonAsync("/api/feedback", req);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
