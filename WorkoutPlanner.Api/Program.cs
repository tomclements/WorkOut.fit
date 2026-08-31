using System.Text.Json;
using System.Threading.RateLimiting;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication.MicrosoftAccount;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Endpoints;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;
using WorkoutPlanner.Api.Validators;

var builder = WebApplication.CreateBuilder(args);

// Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=workoutplanner.db";

connectionString = NormalizeConnectionString(connectionString);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

// External authentication providers (must be registered before Identity so Identity can set the default schemes)
var googleClientId = builder.Configuration["Authentication:Google:ClientId"];
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
var microsoftClientId = builder.Configuration["Authentication:Microsoft:ClientId"];
var microsoftClientSecret = builder.Configuration["Authentication:Microsoft:ClientSecret"];

var authBuilder = builder.Services.AddAuthentication();

if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authBuilder.AddGoogle(options =>
    {
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
        options.CallbackPath = "/signin-google";
        options.Events.OnRemoteFailure = context =>
        {
            context.Response.Redirect("/?error=external-login");
            context.HandleResponse();
            return Task.CompletedTask;
        };
    });
}

if (!string.IsNullOrWhiteSpace(microsoftClientId) && !string.IsNullOrWhiteSpace(microsoftClientSecret))
{
    authBuilder.AddMicrosoftAccount(options =>
    {
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.ClientId = microsoftClientId;
        options.ClientSecret = microsoftClientSecret;
        options.CallbackPath = "/signin-microsoft";
        options.Events.OnRemoteFailure = context =>
        {
            context.Response.Redirect("/?error=external-login");
            context.HandleResponse();
            return Task.CompletedTask;
        };
    });
}

// Identity + cookies + roles
builder.Services.AddIdentity<IdentityUser, IdentityRole>(options =>
{
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 8;

    options.Lockout.AllowedForNewUsers = true;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
    options.Lockout.MaxFailedAccessAttempts = 5;

    options.User.RequireUniqueEmail = true;
})
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

var isDevOrTest = builder.Environment.IsDevelopment()
    || builder.Environment.IsEnvironment("Testing");

builder.Services.AddRateLimiter(options =>
{
    // Looser limits in development/tests so suites don't trip over the limiter.
    var permitLimit = isDevOrTest ? 1000 : 5;
    options.AddFixedWindowLimiter("auth", opt =>
    {
        opt.PermitLimit = permitLimit;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });
    var feedbackLimit = isDevOrTest ? 1000 : 8;
    options.AddFixedWindowLimiter("feedback", opt =>
    {
        opt.PermitLimit = feedbackLimit;
        opt.Window = TimeSpan.FromMinutes(10);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });
    var planLimit = isDevOrTest ? 1000 : 20;
    options.AddFixedWindowLimiter("plan", opt =>
    {
        opt.PermitLimit = planLimit;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.HttpOnly = true;
    // Testing host uses HTTP; Secure cookies would never be stored by the test client.
    options.Cookie.SecurePolicy = isDevOrTest
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = 401;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = 403;
        return Task.CompletedTask;
    };
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireRole("Admin"));
});

// Application services
builder.Services.AddSingleton<IWorkoutPlannerService, WorkoutPlannerService>();
builder.Services.AddScoped<IWorkoutSessionService, WorkoutSessionService>();
builder.Services.AddScoped<IExerciseImportService, ExerciseImportService>();
builder.Services.AddHttpClient("free-exercise-db", client =>
{
    client.Timeout = TimeSpan.FromMinutes(2);
                    client.DefaultRequestHeaders.UserAgent.ParseAdd("Plan4Strength/1.0 (exercise-import)");
});
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var app = builder.Build();

await DbInitializer.InitializeAsync(app.Services);

var webRoot = app.Environment.WebRootPath
    ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
if (!Directory.Exists(webRoot))
{
    // Docker / publish safety: ensure wwwroot exists next to the app
    var fallback = Path.Combine(AppContext.BaseDirectory, "wwwroot");
    if (Directory.Exists(fallback))
        webRoot = fallback;
}

app.UseDefaultFiles(new DefaultFilesOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(webRoot)
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(webRoot),
    RequestPath = ""
});
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Explicit HTML routes so pages never 404 if static middleware path is wrong
MapHtmlPage(app, webRoot, "/about.html", "about.html");
MapHtmlPage(app, webRoot, "/about", "about.html");
MapHtmlPage(app, webRoot, "/help.html", "help.html");
MapHtmlPage(app, webRoot, "/help", "help.html");
MapHtmlPage(app, webRoot, "/history.html", "history.html");
MapHtmlPage(app, webRoot, "/account.html", "account.html");
MapHtmlPage(app, webRoot, "/account", "account.html");
MapHtmlPage(app, webRoot, "/workout.html", "workout.html");
MapHtmlPage(app, webRoot, "/admin.html", "admin.html");
MapHtmlPage(app, webRoot, "/feedback.html", "feedback.html");
MapHtmlPage(app, webRoot, "/feedback", "feedback.html");
MapHtmlPage(app, webRoot, "/privacy.html", "privacy.html");
MapHtmlPage(app, webRoot, "/privacy", "privacy.html");

// Endpoint modules
app.MapHealthEndpoints();
app.MapBuildInfoEndpoints();
app.MapWorkoutEndpoints();
app.MapAuthEndpoints();
app.MapPlanEndpoints();
app.MapRunnerEndpoints();
app.MapAdminEndpoints();
app.MapDashboardEndpoints();
app.MapUserEndpoints();
app.MapBodyWeightEndpoints();
app.MapFeedbackEndpoints();

app.Run();

static void MapHtmlPage(WebApplication app, string webRoot, string route, string fileName)
{
    app.MapGet(route, () =>
    {
        var path = Path.Combine(webRoot, fileName);
        if (!File.Exists(path))
        {
            return Results.NotFound();
        }
        return Results.File(path, "text/html; charset=utf-8");
    }).AllowAnonymous();
}

static string NormalizeConnectionString(string cs)
{
    if (cs.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
        || cs.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(cs);
        var userInfo = uri.UserInfo;
        var colon = userInfo.IndexOf(':');
        var username = colon >= 0 ? Uri.UnescapeDataString(userInfo.Substring(0, colon)) : Uri.UnescapeDataString(userInfo);
        var password = colon >= 0 ? Uri.UnescapeDataString(userInfo.Substring(colon + 1)) : string.Empty;
        var host = uri.Host;
        var port = uri.Port > 0 ? uri.Port : 5432;
        var database = uri.AbsolutePath.TrimStart('/');
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = port,
            Username = username,
            Password = password,
            Database = database,
            SslMode = SslMode.Require
        };
        return builder.ConnectionString;
    }
    return cs;
}

public partial class Program { }
