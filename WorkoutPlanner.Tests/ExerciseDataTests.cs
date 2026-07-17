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
        var known = new[] { "legs", "push", "pull", "core", "carry", "total" };
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var json = File.ReadAllText(path);
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        Assert.All(exercises, ex => Assert.Contains(ex.Slot, known));
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
