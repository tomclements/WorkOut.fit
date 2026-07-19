using System.Text.Json;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class ExerciseDataTests
{
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
}
