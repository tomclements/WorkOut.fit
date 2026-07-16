using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using WorkoutPlanner.Api.Models;

namespace WorkoutPlanner.Api.Services;

public class SmtpEmailService : IEmailService
{
    private readonly SmtpSettings _settings;

    public SmtpEmailService(IOptions<SmtpSettings> options)
    {
        _settings = options.Value;
    }

    public async Task<bool> SendEmailAsync(string to, string subject, string htmlBody)
    {
        if (string.IsNullOrWhiteSpace(_settings.Host) || string.IsNullOrWhiteSpace(_settings.FromEmail))
        {
            return false;
        }

        using var client = new SmtpClient(_settings.Host, _settings.Port)
        {
            EnableSsl = _settings.EnableSsl
        };

        if (!string.IsNullOrWhiteSpace(_settings.Username))
        {
            client.Credentials = new NetworkCredential(_settings.Username, _settings.Password);
        }

        using var message = new MailMessage
        {
            From = new MailAddress(_settings.FromEmail, _settings.FromName),
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };
        message.To.Add(to);

        await client.SendMailAsync(message);
        return true;
    }
}
