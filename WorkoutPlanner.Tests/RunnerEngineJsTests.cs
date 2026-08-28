using System.Diagnostics;

namespace WorkoutPlanner.Tests;

public class RunnerEngineJsTests
{
    [Fact]
    public async Task RunnerEngine_NodeTests_PassWhenNodeIsAvailable()
    {
        var node = FindOnPath("node") ?? FindOnPath("node.exe");
        if (node is null)
        {
            return;
        }

        var root = FindRepoRoot(AppContext.BaseDirectory)
                   ?? FindRepoRoot(Directory.GetCurrentDirectory());
        Assert.False(string.IsNullOrEmpty(root), "Could not locate repo root (WorkoutPlanner.slnx / package.json).");

        var testFile = Path.Combine(root!, "WorkoutPlanner.Tests", "runnerEngine.test.js");
        Assert.True(File.Exists(testFile), $"Missing {testFile}");

        var psi = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "--test WorkoutPlanner.Tests/runnerEngine.test.js",
            WorkingDirectory = root,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi);
        Assert.NotNull(proc);

        var stdoutTask = proc!.StandardOutput.ReadToEndAsync();
        var stderrTask = proc.StandardError.ReadToEndAsync();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        try
        {
            await proc.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            try { proc.Kill(entireProcessTree: true); } catch { /* ignore */ }
            Assert.Fail("node --test timed out after 60s");
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        Assert.True(proc.ExitCode == 0, $"node --test failed ({proc.ExitCode})\n{stdout}\n{stderr}");
    }

    private static string? FindOnPath(string name)
    {
        if (File.Exists(name)) return Path.GetFullPath(name);

        var paths = (Environment.GetEnvironmentVariable("PATH") ?? "")
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        foreach (var dir in paths)
        {
            try
            {
                var candidate = Path.Combine(dir, name);
                if (File.Exists(candidate)) return candidate;
            }
            catch
            {
                // skip invalid PATH entries
            }
        }
        return null;
    }

    private static string? FindRepoRoot(string start)
    {
        var dir = new DirectoryInfo(start);
        while (dir is not null)
        {
            var slnx = Path.Combine(dir.FullName, "WorkoutPlanner.slnx");
            var pkg = Path.Combine(dir.FullName, "package.json");
            if (File.Exists(slnx) || File.Exists(pkg)) return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }
}
