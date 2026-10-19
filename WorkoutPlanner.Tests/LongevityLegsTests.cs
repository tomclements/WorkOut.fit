using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

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
}
