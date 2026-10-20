using System.Text.Json;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class LongevityLegsCatalogTests
{
    private static readonly List<Exercise> Catalog = LoadCatalog();

    private static List<Exercise> LoadCatalog()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "WorkoutPlanner.Api", "Data", "exercises.json");
        var exercises = JsonSerializer.Deserialize<List<Exercise>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        foreach (var ex in exercises)
        {
            ex.AvoidFor = InjuryRules.ComputeAvoidance(ex);
        }

        return exercises;
    }

    private static Exercise Find(string id)
    {
        var ex = Catalog.FirstOrDefault(e =>
            string.Equals(e.Id, id, StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(ex);
        return ex!;
    }

    private static LongevityLegsCatalog.LongevityPick Resolve(
        string pattern,
        IEnumerable<Exercise>? pool = null,
        IReadOnlyCollection<string>? restrictions = null,
        IReadOnlyCollection<string>? rehab = null,
        IReadOnlyCollection<string>? recent = null,
        Random? rng = null)
    {
        return LongevityLegsCatalog.Resolve(
            pattern,
            (pool ?? Catalog).ToList(),
            restrictions,
            rehab,
            rng ?? new Random(),
            recent);
    }

    [Fact]
    public void AllCatalogIds_Exist()
    {
        var referenced = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var kvp in LongevityLegsCatalog.EquivalenceGroups)
        {
            Assert.Contains(kvp.Key, LongevityLegsCatalog.Patterns, StringComparer.OrdinalIgnoreCase);
            foreach (var id in kvp.Value) referenced.Add(id);
        }

        foreach (var patternKvp in LongevityLegsCatalog.Regressions)
        {
            Assert.Contains(patternKvp.Key, LongevityLegsCatalog.Patterns, StringComparer.OrdinalIgnoreCase);
            Assert.Equal(4, patternKvp.Value.Count);
            Assert.Contains(LongevityLegsCatalog.ShoulderLimitation, patternKvp.Value.Keys, StringComparer.OrdinalIgnoreCase);
            Assert.Contains(LongevityLegsCatalog.KneeLimitation, patternKvp.Value.Keys, StringComparer.OrdinalIgnoreCase);
            Assert.Contains(LongevityLegsCatalog.LowerBackLimitation, patternKvp.Value.Keys, StringComparer.OrdinalIgnoreCase);
            Assert.Contains(LongevityLegsCatalog.NoEquipmentLimitation, patternKvp.Value.Keys, StringComparer.OrdinalIgnoreCase);
            foreach (var id in patternKvp.Value.SelectMany(v => v.Value)) referenced.Add(id);
        }

        foreach (var id in LongevityLegsCatalog.KneeSafeIds) referenced.Add(id);

        foreach (var kvp in LongevityLegsCatalog.Ladders)
        {
            Assert.Contains(kvp.Key, LongevityLegsCatalog.Patterns, StringComparer.OrdinalIgnoreCase);
            foreach (var id in kvp.Value) referenced.Add(id);
        }

        var catalogIds = Catalog.Select(e => e.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        Assert.All(referenced, id => Assert.Contains(id, catalogIds));
    }

    [Fact]
    public void ShoulderRegressions_AreShoulderSafe()
    {
        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            var ids = LongevityLegsCatalog.Regressions[pattern.ToLowerInvariant()][LongevityLegsCatalog.ShoulderLimitation];
            foreach (var id in ids)
            {
                var ex = Find(id);
                Assert.False(
                    string.Equals(ex.Mechanics?.Shoulder, "dependent", StringComparison.OrdinalIgnoreCase),
                    $"{id} in {pattern}/shoulder regression has dependent shoulder mechanics");
                Assert.DoesNotContain("shoulder", ex.AvoidFor);
                Assert.DoesNotContain("rotator-cuff", ex.AvoidFor);
            }
        }
    }

    [Fact]
    public void Resolve_NoRestrictions_ReturnsFirstGroupId_WithNullReason()
    {
        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            var pick = Resolve(pattern);
            var expectedId = LongevityLegsCatalog.EquivalenceGroups[pattern.ToLowerInvariant()][0];
            Assert.NotNull(pick.Exercise);
            Assert.Equal(expectedId, pick.Exercise!.Id, StringComparer.OrdinalIgnoreCase);
            Assert.Null(pick.RegressionReason);
        }
    }

    [Fact]
    public void Resolve_FirstGroupIdRecent_ReturnsNextGroupId()
    {
        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            var group = LongevityLegsCatalog.EquivalenceGroups[pattern.ToLowerInvariant()];
            if (group.Count < 2) continue;

            var pick = Resolve(pattern, recent: new[] { group[0] });
            Assert.NotNull(pick.Exercise);
            Assert.Equal(group[1], pick.Exercise!.Id, StringComparer.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Resolve_RotatorCuffRestriction_ReturnsNonDependent_NoRotatorCuffTag()
    {
        var restrictions = new[] { "rotator-cuff" };
        var patternsExpectingReason = new[] { "hinge", "lunge", "step-up" };

        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            var pick = Resolve(pattern, restrictions: restrictions);
            Assert.True(pick.Exercise is not null, $"{pattern}: Resolve returned null for rotator-cuff restriction");
            Assert.False(
                string.Equals(pick.Exercise!.Mechanics?.Shoulder, "dependent", StringComparison.OrdinalIgnoreCase),
                $"{pattern}: {pick.Exercise.Id} has dependent shoulder mechanics");
            Assert.DoesNotContain("rotator-cuff", pick.Exercise.AvoidFor);

            if (patternsExpectingReason.Contains(pattern, StringComparer.OrdinalIgnoreCase))
                Assert.True(pick.RegressionReason is not null, $"{pattern}: expected regression reason because group was skipped");
        }
    }

    [Fact]
    public void Resolve_RegressionPool_ReturnsRegressionWithReason()
    {
        // Only a no-equipment regression id is present; no group ids.
        var pool = new[] { Find("butt-lift-bridge") };
        var pick = Resolve("hinge", pool: pool);
        Assert.NotNull(pick.Exercise);
        Assert.Equal("butt-lift-bridge", pick.Exercise!.Id, StringComparer.OrdinalIgnoreCase);
        Assert.NotNull(pick.RegressionReason);
    }

    [Fact]
    public void Resolve_EmptyPool_ReturnsNull_WithPatternInReason()
    {
        var pick = Resolve("squat", pool: Array.Empty<Exercise>());
        Assert.Null(pick.Exercise);
        Assert.NotNull(pick.RegressionReason);
        Assert.Contains("squat", pick.RegressionReason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Resolve_KneeRestrictionWithoutRehab_Squat_ReturnsNull_WithClinicianText()
    {
        var pick = Resolve("squat", restrictions: new[] { "knee" });
        Assert.Null(pick.Exercise);
        Assert.NotNull(pick.RegressionReason);
        Assert.Contains("Talk to your clinician about knee-friendly options.", pick.RegressionReason);
    }

    [Fact]
    public void Resolve_KneeRestrictionWithRehab_ReturnsKneeSafeId()
    {
        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            var pick = Resolve(pattern, restrictions: new[] { "knee" }, rehab: new[] { "knee" });
            Assert.NotNull(pick.Exercise);
            Assert.Contains(pick.Exercise!.Id, LongevityLegsCatalog.KneeSafeIds);
        }
    }

    [Fact]
    public void Resolve_KneeSafeBypass_DoesNotIgnoreNonKneeTags()
    {
        var restrictions = new[] { "knee", "lower-back" };
        var rehab = new[] { "knee" };

        foreach (var pattern in LongevityLegsCatalog.Patterns)
        {
            var pick = Resolve(pattern, restrictions: restrictions, rehab: rehab);
            Assert.NotNull(pick.Exercise);
            Assert.DoesNotContain("lower-back", pick.Exercise!.AvoidFor);
        }
    }

    [Fact]
    public void Resolve_DoesNotConsumeRng()
    {
        var rng1 = new Random(123);
        var rng2 = new Random(123);

        Resolve("squat", pool: Catalog, restrictions: new[] { "rotator-cuff" }, rng: rng1);

        for (var i = 0; i < 10; i++)
            Assert.Equal(rng2.Next(), rng1.Next());
    }

    [Fact]
    public void Blurb_StartsWithLongevityLegs_ContainsNoDisallowedTokens()
    {
        Assert.StartsWith("Longevity Legs.", LongevityLegsCatalog.Blurb);
        Assert.DoesNotContain("%", LongevityLegsCatalog.Blurb);
        Assert.DoesNotContain("50", LongevityLegsCatalog.Blurb);
        Assert.DoesNotContain("BMJ", LongevityLegsCatalog.Blurb);

        Assert.DoesNotContain("%", LongevityLegsCatalog.Disclaimer);
        Assert.DoesNotContain("50", LongevityLegsCatalog.Disclaimer);
        Assert.DoesNotContain("BMJ", LongevityLegsCatalog.Disclaimer);
    }

    [Fact]
    public void Blurb_DoesNotContainPercentSign()
    {
        Assert.DoesNotContain("%", LongevityLegsCatalog.Blurb);
    }
}
