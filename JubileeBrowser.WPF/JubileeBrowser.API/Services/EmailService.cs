using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using Npgsql;
using Serilog;

namespace JubileeBrowser.API.Services;

/// <summary>
/// Email service configuration.
/// </summary>
public class EmailSettings
{
    public string Provider { get; set; } = "Smtp";
    public string DefaultFromAddress { get; set; } = "noreply@jubileebrowser.com";
    public string DefaultFromName { get; set; } = "Jubilee Browser";
    public string SupportAddress { get; set; } = "support@jubileebrowser.com";
    public string AdminAddress { get; set; } = "admin@jubileebrowser.com";
    public int RateLimitPerUser { get; set; } = 50;
    public int RateLimitGlobal { get; set; } = 1000;
}

public class SmtpSettings
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 587;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public bool UseTls { get; set; } = true;
}

/// <summary>
/// Email sending result.
/// </summary>
public class EmailResult
{
    public bool Success { get; set; }
    public string? MessageId { get; set; }
    public string? ErrorMessage { get; set; }
    public Guid? EventId { get; set; }
}

/// <summary>
/// Email sending request.
/// </summary>
public class EmailRequest
{
    public string ToAddress { get; set; } = "";
    public string? ToName { get; set; }
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public bool IsHtml { get; set; } = true;
    public string? TemplateName { get; set; }
    public Dictionary<string, string>? TemplateVariables { get; set; }
    public Guid? UserId { get; set; }
    public string? FromAddress { get; set; }
    public string? FromName { get; set; }
    public List<string>? CcAddresses { get; set; }
    public List<string>? BccAddresses { get; set; }
    public string? ReplyTo { get; set; }
    public Dictionary<string, byte[]>? Attachments { get; set; }
}

/// <summary>
/// Email service interface.
/// </summary>
public interface IEmailService
{
    Task<EmailResult> SendAsync(EmailRequest request);
    Task<EmailResult> SendTemplateAsync(string templateName, string toAddress, Dictionary<string, string> variables, Guid? userId = null);
    Task<bool> IsSuppressionListedAsync(string email);
    Task<string?> GetTemplateAsync(string templateName);
}

/// <summary>
/// Email service implementation with PostgreSQL event tracking.
/// </summary>
public class EmailService : IEmailService
{
    private readonly EmailSettings _emailSettings;
    private readonly SmtpSettings _smtpSettings;
    private readonly string _connectionString;
    private readonly Serilog.ILogger _logger;

    public EmailService(
        IOptions<EmailSettings> emailSettings,
        IOptions<SmtpSettings> smtpSettings,
        IConfiguration configuration)
    {
        _emailSettings = emailSettings.Value;
        _smtpSettings = smtpSettings.Value;
        _connectionString = configuration.GetConnectionString("PostgreSQL")
            ?? throw new InvalidOperationException("PostgreSQL connection string not configured");
        _logger = Log.ForContext<EmailService>();
    }

    /// <summary>
    /// Sends an email and records the event.
    /// </summary>
    public async Task<EmailResult> SendAsync(EmailRequest request)
    {
        var result = new EmailResult();
        var eventId = Guid.NewGuid();

        try
        {
            // Check suppression list
            if (await IsSuppressionListedAsync(request.ToAddress))
            {
                _logger.Warning("Email to {Email} blocked - on suppression list", request.ToAddress);
                return new EmailResult
                {
                    Success = false,
                    ErrorMessage = "Email address is on suppression list"
                };
            }

            // Apply template if specified
            var body = request.Body;
            var subject = request.Subject;

            if (!string.IsNullOrEmpty(request.TemplateName))
            {
                var template = await GetTemplateAsync(request.TemplateName);
                if (template != null && request.TemplateVariables != null)
                {
                    body = ApplyTemplateVariables(template, request.TemplateVariables);
                }
            }

            // Record queued event
            await RecordEmailEventAsync(
                eventId,
                request.ToAddress,
                subject,
                "queued",
                request.UserId,
                request.TemplateName);

            // Create mail message
            using var mailMessage = new MailMessage();
            mailMessage.From = new MailAddress(
                request.FromAddress ?? _emailSettings.DefaultFromAddress,
                request.FromName ?? _emailSettings.DefaultFromName);
            mailMessage.To.Add(new MailAddress(request.ToAddress, request.ToName));
            mailMessage.Subject = subject;
            mailMessage.Body = body;
            mailMessage.IsBodyHtml = request.IsHtml;

            // Add CC/BCC
            if (request.CcAddresses != null)
            {
                foreach (var cc in request.CcAddresses)
                {
                    mailMessage.CC.Add(cc);
                }
            }

            if (request.BccAddresses != null)
            {
                foreach (var bcc in request.BccAddresses)
                {
                    mailMessage.Bcc.Add(bcc);
                }
            }

            if (!string.IsNullOrEmpty(request.ReplyTo))
            {
                mailMessage.ReplyToList.Add(request.ReplyTo);
            }

            // Add attachments
            if (request.Attachments != null)
            {
                foreach (var attachment in request.Attachments)
                {
                    var stream = new MemoryStream(attachment.Value);
                    mailMessage.Attachments.Add(new Attachment(stream, attachment.Key));
                }
            }

            // Send via SMTP
            using var smtpClient = CreateSmtpClient();
            await smtpClient.SendMailAsync(mailMessage);

            // Record sent event
            await UpdateEmailStatusAsync(eventId, "sent", null);

            result.Success = true;
            result.EventId = eventId;
            result.MessageId = eventId.ToString();

            _logger.Information("Email sent successfully to {Email}, EventId: {EventId}",
                request.ToAddress, eventId);
        }
        catch (SmtpException ex)
        {
            _logger.Error(ex, "SMTP error sending email to {Email}", request.ToAddress);

            await UpdateEmailStatusAsync(eventId, "failed", ex.Message);

            result.Success = false;
            result.ErrorMessage = ex.Message;
            result.EventId = eventId;
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Error sending email to {Email}", request.ToAddress);

            await UpdateEmailStatusAsync(eventId, "failed", ex.Message);

            result.Success = false;
            result.ErrorMessage = ex.Message;
            result.EventId = eventId;
        }

        return result;
    }

    /// <summary>
    /// Sends an email using a template.
    /// </summary>
    public async Task<EmailResult> SendTemplateAsync(
        string templateName,
        string toAddress,
        Dictionary<string, string> variables,
        Guid? userId = null)
    {
        var template = await GetTemplateAsync(templateName);
        if (template == null)
        {
            return new EmailResult
            {
                Success = false,
                ErrorMessage = $"Template '{templateName}' not found"
            };
        }

        // Get subject from template table
        var subject = await GetTemplateSubjectAsync(templateName) ?? templateName;

        // Apply variables to subject and body
        foreach (var variable in variables)
        {
            subject = subject.Replace($"{{{{{variable.Key}}}}}", variable.Value);
        }

        return await SendAsync(new EmailRequest
        {
            ToAddress = toAddress,
            Subject = subject,
            Body = template,
            IsHtml = true,
            TemplateName = templateName,
            TemplateVariables = variables,
            UserId = userId
        });
    }

    /// <summary>
    /// Checks if an email is on the suppression list.
    /// </summary>
    public async Task<bool> IsSuppressionListedAsync(string email)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT email_is_suppressed(@email)",
            conn);
        cmd.Parameters.AddWithValue("email", email.ToLowerInvariant());

        var result = await cmd.ExecuteScalarAsync();
        return result is bool isSuppressed && isSuppressed;
    }

    /// <summary>
    /// Gets an email template by name.
    /// </summary>
    public async Task<string?> GetTemplateAsync(string templateName)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            @"SELECT ""HtmlBody"" FROM ""EmailTemplates""
              WHERE ""TemplateName"" = @name AND ""IsActive"" = TRUE",
            conn);
        cmd.Parameters.AddWithValue("name", templateName);

        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    private async Task<string?> GetTemplateSubjectAsync(string templateName)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            @"SELECT ""Subject"" FROM ""EmailTemplates""
              WHERE ""TemplateName"" = @name AND ""IsActive"" = TRUE",
            conn);
        cmd.Parameters.AddWithValue("name", templateName);

        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    private SmtpClient CreateSmtpClient()
    {
        var client = new SmtpClient(_smtpSettings.Host, _smtpSettings.Port)
        {
            EnableSsl = _smtpSettings.UseTls,
            DeliveryMethod = SmtpDeliveryMethod.Network
        };

        if (!string.IsNullOrEmpty(_smtpSettings.Username))
        {
            client.Credentials = new NetworkCredential(
                _smtpSettings.Username,
                _smtpSettings.Password);
        }

        return client;
    }

    private static string ApplyTemplateVariables(string template, Dictionary<string, string> variables)
    {
        foreach (var variable in variables)
        {
            template = template.Replace($"{{{{{variable.Key}}}}}", variable.Value);
        }
        return template;
    }

    private async Task RecordEmailEventAsync(
        Guid eventId,
        string toAddress,
        string subject,
        string eventType,
        Guid? userId,
        string? templateName)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand(
                @"INSERT INTO ""EmailEvents""
                  (""EventID"", ""ToAddress"", ""Subject"", ""EventType"", ""UserID"", ""TemplateName"", ""Status"")
                  VALUES (@eventId, @toAddress, @subject, @eventType, @userId, @templateName, 'pending')",
                conn);

            cmd.Parameters.AddWithValue("eventId", eventId);
            cmd.Parameters.AddWithValue("toAddress", toAddress);
            cmd.Parameters.AddWithValue("subject", subject);
            cmd.Parameters.AddWithValue("eventType", eventType);
            cmd.Parameters.AddWithValue("userId", (object?)userId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("templateName", (object?)templateName ?? DBNull.Value);

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to record email event {EventId}", eventId);
        }
    }

    private async Task UpdateEmailStatusAsync(Guid eventId, string status, string? errorMessage)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand(
                @"UPDATE ""EmailEvents""
                  SET ""Status"" = @status,
                      ""ErrorMessage"" = @errorMessage,
                      ""SentAt"" = CASE WHEN @status = 'sent' THEN CURRENT_TIMESTAMP ELSE ""SentAt"" END,
                      ""UpdatedAt"" = CURRENT_TIMESTAMP
                  WHERE ""EventID"" = @eventId",
                conn);

            cmd.Parameters.AddWithValue("eventId", eventId);
            cmd.Parameters.AddWithValue("status", status);
            cmd.Parameters.AddWithValue("errorMessage", (object?)errorMessage ?? DBNull.Value);

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to update email status for {EventId}", eventId);
        }
    }
}
