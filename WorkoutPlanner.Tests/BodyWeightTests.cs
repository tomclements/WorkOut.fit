using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace WorkoutPlanner.Tests;

public class BodyWeightTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public BodyWeightTests(TestWebApplicationFactory factory)
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
    public async Task BodyWeight_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/body-weight");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AddListAndDeleteEntry_Works()
    {
        var client = await CreateAuthedClientAsync($"weight-{Guid.NewGuid():N}@example.com");

        var empty = await client.GetFromJsonAsync<BodyWeightListDto>("/api/body-weight");
        Assert.NotNull(empty);
        Assert.Empty(empty!.Entries);
        Assert.Null(empty.LatestWeightKg);

        var add = await client.PostAsJsonAsync("/api/body-weight", new { weightKg = 82.5 });
        add.EnsureSuccessStatusCode();
        var created = await add.Content.ReadFromJsonAsync<BodyWeightEntryDto>();
        Assert.NotNull(created);
        Assert.Equal(82.5m, created!.WeightKg);

        var list = await client.GetFromJsonAsync<BodyWeightListDto>("/api/body-weight");
        Assert.NotNull(list);
        Assert.Single(list!.Entries);
        Assert.Equal(82.5m, list.LatestWeightKg);

        var del = await client.DeleteAsync($"/api/body-weight/{created.Id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var after = await client.GetFromJsonAsync<BodyWeightListDto>("/api/body-weight");
        Assert.NotNull(after);
        Assert.Empty(after!.Entries);
    }

    [Fact]
    public async Task AddEntry_RejectsOutOfRangeWeight()
    {
        var client = await CreateAuthedClientAsync($"weight-bad-{Guid.NewGuid():N}@example.com");

        var response = await client.PostAsJsonAsync("/api/body-weight", new { weightKg = 10000 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DeleteOtherUsersEntry_ReturnsNotFound()
    {
        var clientA = await CreateAuthedClientAsync($"weight-a-{Guid.NewGuid():N}@example.com");
        var clientB = await CreateAuthedClientAsync($"weight-b-{Guid.NewGuid():N}@example.com");

        var add = await clientA.PostAsJsonAsync("/api/body-weight", new { weightKg = 70 });
        add.EnsureSuccessStatusCode();
        var created = await add.Content.ReadFromJsonAsync<BodyWeightEntryDto>();

        var del = await clientB.DeleteAsync($"/api/body-weight/{created!.Id}");
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);
    }

    private class BodyWeightListDto
    {
        public List<BodyWeightEntryDto> Entries { get; set; } = new();
        public decimal? LatestWeightKg { get; set; }
        public decimal? Change30Days { get; set; }
    }

    private class BodyWeightEntryDto
    {
        public int Id { get; set; }
        public decimal WeightKg { get; set; }
        public DateTime WeighedAt { get; set; }
    }
}
