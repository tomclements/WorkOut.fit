namespace WorkoutPlanner.Api.Models;

public class UserFavoriteExercise
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string ExerciseId { get; set; } = string.Empty;
}

public class UserExerciseNote
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string ExerciseId { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
}
