namespace WorkoutPlanner.Api.Models;

public class WeekPlan
{
    public int Week { get; set; }
    public List<DayPlan> Days { get; set; } = new();
}
