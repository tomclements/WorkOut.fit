using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using WorkoutPlanner.Api.Data;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;
using WorkoutPlanner.Api.Validators;

namespace WorkoutPlanner.Api.Endpoints;

public static class FeedbackEndpoints
{
    public static IEndpointRouteBuilder MapFeedbackEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/feedback", async (
            SubmitFeedbackRequest req,
            HttpContext http,
            AppDbContext db,
            UserManager<IdentityUser> userManager,
            IEmailService emailService,
            IConfiguration config,
            ILoggerFactory loggerFactory) =>
        {
            // Honeypot: pretend success so bots stop
            if (!string.IsNullOrWhiteSpace(req.Website))
                return Results.Ok(new { message = "Thanks — your feedback was received." });

            var category = (req.Category ?? "suggestion").Trim().ToLowerInvariant();
            if (category is not ("suggestion" or "bug" or "other"))
                category = "other";

            var message = (req.Message ?? "").Trim();
            if (message.Length < 5)
                return Results.BadRequest(new { message = "Please write a bit more so we can understand your feedback." });
            if (message.Length > 4000)
                message = message[..4000];

            string? contact = string.IsNullOrWhiteSpace(req.ContactEmail)
                ? null
                : req.ContactEmail.Trim();
            if (contact != null && contact.Length > 256)
                contact = contact[..256];

            string? pageUrl = string.IsNullOrWhiteSpace(req.PageUrl) ? null : req.PageUrl.Trim();
            if (pageUrl != null && pageUrl.Length > 500)
                pageUrl = pageUrl[..500];

            string? userAgent = http.Request.Headers.UserAgent.ToString();
            if (userAgent.Length > 500)
                userAgent = userAgent[..500];

            string? userId = null;
            string? userEmail = null;
            if (http.User.Identity?.IsAuthenticated == true)
            {
                userId = userManager.GetUserId(http.User);
                userEmail = http.User.FindFirstValue(ClaimTypes.Email)
                    ?? http.User.Identity?.Name;
            }

            var ip = http.Connection.RemoteIpAddress?.ToString() ?? "";
            var ipHash = string.IsNullOrEmpty(ip) ? null : HashIp(ip);

            var row = new FeedbackMessage
            {
                CreatedAt = DateTime.UtcNow,
                Category = category,
                Message = message,
                ContactEmail = contact,
                PageUrl = pageUrl,
                UserAgent = string.IsNullOrWhiteSpace(userAgent) ? null : userAgent,
                UserId = userId,
                UserEmail = userEmail,
                IpHash = ipHash,
                IsRead = false
            };

            db.FeedbackMessages.Add(row);
            await db.SaveChangesAsync();

            // Best-effort email notify (does not fail the request if SMTP is off)
            var logger = loggerFactory.CreateLogger("Feedback");
            try
            {
                var notifyTo = config["Feedback:NotifyEmail"]
                    ?? config["Admin:Email"]
                    ?? "tomclements@gmail.com";
                if (!string.IsNullOrWhiteSpace(notifyTo))
                {
                    var enc = HtmlEncoder.Default;
                    var subject = $"[WorkOut feedback · {category}] #{row.Id}";
                    var body = $"""
                        <p><strong>Category:</strong> {enc.Encode(category)}</p>
                        <p><strong>Message:</strong></p>
                        <pre style="white-space:pre-wrap;font-family:inherit">{enc.Encode(message)}</pre>
                        <p><strong>Contact:</strong> {enc.Encode(contact ?? "(none)")}</p>
                        <p><strong>Signed-in user:</strong> {enc.Encode(userEmail ?? "(guest)")}</p>
                        <p><strong>Page:</strong> {enc.Encode(pageUrl ?? "")}</p>
                        <p><strong>Id:</strong> {row.Id} · {row.CreatedAt:u}</p>
                        """;
                    var sent = await emailService.SendEmailAsync(notifyTo, subject, body);
                    if (!sent)
                        logger.LogInformation("Feedback #{Id} saved; email not sent (SMTP not configured).", row.Id);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Feedback #{Id} saved but notify email failed.", row.Id);
            }

            return Results.Ok(new
            {
                message = "Thanks — your feedback was received. We read every submission.",
                id = row.Id
            });
        })
        .AllowAnonymous()
        .WithValidation<SubmitFeedbackRequest>()
        .RequireRateLimiting("feedback");

        return app;
    }

    private static string HashIp(string ip)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes("workout-feedback|" + ip));
        return Convert.ToHexString(bytes.AsSpan(0, 8));
    }
}
