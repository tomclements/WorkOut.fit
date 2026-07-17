namespace WorkoutPlanner.Api.Models;

public class UserPreference
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public List<string> DefaultEquipment { get; set; } = new();
    public bool DefaultMusic { get; set; }
    public bool DefaultVoice { get; set; }
    public bool DefaultMotionSensor { get; set; }
    public int DefaultVolume { get; set; } = 20;
}
