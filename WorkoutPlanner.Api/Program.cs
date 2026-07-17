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

builder.Services.AddRateLimiter(options =>
{
    // Looser limits in development so tests don't trip over the limiter.
    var permitLimit = builder.Environment.IsDevelopment() ? 1000 : 5;
    options.AddFixedWindowLimiter("auth", opt =>
    {
        opt.PermitLimit = permitLimit;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });
});

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
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
builder.Services.Configure<SmtpSettings>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var app = builder.Build();

// Apply migrations and seed data on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsSqlite())
    {
        await db.Database.EnsureCreatedAsync();
    }
    else if (db.Database.IsRelational())
    {
        await db.Database.MigrateAsync();
    }
}

await SeedDataAsync(app.Services);

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Endpoint modules
app.MapWorkoutEndpoints();
app.MapAuthEndpoints();
app.MapPlanEndpoints();
app.MapRunnerEndpoints();
app.MapAdminEndpoints();
app.MapDashboardEndpoints();

app.Run();

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

static async Task SeedDataAsync(IServiceProvider services)
{
    using var scope = services.CreateScope();
    var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();

    if (!await roleManager.RoleExistsAsync("Admin"))
    {
        await roleManager.CreateAsync(new IdentityRole("Admin"));
    }

            // Seed a bootstrap admin.
            var adminEmail = config["Admin:Email"] ?? "tomclements@gmail.com";
            var adminPassword = config["Admin:Password"] ?? "AdminPass123!";
            const string oldBootstrapEmail = "tomcllements@gmail.com";

            // Fix the email if the old bootstrap email was already seeded.
            var oldAdmin = await userManager.FindByEmailAsync(oldBootstrapEmail);
            var newAdminUser = await userManager.FindByEmailAsync(adminEmail);
            if (oldAdmin != null && newAdminUser == null)
            {
                oldAdmin.UserName = adminEmail;
                oldAdmin.Email = adminEmail;
                oldAdmin.NormalizedUserName = userManager.NormalizeName(adminEmail);
                oldAdmin.NormalizedEmail = userManager.NormalizeEmail(adminEmail);
                await userManager.UpdateAsync(oldAdmin);
                newAdminUser = oldAdmin;
            }

            var adminEntry = await db.AdminUsers.FirstOrDefaultAsync(a => a.Email == adminEmail);
            if (adminEntry == null)
            {
                // No admin entry for the target email; seed one.
                var admin = newAdminUser ?? await userManager.FindByEmailAsync(adminEmail);
                if (admin == null)
                {
                    admin = new IdentityUser
                    {
                        UserName = adminEmail,
                        Email = adminEmail,
                        EmailConfirmed = true
                    };
                    await userManager.CreateAsync(admin, adminPassword);
                }

                if (!await userManager.IsInRoleAsync(admin, "Admin"))
                {
                    await userManager.AddToRoleAsync(admin, "Admin");
                }

                db.AdminUsers.Add(new AdminUser { Email = adminEmail });
                await db.SaveChangesAsync();
            }

    if (!await db.EquipmentOptions.AnyAsync())
    {
        var equipmentPath = Path.Combine(env.ContentRootPath, "Data", "equipment.json");
        var equipmentJson = File.ReadAllText(equipmentPath);
        var equipment = JsonSerializer.Deserialize<List<EquipmentOption>>(equipmentJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (equipment != null)
        {
            db.EquipmentOptions.AddRange(equipment);
            await db.SaveChangesAsync();
        }
    }

    if (!await db.Exercises.AnyAsync())
    {
        var exercisesPath = Path.Combine(env.ContentRootPath, "Data", "exercises.json");
        var exercisesJson = File.ReadAllText(exercisesPath);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(exercisesJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (exercises != null)
        {
            db.Exercises.AddRange(exercises);
            await db.SaveChangesAsync();
        }
    }
}

public partial class Program { }
