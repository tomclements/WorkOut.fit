using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

namespace WorkoutPlanner.Api.Endpoints;

public static class BuildInfoEndpoints
{
    private static readonly Lazy<BuildInfo> Cached = new(ResolveBuildInfo);

    public static IEndpointRouteBuilder MapBuildInfoEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/build", () => Results.Ok(Cached.Value))
            .AllowAnonymous()
            .WithTags("Build");

        // Alias so people can open it in a browser easily
        app.MapGet("/api/about", () => Results.Ok(Cached.Value))
            .AllowAnonymous()
            .WithTags("Build");

        return app;
    }

    private static BuildInfo ResolveBuildInfo()
    {
        var commit = FirstNonEmpty(
            Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT"),
            Environment.GetEnvironmentVariable("GIT_COMMIT"),
            Environment.GetEnvironmentVariable("SOURCE_VERSION"), // some hosts
            ReadEmbeddedBuildInfo()?.Commit,
            TryGit("rev-parse HEAD")
        ) ?? "unknown";

        var branch = FirstNonEmpty(
            Environment.GetEnvironmentVariable("RENDER_GIT_BRANCH"),
            Environment.GetEnvironmentVariable("GIT_BRANCH"),
            ReadEmbeddedBuildInfo()?.Branch,
            TryGit("rev-parse --abbrev-ref HEAD")
        ) ?? "unknown";

        var commitMessage = FirstNonEmpty(
            ReadEmbeddedBuildInfo()?.CommitMessage,
            TryGit("log -1 --pretty=%s")
        );

        var commitTime = FirstNonEmpty(
            ReadEmbeddedBuildInfo()?.CommitTime,
            TryGit("log -1 --pretty=%cI")
        );

        var shortCommit = commit.Length > 7 && commit != "unknown"
            ? commit[..7]
            : commit;

        var assembly = Assembly.GetExecutingAssembly();
        var version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? assembly.GetName().Version?.ToString()
            ?? "0.0.0";

        // Prefer assembly build time if present; else process start / now
        var buildTime = ReadEmbeddedBuildInfo()?.BuildTimeUtc
            ?? TryGetAssemblyBuildTime(assembly)
            ?? DateTime.UtcNow;

        return new BuildInfo
        {
            App = "WorkOut",
            Version = version,
            Commit = commit,
            ShortCommit = shortCommit,
            Branch = branch,
            CommitMessage = commitMessage,
            CommitTime = commitTime,
            BuildTimeUtc = buildTime.ToString("o"),
            Environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
                ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
                ?? "Production",
            ServerTimeUtc = DateTime.UtcNow.ToString("o"),
        };
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

    private static string? TryGit(string args)
    {
        try
        {
            // Walk up from content root / cwd looking for .git
            var dir = Directory.GetCurrentDirectory();
            for (var i = 0; i < 6 && dir != null; i++)
            {
                if (Directory.Exists(Path.Combine(dir, ".git")))
                    break;
                dir = Directory.GetParent(dir)?.FullName;
            }
            if (dir == null || !Directory.Exists(Path.Combine(dir, ".git")))
                return null;

            var psi = new ProcessStartInfo
            {
                FileName = "git",
                Arguments = args,
                WorkingDirectory = dir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi);
            if (proc == null) return null;
            var output = proc.StandardOutput.ReadToEnd().Trim();
            proc.WaitForExit(2000);
            return proc.ExitCode == 0 && !string.IsNullOrWhiteSpace(output) ? output : null;
        }
        catch
        {
            return null;
        }
    }

    private static EmbeddedBuildInfo? ReadEmbeddedBuildInfo()
    {
        try
        {
            // Look next to the app binary and under ContentRoot Data/
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "build-info.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "build-info.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "Data", "build-info.json"),
                Path.Combine(AppContext.BaseDirectory, "Data", "build-info.json")
            };

            foreach (var path in candidates)
            {
                if (!File.Exists(path)) continue;
                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<EmbeddedBuildInfo>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
        }
        catch
        {
            // ignore
        }
        return null;
    }

    private static DateTime? TryGetAssemblyBuildTime(Assembly assembly)
    {
        try
        {
            var path = assembly.Location;
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
            return File.GetLastWriteTimeUtc(path);
        }
        catch
        {
            return null;
        }
    }

    private sealed class EmbeddedBuildInfo
    {
        public string? Commit { get; set; }
        public string? Branch { get; set; }
        public string? CommitMessage { get; set; }
        public string? CommitTime { get; set; }
        public DateTime? BuildTimeUtc { get; set; }
    }
}

public class BuildInfo
{
    public string App { get; set; } = "WorkOut";
    public string Version { get; set; } = "";
    public string Commit { get; set; } = "unknown";
    public string ShortCommit { get; set; } = "unknown";
    public string Branch { get; set; } = "unknown";
    public string? CommitMessage { get; set; }
    public string? CommitTime { get; set; }
    public string BuildTimeUtc { get; set; } = "";
    public string Environment { get; set; } = "";
    public string ServerTimeUtc { get; set; } = "";
}
