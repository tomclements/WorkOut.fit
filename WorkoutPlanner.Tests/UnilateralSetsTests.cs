using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;

namespace WorkoutPlanner.Tests;

public class UnilateralSetsTests
{
    [Theory]
    [InlineData("alternating-dumbbell-curl", "Alternating Dumbbell Curl", true)]
    [InlineData("one-arm-row", "One-Arm Dumbbell Row", true)]
    [InlineData("single-arm-press", "Single-Arm Press", true)]
    [InlineData("single-leg-rdl", "Single-Leg RDL", true)]
    [InlineData("per-arm-curl", "Per-Arm Curl", true)]
    [InlineData("each-arm-raise", "Each-Arm Raise", true)]
    [InlineData("pistol-squat", "Pistol Squat", true)]
    [InlineData("bulgarian-split-squat", "Bulgarian Split Squat", true)]
    [InlineData("see-saw-press", "See-Saw Press", true)]
    [InlineData("seesaw-press", "Seesaw Press", true)]
    [InlineData("renegade-row", "Renegade Row", true)]
    [InlineData("goblet-squat", "Goblet Squat", false)]
    [InlineData("back-squat", "Back Squat", false)]
    [InlineData("walking-lunge", "Walking Lunge", false)]
    [InlineData("reverse-lunge", "Reverse Lunge", false)]
    public void TokenDetectsUnilateralFromIdAndName(string id, string name, bool expected)
    {
        Assert.Equal(expected, WorkoutPlannerService.IsUnilateralByTokens(id, name));
    }

    [Fact]
    public void OddUnilateralSetsBecomeEven_AlternatingCurl3Becomes4()
    {
        var curl = new Exercise
        {
            Id = "alternating-dumbbell-curl",
            Name = "Alternating Dumbbell Curl",
            BaseSets = 3
        };
        Assert.Equal(4, WorkoutPlannerService.ApplyUnilateralEvenRounds(3, 5, curl));
    }

    [Fact]
    public void BilateralSquatCanStayOdd()
    {
        var squat = new Exercise
        {
            Id = "goblet-squat",
            Name = "Goblet Squat",
            BaseSets = 3
        };
        Assert.Equal(3, WorkoutPlannerService.ApplyUnilateralEvenRounds(3, 5, squat));
    }

    [Fact]
    public void UnilateralOddAtMaxStaysAtMax()
    {
        var curl = new Exercise
        {
            Id = "alternating-dumbbell-curl",
            Name = "Alternating Dumbbell Curl"
        };
        Assert.Equal(5, WorkoutPlannerService.ApplyUnilateralEvenRounds(5, 5, curl));
    }
}
