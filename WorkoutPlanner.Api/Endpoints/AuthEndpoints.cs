using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using WorkoutPlanner.Api.Models;
using WorkoutPlanner.Api.Services;
using WorkoutPlanner.Api.Validators;

namespace WorkoutPlanner.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/register", async (RegisterRequest req, UserManager<IdentityUser> userManager, SignInManager<IdentityUser> signInManager) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest("Email and password are required.");

            var user = new IdentityUser { UserName = req.Email, Email = req.Email };
            var result = await userManager.CreateAsync(user, req.Password);
            if (!result.Succeeded)
                return Results.BadRequest(new { errors = result.Errors.Select(e => e.Description) });

            await signInManager.SignInAsync(user, isPersistent: true);
            var roles = await userManager.GetRolesAsync(user);
            return Results.Ok(new { email = user.Email, roles });
        }).AllowAnonymous().WithValidation<RegisterRequest>().RequireRateLimiting("auth");

        app.MapPost("/api/auth/login", async (LoginRequest req, UserManager<IdentityUser> userManager, SignInManager<IdentityUser> signInManager) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest("Email and password are required.");

            var result = await signInManager.PasswordSignInAsync(req.Email, req.Password, isPersistent: true, lockoutOnFailure: false);
            if (!result.Succeeded)
                return Results.Unauthorized();

            var user = await userManager.FindByEmailAsync(req.Email);
            var roles = user is not null ? await userManager.GetRolesAsync(user) : [];
            return Results.Ok(new { email = req.Email, roles });
        }).AllowAnonymous().WithValidation<LoginRequest>().RequireRateLimiting("auth");

        app.MapPost("/api/auth/logout", async (SignInManager<IdentityUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.Ok();
        }).RequireAuthorization();

        app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
        {
            if (user.Identity?.IsAuthenticated != true)
                return Results.Unauthorized();

            var roles = user.FindAll(ClaimTypes.Role).Select(c => c.Value).ToList();
            return Results.Ok(new { email = user.Identity.Name, roles });
        }).RequireAuthorization();

        app.MapPost("/api/auth/forgot-password", async (ForgotPasswordRequest req, HttpRequest request, UserManager<IdentityUser> userManager, IEmailService emailService) =>
        {
            var user = await userManager.FindByEmailAsync(req.Email);
            if (user == null)
            {
                // Don't reveal whether the email exists.
                return Results.Ok(new { message = "If that email is registered, a reset link has been sent." });
            }

            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
            var callbackPath = $"/reset-password.html?email={Uri.EscapeDataString(req.Email)}&token={code}";
            var absoluteLink = $"{request.Scheme}://{request.Host}{callbackPath}";

            var body = $@"<p>Hi,</p>
<p>Click the link below to reset your WorkOut password:</p>
<p><a href=""{absoluteLink}"">{absoluteLink}</a></p>
<p>If you didn't request this, you can ignore this email.</p>";

            var sent = await emailService.SendEmailAsync(req.Email, "Reset your WorkOut password", body);
            if (sent)
            {
                return Results.Ok(new { message = "If that email is registered, a reset link has been sent." });
            }

            // Fallback when email is not configured: return the link directly so the user can still reset.
            return Results.Ok(new { resetLink = callbackPath, message = "Email is not configured. Use this reset link." });
        }).AllowAnonymous().WithValidation<ForgotPasswordRequest>().RequireRateLimiting("auth");

        app.MapPost("/api/auth/reset-password", async (ResetPasswordRequest req, UserManager<IdentityUser> userManager) =>
        {
            var user = await userManager.FindByEmailAsync(req.Email);
            if (user == null)
                return Results.BadRequest(new { errors = new[] { "Invalid reset request." } });

            string token;
            try
            {
                token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(req.Token));
            }
            catch
            {
                return Results.BadRequest(new { errors = new[] { "Invalid reset token." } });
            }

            var result = await userManager.ResetPasswordAsync(user, token, req.NewPassword);
            if (!result.Succeeded)
                return Results.BadRequest(new { errors = result.Errors.Select(e => e.Description) });

            return Results.Ok(new { message = "Password reset successfully." });
        }).AllowAnonymous().WithValidation<ResetPasswordRequest>().RequireRateLimiting("auth");

        var allowedProviders = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Google", "Microsoft" };

        app.MapGet("/api/auth/external-login", async (string provider, string? returnUrl, IAuthenticationSchemeProvider schemeProvider) =>
        {
            if (!allowedProviders.Contains(provider))
                return Results.BadRequest("Unsupported provider.");

            var scheme = await schemeProvider.GetSchemeAsync(provider);
            if (scheme == null)
                return Results.BadRequest("Provider not configured.");

            var redirectUri = "/api/auth/external-callback";
            if (!string.IsNullOrEmpty(returnUrl))
            {
                redirectUri += "?returnUrl=" + Uri.EscapeDataString(returnUrl);
            }

            var properties = new AuthenticationProperties { RedirectUri = redirectUri };
            return Results.Challenge(properties, new[] { provider });
        }).AllowAnonymous().RequireRateLimiting("auth");

        app.MapGet("/api/auth/external-providers", async (IAuthenticationSchemeProvider schemeProvider) =>
        {
            var providers = new List<string>();
            foreach (var name in allowedProviders)
            {
                if (await schemeProvider.GetSchemeAsync(name) != null)
                    providers.Add(name);
            }
            return Results.Ok(providers);
        }).AllowAnonymous();

        app.MapGet("/api/auth/external-callback", async (string? returnUrl, HttpRequest request, SignInManager<IdentityUser> signInManager, UserManager<IdentityUser> userManager) =>
        {
            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info == null)
            {
                return Results.Redirect("/?error=external-login");
            }

            var signInResult = await signInManager.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: true);
            if (signInResult.Succeeded)
            {
                return Results.Redirect(IsLocalUrl(returnUrl) ? returnUrl! : "/");
            }

            if (signInResult.IsLockedOut || signInResult.RequiresTwoFactor || signInResult.IsNotAllowed)
            {
                return Results.Redirect("/?error=external-not-allowed");
            }

            // Create a local account for the external user.
            var email = info.Principal.FindFirstValue(ClaimTypes.Email)
                ?? $"{info.ProviderKey}@{info.LoginProvider.ToLowerInvariant()}.local";
            var user = await userManager.FindByEmailAsync(email);
            if (user == null)
            {
                user = new IdentityUser
                {
                    UserName = email,
                    Email = email,
                    EmailConfirmed = true
                };
                var createResult = await userManager.CreateAsync(user);
                if (!createResult.Succeeded)
                {
                    return Results.Redirect("/?error=external-create");
                }
            }

            var addLoginResult = await userManager.AddLoginAsync(user, new UserLoginInfo(info.LoginProvider, info.ProviderKey, info.ProviderDisplayName));
            if (!addLoginResult.Succeeded)
            {
                return Results.Redirect("/?error=external-link");
            }

            await signInManager.SignInAsync(user, isPersistent: true);
            return Results.Redirect(IsLocalUrl(returnUrl) ? returnUrl! : "/");
        }).AllowAnonymous();

        return app;
    }

    private static bool IsLocalUrl(string? url)
    {
        if (string.IsNullOrEmpty(url))
            return false;

        // Must start with / but not // (protocol-relative) and not contain :// (absolute URL)
        return url.StartsWith('/') && !url.StartsWith("//") && !url.Contains("://");
    }
}
