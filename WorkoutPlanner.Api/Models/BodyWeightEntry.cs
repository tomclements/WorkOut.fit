namespace WorkoutPlanner.Api.Models;

public class BodyWeightEntry
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public decimal WeightKg { get; set; }
    /// <summary>The day the weight was measured (user-facing date, stored in UTC).</summary>
    public DateTime WeighedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AddBodyWeightRequest
{
    /// <summary>Weight in kilograms (or converted from lb by the client).</summary>
    public decimal WeightKg { get; set; }
    /// <summary>Optional measurement date; defaults to today (UTC).</summary>
    public DateTime? WeighedAt { get; set; }
}
