using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using WorkoutPlanner.Api.Services;

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

    [Fact]
    public async Task ForgotPassword_UnknownEmail_ReturnsGenericSuccessWithoutResetLink()
    {
        var fake = new FakeEmailService { SendResult = true };
        using var derived = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services => services.AddSingleton<IEmailService>(fake));
        });
        var client = derived.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = $"unknown{Guid.NewGuid()}@test.com" });
        await AssertForgotPasswordGenericContract(response);
    }

    [Fact]
    public async Task ForgotPassword_RegisteredUser_WhenEmailSendReturnsFalse_ReturnsGenericSuccessWithoutResetLink()
    {
        var fake = new FakeEmailService { SendResult = false };
        using var derived = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services => services.AddSingleton<IEmailService>(fake));
        });
        var client = derived.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var email = $"forgotfalse{Guid.NewGuid()}@test.com";

        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" });
        register.EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        await AssertForgotPasswordGenericContract(response);
    }

    [Fact]
    public async Task ForgotPassword_RegisteredUser_WhenEmailSendSucceeds_ReturnsGenericSuccessAndSendsResetLink()
    {
        var fake = new FakeEmailService { SendResult = true };
        using var derived = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services => services.AddSingleton<IEmailService>(fake));
        });
        var client = derived.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var email = $"forgottrue{Guid.NewGuid()}@test.com";

        var register = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Password123!" });
        register.EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        await AssertForgotPasswordGenericContract(response);

        Assert.Equal(1, fake.CallCount);
        Assert.Equal(email, fake.LastTo);
        Assert.False(string.IsNullOrEmpty(fake.LastHtmlBody));
        Assert.Contains("/reset-password.html", fake.LastHtmlBody, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task AssertForgotPasswordGenericContract(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("resetLink", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("url", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("callbackPath", raw, StringComparison.OrdinalIgnoreCase);

        using var doc = JsonDocument.Parse(raw);
        var names = doc.RootElement.EnumerateObject().Select(p => p.Name).ToArray();
        Assert.Equal(new[] { "message" }, names);
        Assert.Equal("If that email is registered, a reset link has been sent.", doc.RootElement.GetProperty("message").GetString());
    }

    private sealed class FakeEmailService : IEmailService
    {
        public bool SendResult { get; set; } = true;
        public int CallCount { get; private set; }
        public string? LastTo { get; private set; }
        public string? LastHtmlBody { get; private set; }

        public Task<bool> SendEmailAsync(string to, string subject, string htmlBody)
        {
            CallCount++;
            LastTo = to;
            LastHtmlBody = htmlBody;
            return Task.FromResult(SendResult);
        }
    }
}
