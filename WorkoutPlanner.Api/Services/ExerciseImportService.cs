using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Imports exercises from yuhonas/free-exercise-db (same mapping rules as scripts/import-free-exercise-db.py).
/// </summary>
public class ExerciseImportService : IExerciseImportService
{
    public const string FreeExerciseDbUrl =
        "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

    private const string ImageBase =
        "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

    private static readonly HashSet<string> CategoriesToInclude = new(StringComparer.OrdinalIgnoreCase)
    {
        "strength", "plyometrics", "powerlifting", "olympic weightlifting", "strongman"
    };

    private static readonly Dictionary<string, string[]> EquipmentMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["body only"] = new[] { "bodyweight" },
        ["none"] = new[] { "bodyweight" },
        ["dumbbell"] = new[] { "dumbbells" },
        ["barbell"] = new[] { "barbell" },
        ["kettlebells"] = new[] { "kettlebell" },
        ["cable"] = new[] { "cable" },
        ["machine"] = new[] { "machines" },
        ["bands"] = new[] { "bands" },
        ["medicine ball"] = new[] { "medicine-ball" },
        ["exercise ball"] = new[] { "stability-ball" },
        ["e-z curl bar"] = new[] { "ez-bar" },
        ["foam roll"] = new[] { "foam-roller" }
    };

    private static readonly Dictionary<string, string> SlotMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["chest"] = "push",
        ["triceps"] = "push",
        ["shoulders"] = "push",
        ["lats"] = "pull",
        ["biceps"] = "pull",
        ["middle back"] = "pull",
        ["traps"] = "pull",
        ["forearms"] = "pull",
        ["quadriceps"] = "legs",
        ["hamstrings"] = "legs",
        ["calves"] = "legs",
        ["glutes"] = "legs",
        ["adductors"] = "legs",
        ["abductors"] = "legs",
        ["abdominals"] = "core",
        ["lower back"] = "core",
        ["neck"] = "total"
    };

    private static readonly (string Id, string Name, string Category)[] NewEquipment =
    {
        ("cable", "Cable machine", "gym"),
        ("medicine-ball", "Medicine ball", "accessories"),
        ("stability-ball", "Stability ball", "accessories"),
        ("ez-bar", "EZ curl bar", "free-weights"),
        ("foam-roller", "Foam roller", "accessories")
    };

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<ExerciseImportService> _logger;

    public ExerciseImportService(
        IHttpClientFactory httpClientFactory,
        IServiceScopeFactory scopeFactory,
        IWebHostEnvironment env,
        ILogger<ExerciseImportService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _scopeFactory = scopeFactory;
        _env = env;
        _logger = logger;
    }

    public async Task<ExerciseLibraryStats> GetLibraryStatsAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var total = await db.Exercises.AsNoTracking().CountAsync(ct);
        var withImages = await db.Exercises.AsNoTracking()
            .CountAsync(e => e.ImageUrl != null && e.ImageUrl != "", ct);
        var equipment = await db.EquipmentOptions.AsNoTracking().CountAsync(ct);

        DateTime? seedWrite = null;
        var seedPath = GetSeedPath("exercises.json");
        if (File.Exists(seedPath))
            seedWrite = File.GetLastWriteTimeUtc(seedPath);

        return new ExerciseLibraryStats
        {
            TotalExercises = total,
            WithImages = withImages,
            TotalEquipment = equipment,
            SeedFileLastWriteUtc = seedWrite
        };
    }

    public async Task<ExerciseImportResult> RefreshFromFreeExerciseDbAsync(bool force = false, CancellationToken ct = default)
    {
        var result = new ExerciseImportResult { Force = force };

        List<FreeExerciseSource> source;
        try
        {
            var client = _httpClientFactory.CreateClient("free-exercise-db");
            source = await client.GetFromJsonAsync<List<FreeExerciseSource>>(FreeExerciseDbUrl, JsonOptions, ct)
                     ?? new List<FreeExerciseSource>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download free-exercise-db");
            result.Errors.Add($"Download failed: {ex.Message}");
            return result;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Ensure equipment options exist
        var equipmentIds = (await db.EquipmentOptions.Select(e => e.Id).ToListAsync(ct))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var (id, name, category) in NewEquipment)
        {
            if (equipmentIds.Contains(id)) continue;
            db.EquipmentOptions.Add(new EquipmentOption { Id = id, Name = name, Category = category });
            equipmentIds.Add(id);
            result.EquipmentAdded++;
        }
        if (result.EquipmentAdded > 0)
            await db.SaveChangesAsync(ct);

        var existing = await db.Exercises.ToDictionaryAsync(e => e.Id, StringComparer.OrdinalIgnoreCase, ct);

        foreach (var src in source)
        {
            try
            {
                if (!CategoriesToInclude.Contains(src.Category ?? ""))
                {
                    result.Skipped++;
                    continue;
                }

                var mappedEquipment = MapEquipment(src.Equipment);
                if (mappedEquipment == null)
                {
                    result.Skipped++;
                    continue;
                }

                // Drop unknown equipment ids (shouldn't happen after map)
                mappedEquipment = mappedEquipment
                    .Where(eq => equipmentIds.Contains(eq))
                    .ToList();
                if (mappedEquipment.Count == 0)
                {
                    result.Skipped++;
                    continue;
                }

                var id = NormalizeId(src.Name);
                if (string.IsNullOrWhiteSpace(id))
                {
                    result.Skipped++;
                    continue;
                }

                var mapped = MapExercise(src, id, mappedEquipment);

                if (existing.TryGetValue(id, out var current))
                {
                    if (!force)
                    {
                        result.Duplicates++;
                        continue;
                    }

                    Apply(current, mapped);
                    result.Updated++;
                }
                else
                {
                    db.Exercises.Add(mapped);
                    existing[id] = mapped;
                    result.Added++;
                }
            }
            catch (Exception ex)
            {
                result.Errors.Add($"{src.Name}: {ex.Message}");
            }
        }

        await db.SaveChangesAsync(ct);

        result.TotalExercises = await db.Exercises.CountAsync(ct);
        result.TotalEquipment = await db.EquipmentOptions.CountAsync(ct);

        try
        {
            await PersistSeedFilesAsync(db, result, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not update seed JSON files (DB import still applied)");
            result.Errors.Add($"Seed file write skipped: {ex.Message}");
        }

        _logger.LogInformation(
            "Exercise refresh complete: added={Added}, updated={Updated}, duplicates={Duplicates}, skipped={Skipped}, force={Force}",
            result.Added, result.Updated, result.Duplicates, result.Skipped, force);

        return result;
    }

    private async Task PersistSeedFilesAsync(AppDbContext db, ExerciseImportResult result, CancellationToken ct)
    {
        // Never rewrite on-disk seed files during automated tests
        if (string.Equals(_env.EnvironmentName, "Testing", StringComparison.OrdinalIgnoreCase))
        {
            result.SeedFileUpdated = false;
            return;
        }

        var exercisesPath = GetSeedPath("exercises.json");
        var equipmentPath = GetSeedPath("equipment.json");
        var dir = Path.GetDirectoryName(exercisesPath)!;
        Directory.CreateDirectory(dir);

        if (File.Exists(exercisesPath))
        {
            var backupDir = Path.Combine(dir, "backups");
            Directory.CreateDirectory(backupDir);
            var backup = Path.Combine(backupDir, $"exercises.json.bak.{DateTime.UtcNow:yyyyMMddHHmmss}");
            File.Copy(exercisesPath, backup, overwrite: true);
            result.BackupPath = Path.GetRelativePath(dir, backup);
        }

        var allExercises = await db.Exercises.AsNoTracking().OrderBy(e => e.Name).ToListAsync(ct);
        var allEquipment = await db.EquipmentOptions.AsNoTracking().OrderBy(e => e.Name).ToListAsync(ct);

        await File.WriteAllTextAsync(exercisesPath, JsonSerializer.Serialize(allExercises, JsonOptions), ct);
        await File.WriteAllTextAsync(equipmentPath, JsonSerializer.Serialize(allEquipment, JsonOptions), ct);
        result.SeedFileUpdated = true;
    }

    private string GetSeedPath(string fileName) =>
        Path.Combine(_env.ContentRootPath, "Data", fileName);

    private static Exercise MapExercise(FreeExerciseSource src, string id, List<string> equipment)
    {
        var primary = src.PrimaryMuscles ?? new List<string>();
        var secondary = src.SecondaryMuscles ?? new List<string>();
        return new Exercise
        {
            Id = id,
            Name = src.Name,
            Equipment = equipment,
            Level = MapLevel(src.Level),
            Primary = primary,
            Secondary = secondary,
            Slot = MapSlot(primary),
            BaseSets = 3,
            RepsMin = 8,
            RepsMax = 12,
            IsTimeBased = false,
            WorkDuration = 30,
            RestSec = 60,
            DemoUrl = BuildDemoUrl(src.Name),
            ImageUrl = BuildImageUrl(src.Images),
            AvoidFor = MapAvoidFor(primary, secondary, src.Category ?? "")
        };
    }

    private static void Apply(Exercise target, Exercise source)
    {
        target.Name = source.Name;
        target.Equipment = source.Equipment;
        target.Level = source.Level;
        target.Primary = source.Primary;
        target.Secondary = source.Secondary;
        target.Slot = source.Slot;
        target.DemoUrl = source.DemoUrl;
        target.ImageUrl = source.ImageUrl;
        target.AvoidFor = source.AvoidFor;
        // Keep BaseSets / rep ranges if already customized — only fill defaults on force overwrite of mapping fields above
        if (target.BaseSets <= 0) target.BaseSets = source.BaseSets;
        if (target.RepsMin <= 0) target.RepsMin = source.RepsMin;
        if (target.RepsMax <= 0) target.RepsMax = source.RepsMax;
        if (target.WorkDuration <= 0) target.WorkDuration = source.WorkDuration;
        if (target.RestSec < 0) target.RestSec = source.RestSec;
    }

    public static string NormalizeId(string name) =>
        Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');

    private static string MapLevel(string? level) =>
        string.Equals(level, "expert", StringComparison.OrdinalIgnoreCase) ? "advanced" : (level ?? "beginner");

    private static string MapSlot(List<string> primary)
    {
        foreach (var muscle in primary)
        {
            if (SlotMap.TryGetValue(muscle, out var slot))
                return slot;
        }
        return "total";
    }

    private static List<string>? MapEquipment(string? equipment)
    {
        if (equipment == null) return null;
        return EquipmentMap.TryGetValue(equipment, out var mapped) ? mapped.ToList() : null;
    }

    private static string BuildDemoUrl(string name) =>
        "https://www.youtube.com/results?search_query=" + Uri.EscapeDataString(name + " exercise");

    private static string? BuildImageUrl(List<string>? images)
    {
        if (images == null || images.Count == 0) return null;
        return ImageBase + images[0];
    }

    private static List<string> MapAvoidFor(List<string> primary, List<string> secondary, string category)
    {
        var avoid = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var all = primary.Concat(secondary).ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (all.Contains("lower back")) avoid.Add("lower-back");
        if (all.Contains("neck")) avoid.Add("neck");
        if (all.Contains("shoulders")) avoid.Add("shoulder");
        if (all.Overlaps(new[] { "biceps", "triceps", "forearms" }))
        {
            avoid.Add("elbow");
            avoid.Add("wrist");
        }
        if (all.Overlaps(new[] { "quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors" }))
            avoid.Add("knee");
        if (CategoriesToInclude.Contains(category) &&
            (category.Equals("plyometrics", StringComparison.OrdinalIgnoreCase)
             || category.Equals("olympic weightlifting", StringComparison.OrdinalIgnoreCase)
             || category.Equals("strongman", StringComparison.OrdinalIgnoreCase)))
        {
            avoid.UnionWith(new[] { "knee", "wrist", "elbow", "shoulder", "lower-back" });
        }

        return avoid.OrderBy(a => a).ToList();
    }

    private sealed class FreeExerciseSource
    {
        public string Name { get; set; } = string.Empty;
        public string? Level { get; set; }
        public string? Equipment { get; set; }
        public string? Category { get; set; }
        public List<string>? PrimaryMuscles { get; set; }
        public List<string>? SecondaryMuscles { get; set; }
        public List<string>? Images { get; set; }
    }
}
