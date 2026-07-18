namespace WorkoutPlanner.Api.Models;

/// <summary>
/// User ranking for an exercise. Rating: 1 = like, -1 = dislike.
/// </summary>
public class UserFavoriteExercise
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string ExerciseId { get; set; } = string.Empty;
    /// <summary>1 = like, -1 = dislike.</summary>
    public int Rating { get; set; } = 1;
}

public class ExerciseRatingRequest
{
    /// <summary>"like", "dislike", or "none" (clear).</summary>
    public string Rating { get; set; } = "like";
}

public class ExerciseRatingsDto
{
    public List<string> Liked { get; set; } = new();
    public List<string> Disliked { get; set; } = new();
}

public class UserExerciseNote
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string ExerciseId { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
}
