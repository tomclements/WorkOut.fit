using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class PreferenceTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public PreferenceTests(TestWebApplicationFactory factory)
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
    public async Task Preferences_DefaultIncludeLongevityLegs_RoundTrips()
    {
        var client = await CreateAuthedClientAsync($"pref-{Guid.NewGuid():N}@example.com");

        var getResponse = await client.GetAsync("/api/user/preferences");
        getResponse.EnsureSuccessStatusCode();
        var initial = await getResponse.Content.ReadFromJsonAsync<UserPreferenceDto>();
        Assert.NotNull(initial);
        Assert.False(initial!.DefaultIncludeLongevityLegs);

        initial.DefaultIncludeLongevityLegs = true;
        var putResponse = await client.PutAsJsonAsync("/api/user/preferences", initial);
        putResponse.EnsureSuccessStatusCode();
        var putResult = await putResponse.Content.ReadFromJsonAsync<UserPreferenceDto>();
        Assert.NotNull(putResult);
        Assert.True(putResult!.DefaultIncludeLongevityLegs);

        var getAfterTrue = await client.GetFromJsonAsync<UserPreferenceDto>("/api/user/preferences");
        Assert.NotNull(getAfterTrue);
        Assert.True(getAfterTrue!.DefaultIncludeLongevityLegs);

        getAfterTrue.DefaultIncludeLongevityLegs = false;
        var putFalseResponse = await client.PutAsJsonAsync("/api/user/preferences", getAfterTrue);
        putFalseResponse.EnsureSuccessStatusCode();

        var getAfterFalse = await client.GetFromJsonAsync<UserPreferenceDto>("/api/user/preferences");
        Assert.NotNull(getAfterFalse);
        Assert.False(getAfterFalse!.DefaultIncludeLongevityLegs);

        Assert.Equal(initial.DefaultVolume, getAfterFalse.DefaultVolume);
    }
}
