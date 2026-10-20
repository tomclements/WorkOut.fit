using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Tests;

public class RotatorCuffDependentLoadTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;
    private static readonly List<Exercise> Catalog = LoadCatalog();

    private static readonly HashSet<string> ForbiddenIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "db-lunge",
        "dumbbell-lunges",
        "dumbbell-rear-lunge",
        "split-squat-with-dumbbells",
        "db-step-up",
        "dumbbell-step-ups",
        "db-romanian-deadlift",
        "stiff-legged-dumbbell-deadlift",
        "romanian-deadlift",
        "stiff-legged-barbell-deadlift",
        "smith-machine-stiff-legged-deadlift",
        "standing-dumbbell-calf-raise",
        "calf-raise-on-a-dumbbell"
    };

    public RotatorCuffDependentLoadTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    public static TheoryData<List<string>, string, int> RestrictionCases()
    {
        var data = new TheoryData<List<string>, string, int>();
        var equipmentSets = new List<List<string>>
        {
            new() { "dumbbells" },
            new() { "dumbbells", "bench" },
            new() { "barbell", "machines" },
            new() { "barbell", "dumbbells", "bench", "machines" }
        };
        var splits = new[] { "full-body", "upper-lower", "bro-split" };
        var seeds = new[] { 1001, 2002, 3003 };

        foreach (var eq in equipmentSets)
        foreach (var split in splits)
        foreach (var seed in seeds)
            data.Add(eq, split, seed);

        return data;
    }

    [Theory]
    [MemberData(nameof(RestrictionCases))]
    public async Task Plan_WithRotatorCuffRestriction_ExcludesDependentLoad(
        List<string> equipment, string split, int seed)
    {
        var (daysPerWeek, workoutDays) = split switch
        {
            "full-body" => (3, new[] { 0, 2, 4 }),
            "upper-lower" => (4, new[] { 0, 1, 3, 4 }),
            "bro-split" => (5, new[] { 0, 1, 2, 3, 4 }),
            _ => throw new ArgumentOutOfRangeException(nameof(split))
        };

        var json = $@"{{
  ""seed"": {seed},
  ""weeks"": 4,
  ""daysPerWeek"": {daysPerWeek},
  ""workoutDays"": [{string.Join(",", workoutDays)}],
  ""sessionMinutes"": 45,
  ""equipment"": [{string.Join(",", equipment.Select(e => $"\"{e}\""))}],
  ""split"": ""{split}"",
  ""goal"": ""hypertrophy"",
  ""level"": ""beginner"",
  ""includeWarmup"": true,
  ""includeCooldown"": true,
  ""restrictions"": [""rotator-cuff""],
  ""rehab"": [],
  ""favoriteExerciseIds"": [],
  ""dislikedExerciseIds"": [],
  ""avoidExerciseIds"": [],
  ""progression"": ""linear"",
  ""mixMode"": ""strength""
}}";

        var response = await _client.PostAsync("/api/plan", new StringContent(json, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var node = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        var workExercises = node["plan"]!
            .AsArray()
            .SelectMany(w => w!["days"]!.AsArray())
            .Where(d => d!["type"]!.GetValue<string>() == "workout")
            .SelectMany(d => d!["exercises"]!.AsArray())
            .Where(e =>
            {
                var phase = e!["phase"]?.GetValue<string>();
                return string.IsNullOrEmpty(phase) || phase == "work";
            })
            .ToList();

        Assert.NotEmpty(workExercises);

        foreach (var exNode in workExercises)
        {
            var id = exNode!["id"]!.GetValue<string>();
            Assert.DoesNotContain(id, ForbiddenIds);

            var catalogEntry = Catalog.FirstOrDefault(e =>
                string.Equals(e.Id, id, StringComparison.OrdinalIgnoreCase));
            Assert.NotNull(catalogEntry);

            var m = catalogEntry!.Mechanics;
            Assert.False(
                m is { Shoulder: "dependent" },
                $"{id} has shoulder mechanics 'dependent' and should be excluded for rotator-cuff restriction");
            Assert.False(
                m is { GripLoad: true, Hip: "hinge" },
                $"{id} is a grip-loaded hip hinge and should be excluded for rotator-cuff restriction");
        }
    }

    private static List<Exercise> LoadCatalog()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        return JsonSerializer.Deserialize<List<Exercise>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    }
}
