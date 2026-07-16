using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace WorkoutPlanner.Tests;

public class AuthTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public AuthTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateClientWithCookies()
    {
        return _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true
        });
    }

    [Fact]
    public async Task Register_CreatesUserAndReturnsEmail()
    {
        var client = CreateClientWithCookies();
        var email = $"user{Guid.NewGuid()}@test.com";

        var response = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" });
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        Assert.NotNull(result);
        Assert.Equal(email, result!["email"].ToString());
    }

    [Fact]
    public async Task Me_ReturnsUnauthorized_WhenAnonymous()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_AfterRegister_ReturnsEmail()
    {
        var client = CreateClientWithCookies();
        var email = $"login{Guid.NewGuid()}@test.com";

        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" });
        register.EnsureSuccessStatusCode();

        var logout = await client.PostAsync("/api/auth/logout", null);
        logout.EnsureSuccessStatusCode();

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Password123!" });
        login.EnsureSuccessStatusCode();

        var me = await client.GetFromJsonAsync<Dictionary<string, object>>("/api/auth/me");
        Assert.NotNull(me);
        Assert.Equal(email, me!["email"].ToString());
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        var client = CreateClientWithCookies();
        var email = $"wrong{Guid.NewGuid()}@test.com";

        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" });
        register.EnsureSuccessStatusCode();

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "WrongPassword!" });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task Logout_ClearsAuthentication()
    {
        var client = CreateClientWithCookies();
        var email = $"logout{Guid.NewGuid()}@test.com";

        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" });
        register.EnsureSuccessStatusCode();

        var logout = await client.PostAsync("/api/auth/logout", null);
        logout.EnsureSuccessStatusCode();

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }
}
