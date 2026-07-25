namespace WorkoutPlanner.Api.Models;

/// <summary>
/// User feedback submitted from the public form (no account required).
/// </summary>
public class FeedbackMessage
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>suggestion | bug | other</summary>
    public string Category { get; set; } = "suggestion";
    public string Message { get; set; } = string.Empty;
    /// <summary>Optional reply-to email from the sender.</summary>
    public string? ContactEmail { get; set; }
    public string? PageUrl { get; set; }
    public string? UserAgent { get; set; }
    public string? UserId { get; set; }
    public string? UserEmail { get; set; }
    /// <summary>Hashed client IP for abuse correlation (not raw IP).</summary>
    public string? IpHash { get; set; }
    public bool IsRead { get; set; }
}

public class SubmitFeedbackRequest
{
    public string Category { get; set; } = "suggestion";
    public string Message { get; set; } = string.Empty;
    public string? ContactEmail { get; set; }
    public string? PageUrl { get; set; }
    /// <summary>Honeypot — must be empty. Bots often fill hidden fields.</summary>
    public string? Website { get; set; }
}
