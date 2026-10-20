using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

/// <summary>
/// Golden baseline tests for the Longevity Legs feature.
///
/// NORMALIZATION:
/// - The only non-deterministic value in the response is "generatedAt" (wall clock, ISO 8601).
///   It is replaced with the constant "1970-01-01T00:00:00.0000000Z".
/// - Seeds are fixed in the request body, so exercise selection is deterministic.
/// - The response contains no ids, GUIDs, or other clocks.
/// - JSON is re-indented with WriteIndented=true.
/// - Line endings are normalized to LF (\n).
///
/// REGENERATION:
/// - Set environment variable LONGEVITY_UPDATE_GOLDENS=1 and run:
///   dotnet test --nologo --filter "FullyQualifiedName~LongevityLegsTests"
/// - This writes the normalized output to WorkoutPlanner.Tests/Golden/{name}.json.
/// </summary>
public class LongevityLegsTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client;

    public LongevityLegsTests(TestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    public static TheoryData<string, string> BaselineCases()
    {
        return new TheoryData<string, string>
        {
            {
                "a-fullbody-3d-dumbbells",
                """
                {
                  "seed": 1001,
                  "weeks": 4,
                  "daysPerWeek": 3,
                  "workoutDays": [0, 2, 4],
                  "sessionMinutes": 45,
                  "equipment": ["dumbbells"],
                  "split": "full-body",
                  "goal": "hypertrophy",
                  "level": "beginner",
                  "includeWarmup": true,
                  "includeCooldown": true,
                  "restrictions": [],
                  "rehab": [],
                  "favoriteExerciseIds": [],
                  "dislikedExerciseIds": [],
                  "avoidExerciseIds": [],
                  "progression": "linear",
                  "mixMode": "strength"
                }
                """
            },
            {
                "b-upperlower-4d-barbell-machines-rotatorcuff",
                """
                {
                  "seed": 2002,
                  "weeks": 4,
                  "daysPerWeek": 4,
                  "workoutDays": [0, 1, 3, 4],
                  "sessionMinutes": 45,
                  "equipment": ["barbell", "machines"],
                  "split": "upper-lower",
                  "goal": "hypertrophy",
                  "level": "intermediate",
                  "includeWarmup": true,
                  "includeCooldown": true,
                  "restrictions": ["rotator-cuff"],
                  "rehab": [],
                  "favoriteExerciseIds": [],
                  "dislikedExerciseIds": [],
                  "avoidExerciseIds": [],
                  "progression": "linear",
                  "mixMode": "strength"
                }
                """
            },
            {
                "c-brosplit-5d-bodyweight-short",
                """
                {
                  "seed": 3003,
                  "weeks": 4,
                  "daysPerWeek": 5,
                  "workoutDays": [0, 1, 2, 3, 4],
                  "sessionMinutes": 20,
                  "equipment": ["bodyweight"],
                  "split": "bro-split",
                  "goal": "hypertrophy",
                  "level": "beginner",
                  "includeWarmup": true,
                  "includeCooldown": true,
                  "restrictions": [],
                  "rehab": [],
                  "favoriteExerciseIds": [],
                  "dislikedExerciseIds": [],
                  "avoidExerciseIds": [],
                  "progression": "linear",
                  "mixMode": "strength"
                }
                """
            }
        };
    }

    [Theory]
    [MemberData(nameof(BaselineCases))]
    public async Task Off_PlanIsByteIdenticalToBaseline(string name, string omittedJson)
    {
        var omittedResponse = await _client.PostAsync("/api/plan", BuildJsonContent(omittedJson));
        Assert.Equal(HttpStatusCode.OK, omittedResponse.StatusCode);

        var explicitFalseJson = AddIncludeLongevityLegsFalse(omittedJson);
        var explicitFalseResponse = await _client.PostAsync("/api/plan", BuildJsonContent(explicitFalseJson));
        Assert.Equal(HttpStatusCode.OK, explicitFalseResponse.StatusCode);

        var omitted = await NormalizeResponseAsync(omittedResponse);
        var explicitFalse = await NormalizeResponseAsync(explicitFalseResponse);

        Assert.Equal(omitted, explicitFalse);

        var sourceGoldenDir = FindSourceGoldenDirectory();
        var sourcePath = Path.Combine(sourceGoldenDir, $"{name}.json");

        string? updateError = null;
        if (Environment.GetEnvironmentVariable("LONGEVITY_UPDATE_GOLDENS") == "1")
        {
            Directory.CreateDirectory(sourceGoldenDir);
            try
            {
                await File.WriteAllTextAsync(
                    sourcePath,
                    omitted,
                    new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            }
            catch (Exception ex)
            {
                updateError = ex.Message;
            }
        }

        var goldenPath = Path.Combine(AppContext.BaseDirectory, "Golden", $"{name}.json");
        string golden;
        if (Environment.GetEnvironmentVariable("LONGEVITY_UPDATE_GOLDENS") == "1")
        {
            if (!File.Exists(sourcePath))
            {
                Assert.Fail($"Golden was not written to source path: {sourcePath}. Update failed.");
            }
            golden = (await File.ReadAllTextAsync(sourcePath)).Replace("\r\n", "\n");
        }
        else if (File.Exists(goldenPath))
        {
            golden = (await File.ReadAllTextAsync(goldenPath)).Replace("\r\n", "\n");
        }
        else
        {
            var howToRegenerate = "Set environment variable LONGEVITY_UPDATE_GOLDENS=1 and run: dotnet test --nologo --filter \"FullyQualifiedName~LongevityLegsTests\"";
            Assert.Fail($"Golden file not found: {goldenPath}. {howToRegenerate}");
            return;
        }

        Assert.Equal(golden, omitted);
        Assert.Null(updateError);
    }

    private static StringContent BuildJsonContent(string json)
    {
        return new StringContent(json, Encoding.UTF8, "application/json");
    }

    private static string AddIncludeLongevityLegsFalse(string omittedJson)
    {
        var node = JsonNode.Parse(omittedJson) ?? throw new InvalidOperationException("Failed to parse JSON");
        node["includeLongevityLegs"] = false;
        return node.ToJsonString();
    }

    private static async Task<string> NormalizeResponseAsync(HttpResponseMessage response)
    {
        var json = await response.Content.ReadAsStringAsync();
        var node = JsonNode.Parse(json) ?? throw new InvalidOperationException("Failed to parse response");
        node["generatedAt"] = "1970-01-01T00:00:00.0000000Z";
        var options = new JsonSerializerOptions { WriteIndented = true };
        return node.ToJsonString(options).Replace("\r\n", "\n") + "\n";
    }

    private static string FindSourceGoldenDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (dir.EnumerateFiles("WorkoutPlanner.Tests.csproj").Any())
            {
                return Path.Combine(dir.FullName, "Golden");
            }
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Could not locate WorkoutPlanner.Tests.csproj from AppContext.BaseDirectory");
    }

    private static StringContent BuildJsonContent(object request)
    {
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        return new StringContent(JsonSerializer.Serialize(request, options), Encoding.UTF8, "application/json");
    }

    private static List<JsonNode> GetLongevityPicks(JsonNode response)
    {
        return response["plan"]!
            .AsArray()
            .SelectMany(w => w!["days"]!.AsArray())
            .SelectMany(d => d!["exercises"]!.AsArray())
            .Where(e => e!["phase"]!.GetValue<string>() == "work" && e["longevityPattern"] != null)
            .ToList()!;
    }

    public static TheoryData<string, int[]> SplitWorkoutDays()
    {
        var data = new TheoryData<string, int[]>();
        data.Add("full-body", new[] { 0, 2, 4 });
        data.Add("ppl", new[] { 0, 2, 4 });
        data.Add("bro-split", new[] { 0, 2, 4 });
        data.Add("upper-lower", new[] { 0, 1, 3, 4 });
        return data;
    }

    [Theory]
    [MemberData(nameof(SplitWorkoutDays))]
    public async Task On_EachPatternAtLeastTwicePerWeek(string split, int[] workoutDays)
    {
        var request = new
        {
            seed = 1234,
            weeks = 4,
            daysPerWeek = workoutDays.Length,
            workoutDays = workoutDays.ToList(),
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split,
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        Assert.True(json["longevityLegs"]!["enabled"]!.GetValue<bool>());

        foreach (var week in json["plan"]!.AsArray())
        {
            var sessions = week!["days"]!.AsArray()
                .Where(d => d!["type"]!.GetValue<string>() == "workout" &&
                            d["sessionStyle"]!.GetValue<string>() == "strength")
                .ToList();

            var patternToSessions = new Dictionary<string, HashSet<int>>();
            for (int s = 0; s < sessions.Count; s++)
            {
                foreach (var ex in sessions[s]!["exercises"]!.AsArray()
                    .Where(e => e!["phase"]!.GetValue<string>() == "work" && e["longevityPattern"] != null))
                {
                    var pattern = ex!["longevityPattern"]!.GetValue<string>();
                    if (!patternToSessions.ContainsKey(pattern))
                        patternToSessions[pattern] = new HashSet<int>();
                    patternToSessions[pattern].Add(s);
                }
            }

            foreach (var pattern in LongevityLegsCatalog.Patterns)
            {
                Assert.True(patternToSessions.ContainsKey(pattern) && patternToSessions[pattern].Count >= 2,
                    $"Pattern {pattern} appeared in fewer than 2 sessions in week {week!["week"]!.GetValue<int>()}");
            }
        }
    }

    [Fact]
    public async Task On_DoseIs2to3Sets_8to15Reps()
    {
        var request = new
        {
            seed = 5678,
            weeks = 4,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        foreach (var week in json["plan"]!.AsArray())
        {
            bool isDeload = week!["phase"]!.GetValue<string>() == "deload";
            foreach (var day in week["days"]!.AsArray())
            {
                foreach (var ex in day!["exercises"]!.AsArray()
                    .Where(e => e!["phase"]!.GetValue<string>() == "work" && e["longevityPattern"] != null))
                {
                    int sets = ex!["sets"]!.GetValue<int>();
                    string reps = ex["repsDisplay"]!.GetValue<string>();
                    Assert.InRange(sets, 2, 3);
                    Assert.True(reps == "8-15" || reps == "8-12 per leg",
                        $"Unexpected reps display: {reps}");
                    if (isDeload)
                        Assert.Equal(2, sets);
                }
            }
        }
    }

    [Fact]
    public async Task On_RespectsEquipment_BodyweightOnly()
    {
        var exercisesResponse = await _client.GetAsync("/api/exercises");
        Assert.Equal(HttpStatusCode.OK, exercisesResponse.StatusCode);
        var exercisesJson = JsonNode.Parse(await exercisesResponse.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse exercises");
        var equipmentById = exercisesJson.AsArray()
            .Where(e => e != null)
            .ToDictionary(
                e => e!["id"]!.GetValue<string>(),
                e => e!["equipment"]!.AsArray().Select(x => x!.GetValue<string>()).ToList(),
                StringComparer.OrdinalIgnoreCase);

        var allowedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            foreach (var id in LongevityLegsCatalog.Ladders[pattern])
                allowedIds.Add(id);
            foreach (var kvp in LongevityLegsCatalog.Regressions[pattern])
                foreach (var id in kvp.Value)
                    allowedIds.Add(id);
        }

        var request = new
        {
            seed = 9012,
            weeks = 4,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 45,
            equipment = new[] { "bodyweight", "bench" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        var picks = GetLongevityPicks(json);
        Assert.Empty(json["longevityLegs"]!["uncoveredPatterns"]!.AsArray());

        foreach (var ex in picks)
        {
            var id = ex!["id"]!.GetValue<string>();
            Assert.Contains(id, allowedIds);
            Assert.True(equipmentById.TryGetValue(id, out var equipment), $"Unknown exercise id: {id}");
            Assert.All(equipment, eq =>
                Assert.Contains(eq, new[] { "bodyweight", "bench" }));
        }
    }

    [Fact]
    public async Task On_RotatorCuffRestriction_NoDependentLoad()
    {
        var forbiddenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "barbell-shrug", "barbell-shrug-behind-the-back", "dumbbell-shrug",
            "farmers-carry", "landmine-180-s", "middle-back-shrug", "rack-pulls",
            "suitcase-carry", "db-lunge", "dumbbell-lunges", "dumbbell-rear-lunge",
            "split-squat-with-dumbbells", "db-step-up", "dumbbell-step-ups",
            "db-romanian-deadlift", "stiff-legged-dumbbell-deadlift", "romanian-deadlift",
            "stiff-legged-barbell-deadlift", "smith-machine-stiff-legged-deadlift",
            "standing-dumbbell-calf-raise", "calf-raise-on-a-dumbbell",
            "calf-machine-shoulder-shrug", "leverage-shrug", "cable-shrugs",
            "smith-machine-behind-the-back-shrug"
        };

        var request = new
        {
            seed = 3456,
            weeks = 4,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = new[] { "rotator-cuff" },
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        var picks = GetLongevityPicks(json);
        Assert.NotEmpty(picks);

        bool hasRegressionNote = false;
        foreach (var ex in picks)
        {
            var id = ex!["id"]!.GetValue<string>();
            Assert.DoesNotContain(id, forbiddenIds);
            Assert.False(id.StartsWith("db-", StringComparison.OrdinalIgnoreCase), $"Pick id starts with db-: {id}");
            Assert.DoesNotContain(id, new[] { "dumbbell-rear-lunge", "split-squat-with-dumbbells", "dumbbell-step-ups", "stiff-legged-dumbbell-deadlift" });
            if (ex["regressionNote"] != null)
                hasRegressionNote = true;
        }

        Assert.True(hasRegressionNote, "Expected at least one longevity pick with a regressionNote");
        Assert.NotEmpty(json["longevityLegs"]!["regressions"]!.AsArray());
    }

    [Fact]
    public async Task On_KneeRestriction_NoKneeFlexion_ReportsUncovered()
    {
        var request = new
        {
            seed = 7890,
            weeks = 4,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = new[] { "knee" },
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        var picks = GetLongevityPicks(json);
        foreach (var ex in picks)
        {
            var pattern = ex!["longevityPattern"]!.GetValue<string>();
            Assert.DoesNotContain(pattern, new[] { "squat", "lunge", "step-up" });
        }

        Assert.NotEmpty(json["longevityLegs"]!["uncoveredPatterns"]!.AsArray());
    }

    [Fact]
    public async Task On_KneeRehab_UsesKneeSafeIds()
    {
        var request = new
        {
            seed = 7891,
            weeks = 4,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 45,
            equipment = new[] { "bodyweight", "bench" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = new[] { "knee" },
            rehab = new[] { "knee" },
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        var picks = GetLongevityPicks(json);
        Assert.NotEmpty(picks);
        var pickIds = picks.Select(e => e!["id"]!.GetValue<string>()).ToList();
        Assert.Contains(pickIds, id => LongevityLegsCatalog.KneeSafeIds.Contains(id));
    }

    [Fact]
    public async Task On_OneDay_SingleBlockAllFivePatterns_WithNote()
    {
        var request = new
        {
            seed = 1111,
            weeks = 4,
            daysPerWeek = 1,
            workoutDays = new[] { 2 },
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        Assert.Equal(1, json["longevityLegs"]!["targetSessionsPerWeek"]!.GetValue<int>());

        foreach (var week in json["plan"]!.AsArray())
        {
            var day = week!["days"]!.AsArray().First(d => d!["type"]!.GetValue<string>() == "workout");
            Assert.NotNull(day!["longevityNote"]);
            Assert.False(string.IsNullOrWhiteSpace(day["longevityNote"]!.GetValue<string>()));

            var patterns = day["exercises"]!.AsArray()
                .Where(e => e!["phase"]!.GetValue<string>() == "work" && e["longevityPattern"] != null)
                .Select(e => e!["longevityPattern"]!.GetValue<string>())
                .ToList();

            Assert.Equal(5, patterns.Count);
            foreach (var pattern in LongevityLegsCatalog.Patterns)
                Assert.Contains(pattern, patterns);

            Assert.All(day["exercises"]!.AsArray()
                .Where(e => e!["phase"]!.GetValue<string>() == "work" && e["longevityPattern"] != null),
                e => Assert.Equal(2, e!["sets"]!.GetValue<int>()));
        }
    }

    [Fact]
    public async Task On_AllHiit_NoCrashReportsUncovered()
    {
        var request = new
        {
            seed = 2222,
            weeks = 4,
            daysPerWeek = 1,
            workoutDays = new[] { 2 },
            sessionMinutes = 30,
            equipment = new[] { "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = false,
            includeCooldown = false,
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "conditioning",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        var picks = GetLongevityPicks(json);
        Assert.Empty(picks);

        var uncovered = json["longevityLegs"]!["uncoveredPatterns"]!.AsArray()
            .Select(x => x!.GetValue<string>())
            .ToList();
        Assert.Equal(LongevityLegsCatalog.Patterns.ToList(), uncovered);
    }

    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)]
    [InlineData(6)] [InlineData(7)] [InlineData(8)] [InlineData(9)] [InlineData(10)]
    [InlineData(11)] [InlineData(12)] [InlineData(13)] [InlineData(14)] [InlineData(15)]
    [InlineData(16)] [InlineData(17)] [InlineData(18)] [InlineData(19)] [InlineData(20)]
    public async Task On_TimeLimit_10min_NoSessionExceedsHardSkip(int seed)
    {
        var request = new
        {
            seed,
            weeks = 4,
            daysPerWeek = 3,
            workoutDays = new[] { 0, 2, 4 },
            sessionMinutes = 10,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = false,
            includeCooldown = false,
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            favoriteExerciseIds = Array.Empty<string>(),
            dislikedExerciseIds = Array.Empty<string>(),
            avoidExerciseIds = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())
            ?? throw new InvalidOperationException("Failed to parse response");

        int targetTime = 10 * 60;
        foreach (var week in json["plan"]!.AsArray())
        {
            foreach (var day in week!["days"]!.AsArray()
                .Where(d => d!["type"]!.GetValue<string>() == "workout" &&
                            d["sessionStyle"]!.GetValue<string>() == "strength"))
            {
                int workTime = day!["exercises"]!.AsArray()
                    .Where(e => e!["phase"]!.GetValue<string>() == "work")
                    .Sum(e => e!["sets"]!.GetValue<int>() * (e!["workDuration"]!.GetValue<int>() + e!["rest"]!.GetValue<int>()) + 30);
                Assert.True(workTime <= targetTime + 120,
                    $"Work time {workTime}s exceeds {targetTime + 120}s for seed {seed}");
            }
        }
    }

    [Fact]
    public async Task On_Seed7_UncoveredPatternsByWeek_CountEqualsWeeks()
    {
        var request = new
        {
            seed = 7,
            weeks = 4,
            daysPerWeek = 5,
            workoutDays = new[] { 0, 1, 2, 3, 4 },
            sessionMinutes = 20,
            equipment = new[] { "bodyweight", "dumbbells" },
            restrictions = Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            split = "full-body",
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            includeLongevityLegs = true,
            progression = "linear",
            mixMode = "strength"
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        var byWeek = json["longevityLegs"]!["uncoveredPatternsByWeek"]!.AsArray()
            .Select(w => w!.AsArray().Select(x => x!.GetValue<string>()).ToList())
            .ToList();
        Assert.Equal(request.weeks, byWeek.Count);
        AssertUncoveredSemantics(json, byWeek);

        // Known seed-7 shape: week 3 places nothing; calf (W1/W4) and lunge are picked, so not plan-level.
        Assert.Equal(new[] { 3, 3, 0, 3 }, json["longevityLegs"]!["coveredSessionsPerWeek"]!.AsArray().Select(x => x!.GetValue<int>()));
        Assert.Equal(LongevityLegsCatalog.Patterns, byWeek[2]);
        var planUncovered = json["longevityLegs"]!["uncoveredPatterns"]!.AsArray().Select(x => x!.GetValue<string>()).ToList();
        Assert.Equal(new[] { "step-up" }, planUncovered);
    }

    private static void AssertUncoveredSemantics(JsonNode json, List<List<string>> byWeek)
    {
        var weeksArr = json["plan"]!.AsArray();
        for (int w = 0; w < weeksArr.Count; w++)
        {
            var pickedThisWeek = weeksArr[w]!["days"]!.AsArray()
                .SelectMany(d => d!["exercises"]!.AsArray())
                .Select(e => e!["longevityPattern"]?.GetValue<string>())
                .Where(p => p != null)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var p in byWeek[w])
                Assert.False(pickedThisWeek.Contains(p), $"week {w + 1} lists '{p}' as uncovered but places it");
        }
        var planUncovered = json["longevityLegs"]!["uncoveredPatterns"]!.AsArray().Select(x => x!.GetValue<string>()).ToList();
        foreach (var p in LongevityLegsCatalog.Patterns)
            Assert.Equal(byWeek.All(l => l.Contains(p, StringComparer.OrdinalIgnoreCase)), planUncovered.Contains(p));
    }

    [Theory]
    [MemberData(nameof(NoDuplicatePatternCases))]
    public async Task On_PlanLevelUncoveredPatterns_AreMissingFromEveryWeek(string split, int[] workoutDays, bool cuff, int seed)
    {
        var request = new
        {
            seed,
            weeks = 4,
            daysPerWeek = workoutDays.Length,
            workoutDays = workoutDays.ToList(),
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split,
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = cuff ? new[] { "rotator-cuff" } : Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };

        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        var planUncovered = json["longevityLegs"]!["uncoveredPatterns"]!.AsArray()
            .Select(x => x!.GetValue<string>())
            .ToList();
        var byWeek = json["longevityLegs"]!["uncoveredPatternsByWeek"]!.AsArray()
            .Select(w => w!.AsArray().Select(x => x!.GetValue<string>()).ToList())
            .ToList();

        var allPicks = GetLongevityPicks(json);
        var patternsPickedAnywhere = allPicks
            .Select(e => e!["longevityPattern"]!.GetValue<string>())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        AssertUncoveredSemantics(json, byWeek);

        foreach (var pattern in planUncovered)
        {
            Assert.All(byWeek, weekList =>
                Assert.Contains(pattern, weekList, StringComparer.OrdinalIgnoreCase));
            Assert.DoesNotContain(pattern, patternsPickedAnywhere);
        }

        foreach (var pattern in patternsPickedAnywhere)
        {
            Assert.DoesNotContain(pattern, planUncovered, StringComparer.OrdinalIgnoreCase);
        }
    }

    public static TheoryData<string, int[], bool, int> NoDuplicatePatternCases()
    {
        var data = new TheoryData<string, int[], bool, int>();
        foreach (var (split, days) in new[] { ("full-body", new[] { 0, 2, 4 }), ("ppl", new[] { 0, 2, 4 }), ("bro-split", new[] { 0, 2, 4 }), ("upper-lower", new[] { 0, 1, 3, 4 }), ("full-body", new[] { 2 }) })
            foreach (var cuff in new[] { false, true })
                foreach (var seed in new[] { 4242, 7, 1001, 2002, 3003 })
                    data.Add(split, days, cuff, seed);
        return data;
    }

    /// <summary>
    /// The coverage plan never assigns a pattern twice to one session (rotation lists and the
    /// deferral step only add a pattern a day doesn't already have), so each LongevityPattern
    /// appears at most once per session. An untagged work pick from that pattern's equivalence
    /// group or regression lists must not come before the tagged one (it should have been merged instead).
    /// </summary>
    [Theory]
    [MemberData(nameof(NoDuplicatePatternCases))]
    public async Task On_NoDuplicatePatternPerSession_MergesRegressionIds(string split, int[] workoutDays, bool cuff, int seed)
    {
        var request = new
        {
            seed,
            weeks = 4,
            daysPerWeek = workoutDays.Length,
            workoutDays = workoutDays.ToList(),
            sessionMinutes = 45,
            equipment = new[] { "dumbbells", "bench", "bodyweight" },
            split,
            goal = "hypertrophy",
            level = "beginner",
            includeWarmup = true,
            includeCooldown = true,
            restrictions = cuff ? new[] { "rotator-cuff" } : Array.Empty<string>(),
            rehab = Array.Empty<string>(),
            progression = "linear",
            mixMode = "strength",
            includeLongevityLegs = true
        };
        var response = await _client.PostAsync("/api/plan", BuildJsonContent(request));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

        foreach (var week in json["plan"]!.AsArray())
        foreach (var day in week!["days"]!.AsArray().Where(d => d!["type"]!.GetValue<string>() == "workout"))
        {
            var work = day!["exercises"]!.AsArray().Where(e => e!["phase"]!.GetValue<string>() == "work").ToList();
            var tagged = work.Where(e => e!["longevityPattern"] != null)
                .GroupBy(e => e!["longevityPattern"]!.GetValue<string>()).ToList();
            foreach (var g in tagged)
            {
                Assert.True(g.Count() == 1, $"W{week["week"]} {day["day"]}: pattern {g.Key} appears {g.Count()} times");
                var cover = new HashSet<string>(LongevityLegsCatalog.EquivalenceGroups[g.Key], StringComparer.OrdinalIgnoreCase);
                foreach (var list in LongevityLegsCatalog.Regressions[g.Key].Values) cover.UnionWith(list);
                int taggedIdx = work.IndexOf(g.First());
                // Merge tags the FIRST normal pick from the cover set; later same-family normal picks are just extra
                // training volume. An untagged cover pick BEFORE the tagged one means a duplicate was appended.
                var dup = work.Take(taggedIdx).Where(e => e!["longevityPattern"] == null && cover.Contains(e!["id"]!.GetValue<string>()))
                    .Select(e => e!["id"]!.GetValue<string>()).ToList();
                Assert.True(dup.Count == 0, $"W{week["week"]} {day["day"]}: untagged {string.Join(",", dup)} duplicates {g.Key}");
            }
        }
    }
}
