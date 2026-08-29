using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public static class DbInitializer
{
    public static async Task InitializeAsync(IServiceProvider services)
    {
        var env = services.GetRequiredService<IWebHostEnvironment>();
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (db.Database.IsSqlite())
        {
            // SQLite has no EF migrations (existing ones use PostgreSQL array syntax).
            // EnsureCreated + manual patches covers dev and test; production SQLite
            // on Render should use the PostgreSQL database instead.
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                await db.Database.EnsureCreatedAsync();
                await EnsureFeedbackTableSqliteAsync(db);
                await EnsureWorkoutSessionWeekDaySqliteAsync(db);
                await EnsureBodyWeightTableSqliteAsync(db);
                await EnsureCompletedExerciseWeightSqliteAsync(db);
            }
            else
            {
                throw new InvalidOperationException(
                    "SQLite is not supported outside Development/Testing. Use a relational database (PostgreSQL) in production so schema patches are not skipped.");
            }
        }
        else if (db.Database.IsRelational())
        {
            // PostgreSQL production: apply EF migrations only.
            await db.Database.MigrateAsync();
        }

        await SeedDataAsync(scope.ServiceProvider);
    }

    public static async Task SeedDataAsync(IServiceProvider services)
    {
        var env = services.GetRequiredService<IWebHostEnvironment>();
        var db = services.GetRequiredService<AppDbContext>();
        var userManager = services.GetRequiredService<UserManager<IdentityUser>>();
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var config = services.GetRequiredService<IConfiguration>();

        if (!await roleManager.RoleExistsAsync("Admin"))
        {
            await roleManager.CreateAsync(new IdentityRole("Admin"));
        }

        var adminEmail = config["Admin:Email"] ?? "tomclements@gmail.com";
        var adminPassword = config["Admin:Password"] ?? "AdminPass123!";
        const string oldBootstrapEmail = "tomcllements@gmail.com";

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

        var equipmentPath = Path.Combine(env.ContentRootPath, "Data", "equipment.json");
        var equipmentJson = File.ReadAllText(equipmentPath);
        var seedEquipment = JsonSerializer.Deserialize<List<EquipmentOption>>(equipmentJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<EquipmentOption>();

        var existingEquipmentIds = await db.EquipmentOptions.Select(e => e.Id).ToListAsync();
        var existingEquipmentSet = new HashSet<string>(existingEquipmentIds, StringComparer.OrdinalIgnoreCase);
        var equipmentChanged = false;
        foreach (var eq in seedEquipment.Where(e => !existingEquipmentSet.Contains(e.Id)))
        {
            db.EquipmentOptions.Add(eq);
            equipmentChanged = true;
        }
        if (equipmentChanged)
            await db.SaveChangesAsync();

        var exercisesPath = Path.Combine(env.ContentRootPath, "Data", "exercises.json");
        var exercisesJson = File.ReadAllText(exercisesPath);
        var seedExercises = JsonSerializer.Deserialize<List<Exercise>>(exercisesJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<Exercise>();

        foreach (var se in seedExercises.Where(s => s.Mechanics != null))
            se.AvoidFor = InjuryRules.ComputeAvoidance(se);

        var existingExercises = await db.Exercises.ToListAsync();
        var existingExerciseIds = new HashSet<string>(existingExercises.Select(e => e.Id), StringComparer.OrdinalIgnoreCase);
        var seedById = seedExercises.ToDictionary(e => e.Id, StringComparer.OrdinalIgnoreCase);
        var exerciseChanged = false;

        foreach (var ex in existingExercises)
        {
            if (!seedById.TryGetValue(ex.Id, out var seed)) continue;
            if (!string.IsNullOrWhiteSpace(seed.ImageUrl) && ex.ImageUrl != seed.ImageUrl)
            {
                ex.ImageUrl = seed.ImageUrl;
                exerciseChanged = true;
            }
            if (!string.IsNullOrWhiteSpace(seed.DemoUrl) && ex.DemoUrl != seed.DemoUrl)
            {
                var seedIsExRx = seed.DemoUrl.Contains("exrx.net", StringComparison.OrdinalIgnoreCase);
                var currentIsGenericSearch = string.IsNullOrWhiteSpace(ex.DemoUrl)
                    || ex.DemoUrl.Contains("youtube.com/results", StringComparison.OrdinalIgnoreCase)
                    || ex.DemoUrl.Contains("search_query=", StringComparison.OrdinalIgnoreCase);
                if (seedIsExRx || currentIsGenericSearch || string.IsNullOrWhiteSpace(ex.DemoUrl))
                {
                    ex.DemoUrl = seed.DemoUrl;
                    exerciseChanged = true;
                }
            }
            if (seed.Equipment is { Count: > 0 }
                && !EquipmentListsEqual(ex.Equipment, seed.Equipment))
            {
                ex.Equipment = seed.Equipment.ToList();
                exerciseChanged = true;
            }
            if (!string.IsNullOrWhiteSpace(seed.Slot) && ex.Slot != seed.Slot)
            {
                ex.Slot = seed.Slot;
                exerciseChanged = true;
            }
            if (!string.IsNullOrWhiteSpace(seed.Force) && ex.Force != seed.Force)
            {
                ex.Force = seed.Force;
                exerciseChanged = true;
            }
            if (!string.IsNullOrWhiteSpace(seed.Mechanic) && ex.Mechanic != seed.Mechanic)
            {
                ex.Mechanic = seed.Mechanic;
                exerciseChanged = true;
            }
            if (!AvoidForListsEqual(ex.AvoidFor, seed.AvoidFor))
            {
                ex.AvoidFor = seed.AvoidFor?.ToList() ?? new List<string>();
                exerciseChanged = true;
            }
        }

        foreach (var seed in seedExercises.Where(e => !existingExerciseIds.Contains(e.Id)))
        {
            db.Exercises.Add(seed);
            exerciseChanged = true;
        }

        if (exerciseChanged)
            await db.SaveChangesAsync();
    }

    private static bool EquipmentListsEqual(List<string>? a, List<string>? b)
    {
        a ??= new List<string>();
        b ??= new List<string>();
        if (a.Count != b.Count) return false;
        var sa = a.Select(x => x.ToLowerInvariant()).OrderBy(x => x);
        var sb = b.Select(x => x.ToLowerInvariant()).OrderBy(x => x);
        return sa.SequenceEqual(sb);
    }

    private static bool AvoidForListsEqual(List<string>? a, List<string>? b)
    {
        a ??= new List<string>();
        b ??= new List<string>();
        if (a.Count != b.Count) return false;
        var sa = a.Select(x => x.Trim().ToLowerInvariant()).OrderBy(x => x);
        var sb = b.Select(x => x.Trim().ToLowerInvariant()).OrderBy(x => x);
        return sa.SequenceEqual(sb);
    }

    private static async Task EnsureFeedbackTableSqliteAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "FeedbackMessages" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_FeedbackMessages" PRIMARY KEY AUTOINCREMENT,
                "CreatedAt" TEXT NOT NULL,
                "Category" TEXT NOT NULL,
                "Message" TEXT NOT NULL,
                "ContactEmail" TEXT NULL,
                "PageUrl" TEXT NULL,
                "UserAgent" TEXT NULL,
                "UserId" TEXT NULL,
                "UserEmail" TEXT NULL,
                "IpHash" TEXT NULL,
                "IsRead" INTEGER NOT NULL DEFAULT 0
            );
            """);
        try
        {
            await db.Database.ExecuteSqlRawAsync(
                """CREATE INDEX IF NOT EXISTS "IX_FeedbackMessages_CreatedAt" ON "FeedbackMessages" ("CreatedAt");""");
            await db.Database.ExecuteSqlRawAsync(
                """CREATE INDEX IF NOT EXISTS "IX_FeedbackMessages_IsRead" ON "FeedbackMessages" ("IsRead");""");
        }
        catch
        {
        }
    }

    private static async Task EnsureWorkoutSessionWeekDaySqliteAsync(AppDbContext db)
    {
        try
        {
            var cols = await db.Database.SqlQueryRaw<string>("""
                SELECT name FROM pragma_table_info("WorkoutSessions")
                """).ToListAsync();
            if (!cols.Contains("Week"))
            {
                await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "WorkoutSessions" ADD COLUMN "Week" INTEGER NOT NULL DEFAULT 1;""");
            }
            if (!cols.Contains("DayIndex"))
            {
                await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "WorkoutSessions" ADD COLUMN "DayIndex" INTEGER NOT NULL DEFAULT 0;""");
            }
        }
        catch
        {
        }
    }

    private static async Task EnsureBodyWeightTableSqliteAsync(AppDbContext db)
    {
        try
        {
            var tables = await db.Database.SqlQueryRaw<string>("""
                SELECT name FROM sqlite_master WHERE type = 'table'
                """).ToListAsync();
            if (!tables.Contains("BodyWeightEntries"))
            {
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE TABLE "BodyWeightEntries" (
                        "Id" INTEGER NOT NULL CONSTRAINT "PK_BodyWeightEntries" PRIMARY KEY AUTOINCREMENT,
                        "UserId" TEXT NOT NULL,
                        "WeightKg" TEXT NOT NULL,
                        "WeighedAt" TEXT NOT NULL,
                        "CreatedAt" TEXT NOT NULL
                    );
                    """);
                await db.Database.ExecuteSqlRawAsync("""
                    CREATE INDEX IF NOT EXISTS "IX_BodyWeightEntries_UserId_WeighedAt" ON "BodyWeightEntries" ("UserId", "WeighedAt");
                    """);
            }
        }
        catch
        {
        }
    }

    private static async Task EnsureCompletedExerciseWeightSqliteAsync(AppDbContext db)
    {
        try
        {
            await db.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "CompletedExercises" ADD COLUMN "WeightKg" TEXT NULL;""");
        }
        catch
        {
        }
    }
}
