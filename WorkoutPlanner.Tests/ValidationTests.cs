using System.Net;
using System.Net.Http.Json;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class ValidationTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public ValidationTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GeneratePlan_InvalidWeeks_ReturnsValidationError()
    {
        var client = _factory.CreateClient();
        var request = new PlanRequest
        {
            Weeks = 0,
            DaysPerWeek = 3,
            SessionMinutes = 30,
            Equipment = new List<string> { "bodyweight" },
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await client.PostAsJsonAsync("/api/plan", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task GeneratePlan_MissingEquipment_ReturnsValidationError()
    {
        var client = _factory.CreateClient();
        var request = new PlanRequest
        {
            Weeks = 1,
            DaysPerWeek = 3,
            SessionMinutes = 30,
            Equipment = new List<string>(),
            Goal = "full-body",
            Level = "beginner"
        };

        var response = await client.PostAsJsonAsync("/api/plan", request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_InvalidEmail_ReturnsValidationError()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = "not-an-email", password = "Password123!" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_ShortPassword_ReturnsValidationError()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = "test@example.com", password = "123" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
