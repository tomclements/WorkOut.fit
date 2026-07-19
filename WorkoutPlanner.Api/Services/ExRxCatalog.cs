using System.Text.Json;
using System.Text.RegularExpressions;

namespace WorkoutPlanner.Api.Services;

/// <summary>
/// Maps exercises to public ExRx.net exercise pages for form demos.
/// Linking is allowed; we do not embed ExRx images/GIFs (license required).
/// See https://exrx.net/Questions/Content
/// </summary>
public static class ExRxCatalog
{
    private static readonly object Gate = new();
    private static Dictionary<string, string>? _byId;

    public static string? GetUrl(string? exerciseId, string? exerciseName = null)
    {
        EnsureLoaded();
        if (_byId == null || _byId.Count == 0) return null;

        if (!string.IsNullOrWhiteSpace(exerciseId) &&
            _byId.TryGetValue(exerciseId, out var byId))
            return byId;

        if (!string.IsNullOrWhiteSpace(exerciseName))
        {
            var key = NormalizeId(exerciseName);
            if (_byId.TryGetValue(key, out var byName))
                return byName;
        }

        return null;
    }

    public static bool IsExRxUrl(string? url) =>
        !string.IsNullOrWhiteSpace(url) &&
        url.Contains("exrx.net", StringComparison.OrdinalIgnoreCase);

    public static string NormalizeId(string name) =>
        Regex.Replace(name.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');

    private static void EnsureLoaded()
    {
        lock (Gate)
        {
            if (_byId != null) return;
            _byId = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var paths = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Data", "exrx-map.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "Data", "exrx-map.json"),
            };

            foreach (var path in paths)
            {
                if (!File.Exists(path)) continue;
                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(path));
                    if (!doc.RootElement.TryGetProperty("byId", out var byIdEl)) continue;
                    foreach (var prop in byIdEl.EnumerateObject())
                    {
                        if (prop.Value.TryGetProperty("url", out var urlEl))
                        {
                            var url = urlEl.GetString();
                            if (!string.IsNullOrWhiteSpace(url))
                                _byId[prop.Name] = url!;
                        }
                    }
                    break;
                }
                catch
                {
                    // ignore bad map
                }
            }
        }
    }
}
