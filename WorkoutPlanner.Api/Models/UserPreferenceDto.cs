namespace WorkoutPlanner.Api.Models;

public class UserPreferenceDto
{
    public List<string> DefaultEquipment { get; set; } = new();
    public bool DefaultMusic { get; set; }
    public bool DefaultVoice { get; set; }
    public bool DefaultMotionSensor { get; set; }
    public int DefaultVolume { get; set; } = 20;
}
