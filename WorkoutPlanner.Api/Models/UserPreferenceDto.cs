namespace WorkoutPlanner.Api.Models;

public class UserPreferenceDto
{
    public List<string> DefaultEquipment { get; set; } = new();
    public bool DefaultMusic { get; set; }
    public bool DefaultVoice { get; set; }
    public bool DefaultMotionSensor { get; set; }
    public int DefaultVolume { get; set; } = 20;

    public string DefaultLevel { get; set; } = "beginner";
    public string DefaultGoal { get; set; } = "hypertrophy";
    public string DefaultSplit { get; set; } = "full-body";
    public string DefaultProgression { get; set; } = "linear";
    public int DefaultWeeks { get; set; } = 4;
    public int DefaultDaysPerWeek { get; set; } = 5;
    public int DefaultSessionMinutes { get; set; } = 20;
    public List<int> DefaultWorkoutDays { get; set; } = new() { 0, 1, 2, 3, 4 };
    public bool DefaultIncludeWarmup { get; set; } = true;
    public bool DefaultIncludeCooldown { get; set; } = true;
}
