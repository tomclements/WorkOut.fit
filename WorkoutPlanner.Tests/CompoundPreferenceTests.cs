using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class CompoundPreferenceTests
{
    private static Exercise Make(string id, string mechanic, string slot = "push") => new()
    {
        Id = id,
        Name = id,
        Mechanic = mechanic,
        Slot = slot,
        Level = "beginner",
        Equipment = new List<string> { "dumbbells" },
        Primary = new List<string> { "chest" },
        IsTimeBased = false,
        WorkDuration = 30,
        RestSec = 60
    };

    private static readonly HashSet<string> Empty = new();
    private static readonly List<string> EmptyRecent = new();

    [Fact]
    public void FirstFill_CompoundsWin_WhenAtLeastTwoExist()
    {
        var candidates = new List<Exercise>
        {
            Make("c1", "compound"),
            Make("c2", "compound"),
            Make("i1", "isolation"),
            Make("i2", "isolation"),
        };

        int compoundCount = 0;
        const int runs = 200;
        var rng = new Random(42);
        for (int i = 0; i < runs; i++)
        {
            var pick = WorkoutPlannerService.PickWeightedExercise(
                candidates, Empty, Empty, EmptyRecent,
                isBro: false, slot: "push", rng: rng, isFirstFillOfSlot: true);
            Assert.NotNull(pick);
            if (pick!.Mechanic == "compound") compoundCount++;
        }

        // compound bump (+3) should make compounds appear more than 50% of the time
        Assert.True(compoundCount > runs / 2,
            $"Expected compound majority, got {compoundCount}/{runs}");
    }

    [Fact]
    public void LaterFill_NoCompoundBump()
    {
        var candidates = new List<Exercise>
        {
            Make("c1", "compound"),
            Make("c2", "compound"),
            Make("i1", "isolation"),
            Make("i2", "isolation"),
        };

        int compoundCount = 0;
        const int runs = 200;
        var rng = new Random(99);
        for (int i = 0; i < runs; i++)
        {
            var pick = WorkoutPlannerService.PickWeightedExercise(
                candidates, Empty, Empty, EmptyRecent,
                isBro: false, slot: "push", rng: rng, isFirstFillOfSlot: false);
            Assert.NotNull(pick);
            if (pick!.Mechanic == "compound") compoundCount++;
        }

        // without compound bump, distribution should be roughly even (within 35-65%)
        Assert.InRange(compoundCount, runs * 35 / 100, runs * 65 / 100);
    }

    [Fact]
    public void FewerThanTwoCompounds_NoBump()
    {
        var candidates = new List<Exercise>
        {
            Make("c1", "compound"),
            Make("i1", "isolation"),
            Make("i2", "isolation"),
            Make("i3", "isolation"),
        };

        int compoundCount = 0;
        const int runs = 200;
        var rng = new Random(7);
        for (int i = 0; i < runs; i++)
        {
            var pick = WorkoutPlannerService.PickWeightedExercise(
                candidates, Empty, Empty, EmptyRecent,
                isBro: false, slot: "push", rng: rng, isFirstFillOfSlot: true);
            Assert.NotNull(pick);
            if (pick!.Mechanic == "compound") compoundCount++;
        }

        // only 1 compound — no bump applied, distribution should be roughly even
        Assert.InRange(compoundCount, runs * 10 / 100, runs * 40 / 100);
    }

    [Fact]
    public void IsolationOnlyPool_StillProducesSession()
    {
        var candidates = new List<Exercise>
        {
            Make("i1", "isolation"),
            Make("i2", "isolation"),
            Make("i3", "isolation"),
        };

        var rng = new Random(1);
        var pick = WorkoutPlannerService.PickWeightedExercise(
            candidates, Empty, Empty, EmptyRecent,
            isBro: false, slot: "arms", rng: rng, isFirstFillOfSlot: true);
        Assert.NotNull(pick);
        Assert.Equal("isolation", pick!.Mechanic);
    }

    [Fact]
    public void SingleCandidate_ReturnsIt()
    {
        var candidates = new List<Exercise> { Make("s1", "compound") };
        var rng = new Random(1);
        var pick = WorkoutPlannerService.PickWeightedExercise(
            candidates, Empty, Empty, EmptyRecent,
            isBro: false, slot: "push", rng: rng, isFirstFillOfSlot: true);
        Assert.NotNull(pick);
        Assert.Equal("s1", pick!.Id);
    }
}
