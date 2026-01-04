using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using JubileeBrowser.API.Services;
using System.Security.Claims;

namespace JubileeBrowser.API.Controllers;

/// <summary>
/// Email API controller for sending and managing emails.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EmailController : ControllerBase
{
    private readonly IEmailService _emailService;
    private readonly ILogger<EmailController> _logger;

    public EmailController(IEmailService emailService, ILogger<EmailController> logger)
    {
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>
    /// Send a transactional email.
    /// </summary>
    [HttpPost("send")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> SendEmail([FromBody] SendEmailRequest request)
    {
        if (string.IsNullOrEmpty(request.ToAddress))
        {
            return BadRequest(new { message = "ToAddress is required" });
        }

        if (string.IsNullOrEmpty(request.Subject) && string.IsNullOrEmpty(request.TemplateName))
        {
            return BadRequest(new { message = "Subject or TemplateName is required" });
        }

        var userId = GetCurrentUserId();

        EmailResult result;

        if (!string.IsNullOrEmpty(request.TemplateName))
        {
            result = await _emailService.SendTemplateAsync(
                request.TemplateName,
                request.ToAddress,
                request.TemplateVariables ?? new Dictionary<string, string>(),
                userId);
        }
        else
        {
            result = await _emailService.SendAsync(new EmailRequest
            {
                ToAddress = request.ToAddress,
                ToName = request.ToName,
                Subject = request.Subject!,
                Body = request.Body ?? "",
                IsHtml = request.IsHtml,
                UserId = userId,
                CcAddresses = request.CcAddresses,
                BccAddresses = request.BccAddresses,
                ReplyTo = request.ReplyTo
            });
        }

        if (result.Success)
        {
            return Ok(new
            {
                success = true,
                messageId = result.MessageId,
                eventId = result.EventId
            });
        }

        return BadRequest(new
        {
            success = false,
            message = result.ErrorMessage
        });
    }

    /// <summary>
    /// Send a template-based email.
    /// </summary>
    [HttpPost("send-template")]
    [Authorize(Roles = "admin,superadmin,developer")]
    public async Task<IActionResult> SendTemplateEmail([FromBody] SendTemplateRequest request)
    {
        if (string.IsNullOrEmpty(request.ToAddress))
        {
            return BadRequest(new { message = "ToAddress is required" });
        }

        if (string.IsNullOrEmpty(request.TemplateName))
        {
            return BadRequest(new { message = "TemplateName is required" });
        }

        var userId = GetCurrentUserId();

        var result = await _emailService.SendTemplateAsync(
            request.TemplateName,
            request.ToAddress,
            request.Variables ?? new Dictionary<string, string>(),
            userId);

        if (result.Success)
        {
            return Ok(new
            {
                success = true,
                messageId = result.MessageId,
                eventId = result.EventId
            });
        }

        return BadRequest(new
        {
            success = false,
            message = result.ErrorMessage
        });
    }

    /// <summary>
    /// Check if an email is on the suppression list.
    /// </summary>
    [HttpGet("suppression-check")]
    [Authorize(Roles = "admin,superadmin")]
    public async Task<IActionResult> CheckSuppression([FromQuery] string email)
    {
        if (string.IsNullOrEmpty(email))
        {
            return BadRequest(new { message = "Email is required" });
        }

        var isSuppressed = await _emailService.IsSuppressionListedAsync(email);

        return Ok(new
        {
            email = email,
            isSuppressed = isSuppressed
        });
    }

    /// <summary>
    /// Get an email template.
    /// </summary>
    [HttpGet("templates/{templateName}")]
    [Authorize(Roles = "admin,superadmin,developer")]
    public async Task<IActionResult> GetTemplate(string templateName)
    {
        var template = await _emailService.GetTemplateAsync(templateName);

        if (template == null)
        {
            return NotFound(new { message = $"Template '{templateName}' not found" });
        }

        return Ok(new
        {
            templateName = templateName,
            htmlBody = template
        });
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;

        if (Guid.TryParse(userIdClaim, out var userId))
        {
            return userId;
        }

        return null;
    }
}

/// <summary>
/// Request model for sending email.
/// </summary>
public class SendEmailRequest
{
    public string ToAddress { get; set; } = "";
    public string? ToName { get; set; }
    public string? Subject { get; set; }
    public string? Body { get; set; }
    public bool IsHtml { get; set; } = true;
    public string? TemplateName { get; set; }
    public Dictionary<string, string>? TemplateVariables { get; set; }
    public List<string>? CcAddresses { get; set; }
    public List<string>? BccAddresses { get; set; }
    public string? ReplyTo { get; set; }
}

/// <summary>
/// Request model for sending template email.
/// </summary>
public class SendTemplateRequest
{
    public string ToAddress { get; set; } = "";
    public string TemplateName { get; set; } = "";
    public Dictionary<string, string>? Variables { get; set; }
}
