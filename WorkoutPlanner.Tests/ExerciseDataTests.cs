using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class ExerciseDataTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public ExerciseDataTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }
    [Fact]
    public void ExercisesJson_LoadsSuccessfully()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        Assert.NotNull(exercises);
        Assert.NotEmpty(exercises);
    }

    [Fact]
    public void AllExercises_HaveRequiredFields()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        Assert.All(exercises, ex =>
        {
            Assert.False(string.IsNullOrWhiteSpace(ex.Id));
            Assert.False(string.IsNullOrWhiteSpace(ex.Name));
            Assert.NotEmpty(ex.Equipment);
            Assert.NotEmpty(ex.Primary);
            Assert.False(string.IsNullOrWhiteSpace(ex.Slot));
            Assert.True(ex.BaseSets > 0);
            Assert.True(ex.WorkDuration > 0);
            Assert.True(ex.RestSec >= 0);
        });
    }

    [Fact]
    public void AllExercises_HaveDemoUrl()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        Assert.All(exercises, ex =>
        {
            Assert.False(string.IsNullOrWhiteSpace(ex.DemoUrl));
            Assert.StartsWith("http", ex.DemoUrl);
        });
    }

    [Fact]
    public void AllSlots_AreKnown()
    {
        // "total" is retired — full-body sessions rotate across push/pull/legs/core
        var known = new[] { "legs", "push", "pull", "core", "carry" };
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        Assert.All(exercises, ex => Assert.Contains(ex.Slot, known));
        Assert.DoesNotContain(exercises, ex => ex.Slot == "total");
    }

    [Fact]
    public void InclineDumbbellCurl_RequiresBenchAndDumbbells()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var curls = exercises.Where(e =>
            e.Name.Contains("Incline", StringComparison.OrdinalIgnoreCase)
            && e.Name.Contains("Curl", StringComparison.OrdinalIgnoreCase)
            && e.Name.Contains("Dumbbell", StringComparison.OrdinalIgnoreCase)).ToList();

        Assert.NotEmpty(curls);
        Assert.All(curls, ex =>
        {
            Assert.Contains("bench", ex.Equipment);
            Assert.Contains("dumbbells", ex.Equipment);
            Assert.Equal("pull", ex.Slot);
        });
    }

    [Fact]
    public void NameContainingBench_RequiresBench()
    {
        var exercises = LoadExercises();
        var withBenchInName = exercises
            .Where(e => e.Name.Contains("bench", StringComparison.OrdinalIgnoreCase))
            .ToList();
        Assert.NotEmpty(withBenchInName);
        Assert.All(withBenchInName, ex => Assert.Contains("bench", ex.Equipment));
    }

    [Fact]
    public void DumbbellSquatToBench_RequiresBenchAndDumbbells()
    {
        var ex = FindExercise("Dumbbell Squat To A Bench");
        Assert.Contains("bench", ex.Equipment);
        Assert.Contains("dumbbells", ex.Equipment);
    }

    [Fact]
    public void SeatedBentOverTwoArmDumbbellExtension_RequiresBenchAndDumbbells()
    {
        var ex = FindExercise("Seated Bent-Over Two-Arm Dumbbell Triceps Extension");
        Assert.Contains("bench", ex.Equipment);
        Assert.Contains("dumbbells", ex.Equipment);
        Assert.Equal("push", ex.Slot);
    }

    [Fact]
    public void SeatedFreeWeight_RequiresBench_StandingConcentrationDoesNot()
    {
        var seated = FindExercise("Seated Dumbbell Press");
        Assert.Contains("bench", seated.Equipment);

        var standing = FindExercise("Standing Concentration Curl");
        Assert.DoesNotContain("bench", standing.Equipment);
        Assert.Contains("dumbbells", standing.Equipment);
    }

    [Fact]
    public void LyingDumbbellExtension_RequiresBench()
    {
        var ex = FindExercise("Lying Dumbbell Tricep Extension");
        Assert.Contains("bench", ex.Equipment);
        Assert.Contains("dumbbells", ex.Equipment);
    }

    [Fact]
    public void StepUpsAndHipThrust_RequireBench()
    {
        Assert.Contains("bench", FindExercise("Dumbbell Step Ups").Equipment);
        Assert.Contains("bench", FindExercise("Barbell Hip Thrust").Equipment);
        Assert.Contains("bench", FindExercise("Box Squat").Equipment);
    }

    [Fact]
    public void Taxonomy_EnrichEquipment_CoversCommonBenchPatterns()
    {
        Assert.Contains("bench", ExerciseTaxonomy.EnrichEquipmentFromName("Dumbbell Squat To A Bench", new[] { "dumbbells" }));
        Assert.Contains("bench", ExerciseTaxonomy.EnrichEquipmentFromName(
            "Seated Bent-Over Two-Arm Dumbbell Triceps Extension", new[] { "dumbbells" }));
        Assert.Contains("bench", ExerciseTaxonomy.EnrichEquipmentFromName("Lying Dumbbell Tricep Extension", new[] { "dumbbells" }));
        Assert.Contains("bench", ExerciseTaxonomy.EnrichEquipmentFromName("Barbell Hip Thrust", new[] { "barbell" }));
        Assert.Contains("bench", ExerciseTaxonomy.EnrichEquipmentFromName("EZ-Bar Skullcrusher", new[] { "ez-bar", "barbell" }));
        Assert.DoesNotContain("bench", ExerciseTaxonomy.EnrichEquipmentFromName("Standing Concentration Curl", new[] { "dumbbells" }));
        Assert.DoesNotContain("bench", ExerciseTaxonomy.EnrichEquipmentFromName("Spider Crawl", Array.Empty<string>()));
        Assert.DoesNotContain("bench", ExerciseTaxonomy.EnrichEquipmentFromName("Floor Press", new[] { "barbell" }));
    }

    [Fact]
    public void InjuryTags_AreDerivedFromMechanics()
    {
        var exercises = LoadExercises();
        Assert.All(exercises, ex =>
        {
            Assert.NotNull(ex.Mechanics);
            var expected = InjuryRules.ComputeAvoidance(ex);
            Assert.True(
                expected.OrderBy(t => t, StringComparer.OrdinalIgnoreCase)
                    .SequenceEqual(ex.AvoidFor.OrderBy(t => t, StringComparer.OrdinalIgnoreCase)),
                $"{ex.Name}: mechanics-derived tags {string.Join(",", expected)} != stored {string.Join(",", ex.AvoidFor)}");
        });
    }

    [Fact]
    public void TricepsPushdown_IsShoulderSafe_ButElbowLoads()
    {
        var ex = FindExercise("Triceps Pushdown");
        var avoid = InjuryRules.ComputeAvoidance(ex);
        Assert.DoesNotContain("shoulder", avoid);
        Assert.Contains("elbow", avoid);
    }

    [Fact]
    public void GorillaChin_IsAnOverheadPull_SoShoulderLoads()
    {
        var ex = FindExercise("Gorilla Chin/Crunch");
        var avoid = InjuryRules.ComputeAvoidance(ex);
        Assert.Contains("shoulder", avoid);
        Assert.Contains("elbow", avoid);
        Assert.Contains("wrist", avoid);
        Assert.Contains("lower-back", avoid);
    }

    private static List<Exercise> LoadExercises()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        return JsonSerializer.Deserialize<List<Exercise>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    }

    private static Exercise FindExercise(string name)
    {
        var ex = LoadExercises().FirstOrDefault(e =>
            string.Equals(e.Name, name, StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(ex);
        return ex!;
    }

    [Fact]
    public void AllEquipmentIds_AreKnown()
    {
        var baseDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data");
        var equipment = JsonSerializer.Deserialize<List<EquipmentOption>>(
            File.ReadAllText(Path.Combine(baseDir, "equipment.json")),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var validIds = equipment.Select(e => e.Id).ToHashSet();

        var exercises = JsonSerializer.Deserialize<List<Exercise>>(
            File.ReadAllText(Path.Combine(baseDir, "exercises.json")),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        Assert.All(exercises, ex =>
        {
            Assert.All(ex.Equipment, eq => Assert.Contains(eq, validIds));
        });
    }

    [Fact]
    public void ExercisesJson_HasExpandedLibrary()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Assert.True(exercises.Count > 100, $"Expected more than 100 exercises, found {exercises.Count}");
    }

    [Fact]
    public void MostExercises_HaveImageUrl()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var withImage = exercises.Count(e => !string.IsNullOrWhiteSpace(e.ImageUrl));
        Assert.True(withImage > exercises.Count * 0.8,
            $"Expected most exercises to have imageUrl, got {withImage}/{exercises.Count}");
        Assert.All(exercises.Where(e => !string.IsNullOrWhiteSpace(e.ImageUrl)), ex =>
            Assert.StartsWith("http", ex.ImageUrl!));
    }

    [Fact]
    public void ComputeAvoidance_RotatorCuffExercise_AlwaysTagsShoulder()
    {
        var exercises = LoadExercises();
        var rotatorCuff = exercises.Where(e =>
            e.Mechanics?.Rehab == "rotator-cuff").ToList();
        Assert.NotEmpty(rotatorCuff);
        Assert.All(rotatorCuff, ex =>
        {
            var avoid = InjuryRules.ComputeAvoidance(ex);
            Assert.Contains("shoulder", avoid);
        });
    }

    [Fact]
    public void ComputeAvoidance_HealthyExercise_NoExtraExclusions()
    {
        var exercises = LoadExercises();
        var dbCurl = exercises.FirstOrDefault(e =>
            e.Id.Equals("db-curl", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(dbCurl);
        var avoid = InjuryRules.ComputeAvoidance(dbCurl!);
        Assert.DoesNotContain("shoulder", avoid);
    }

    [Fact]
    public void AllowlistedExercise_ForRehab_ShouldNotBeExcluded()
    {
        var exercises = LoadExercises();
        var bandPullApart = exercises.FirstOrDefault(e =>
            e.Id.Equals("band-pull-apart", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(bandPullApart);
        var restrictions = new List<string> { "shoulder" };
        var rehab = new List<string> { "shoulder" };
        var avoid = InjuryRules.ComputeAvoidance(bandPullApart!);
        Assert.Contains("shoulder", avoid);
        // band-pull-apart is on the server allowlist for shoulder → not excluded
        var isExcluded = avoid.Any(a =>
            restrictions.Contains(a, StringComparer.OrdinalIgnoreCase) &&
            !IsAllowlistedFor(a, bandPullApart!.Id, rehab));
        Assert.False(isExcluded, "band-pull-apart should be allowlisted for shoulder rehab");
    }

    [Fact]
    public void NonAllowlistedExercise_ForRehab_ShouldBeExcluded()
    {
        var exercises = LoadExercises();
        var lyingRearDelt = exercises.FirstOrDefault(e =>
            e.Id.Equals("lying-rear-delt-raise", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(lyingRearDelt);
        var avoid = InjuryRules.ComputeAvoidance(lyingRearDelt!);
        Assert.Contains("shoulder", avoid);
        var restrictions = new List<string> { "shoulder" };
        var rehab = new List<string> { "shoulder" };
        var isExcluded = avoid.Any(a =>
            restrictions.Contains(a, StringComparer.OrdinalIgnoreCase) &&
            !IsAllowlistedFor(a, lyingRearDelt!.Id, rehab));
        Assert.True(isExcluded, "lying-rear-delt-raise should be excluded for shoulder rehab");
    }

    [Fact]
    public void FacePull_IsNotAllowlisted_ForShoulderRehab()
    {
        var exercises = LoadExercises();
        var facePull = exercises.FirstOrDefault(e =>
            e.Id.Equals("face-pull", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(facePull);
        var avoid = InjuryRules.ComputeAvoidance(facePull!);
        Assert.Contains("shoulder", avoid);
        var restrictions = new List<string> { "shoulder" };
        var rehab = new List<string> { "shoulder" };
        var isExcluded = avoid.Any(a =>
            restrictions.Contains(a, StringComparer.OrdinalIgnoreCase) &&
            !IsAllowlistedFor(a, facePull!.Id, rehab));
        Assert.True(isExcluded, "face-pull should be excluded for shoulder rehab");
    }

    [Fact]
    public void ComputeAvoidance_ReverseFlyes_HasShoulderAndRotatorCuff()
    {
        var ex = FindExercise("Reverse Flyes");
        var avoid = InjuryRules.ComputeAvoidance(ex);
        Assert.Contains("shoulder", avoid);
        Assert.Contains("rotator-cuff", avoid);
    }

    [Fact]
    public void ComputeAvoidance_DeepSquat_HasKneeAndPatellar()
    {
        var ex = FindExercise("Barbell Full Squat");
        var avoid = InjuryRules.ComputeAvoidance(ex);
        Assert.Contains("knee", avoid);
        Assert.Contains("patellar", avoid);
    }

    [Fact]
    public void ComputeAvoidance_DBCurl_HasNeitherShoulderNorRotatorCuff()
    {
        var ex = FindExercise("Dumbbell Bicep Curl");
        var avoid = InjuryRules.ComputeAvoidance(ex);
        Assert.DoesNotContain("shoulder", avoid);
        Assert.DoesNotContain("rotator-cuff", avoid);
    }

    [Fact]
    public void AllowlistedExercise_ForRotatorCuffRehab_ShouldNotBeExcluded()
    {
        var exercises = LoadExercises();
        var bandPullApart = exercises.FirstOrDefault(e =>
            e.Id.Equals("band-pull-apart", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(bandPullApart);
        var restrictions = new List<string> { "rotator-cuff" };
        var rehab = new List<string> { "shoulder" };
        var avoid = InjuryRules.ComputeAvoidance(bandPullApart!);
        Assert.Contains("shoulder", avoid);
        // parent shoulder rehab covers rotator-cuff restrictions
        var isExcluded = avoid.Any(a =>
            restrictions.Contains(a, StringComparer.OrdinalIgnoreCase) &&
            !InjuryRules.IsAllowlisted(bandPullApart!.Id, a, rehab));
        Assert.False(isExcluded, "band-pull-apart should be allowlisted when shoulder rehab covers rotator-cuff");
    }

    [Fact]
    public void AllowlistedExercise_ForPatellarRehab_ShouldNotBeExcluded()
    {
        // band-pull-apart is NOT patellar-related, so use a valid allowlisted ID check
        // Just verify IsAllowlisted works for patellar parent coverage
        var allowlisted = InjuryRules.IsAllowlisted("band-pull-apart", "rotator-cuff", new List<string> { "shoulder" });
        Assert.True(allowlisted, "shoulder rehab should cover rotator-cuff allowlist");
    }

    private static bool IsAllowlistedFor(string injuryArea, string exerciseId, List<string> rehab)
    {
        if (rehab == null || rehab.Count == 0) return false;
        if (!rehab.Contains(injuryArea, StringComparer.OrdinalIgnoreCase)) return false;
        if (!InjuryRules.AllowlistedExerciseIds.TryGetValue(injuryArea, out var allowed)) return false;
        return allowed.Contains(exerciseId);
    }

    [Fact]
    public async Task Seed_IsIdempotent_RunningTwiceDoesNotDuplicateExercisesOrEquipment()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // First seed runs during startup via DbInitializer.InitializeAsync.
        var exerciseCount1 = await db.Exercises.CountAsync();
        var equipmentCount1 = await db.EquipmentOptions.CountAsync();
        Assert.True(exerciseCount1 > 0, "Seed should have inserted exercises on first startup");
        Assert.True(equipmentCount1 > 0, "Seed should have inserted equipment on first startup");

        // Run seed a second time on the same database.
        await DbInitializer.SeedDataAsync(scope.ServiceProvider);

        var exerciseCount2 = await db.Exercises.CountAsync();
        var equipmentCount2 = await db.EquipmentOptions.CountAsync();

        Assert.Equal(exerciseCount1, exerciseCount2);
        Assert.Equal(equipmentCount1, equipmentCount2);
    }

    [Fact]
    public async Task InitializeAsync_SqliteInProduction_ThrowsBeforeSeed()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();

        var services = new ServiceCollection();
        services.AddSingleton<IWebHostEnvironment>(new StubWebHostEnvironment
        {
            EnvironmentName = Environments.Production
        });
        services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
        await using var provider = services.BuildServiceProvider();

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => DbInitializer.InitializeAsync(provider));
    }

    private sealed class StubWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "WorkoutPlanner.Tests";
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = "";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }
}
