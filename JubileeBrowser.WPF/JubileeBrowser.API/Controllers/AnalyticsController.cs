using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using JubileeBrowser.API.Services;
using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    private readonly IAnalyticsBatchingService _analyticsService;
    private readonly ILogger<AnalyticsController> _logger;

    public AnalyticsController(
        IAnalyticsBatchingService analyticsService,
        ILogger<AnalyticsController> logger)
    {
        _analyticsService = analyticsService;
        _logger = logger;
    }

    /// <summary>
    /// Gets analytics summary for a specific webspace.
    /// </summary>
    [HttpGet("webspace/{webspaceId}")]
    [Authorize(Roles = "superadmin,admin,wwbw_builder")]
    public async Task<ActionResult<WebSpaceAnalytics>> GetWebSpaceAnalytics(string webspaceId)
    {
        var analytics = await _analyticsService.GetWebSpaceAnalyticsAsync(webspaceId);
        return Ok(analytics);
    }

    /// <summary>
    /// Records a custom analytics event.
    /// </summary>
    [HttpPost("event")]
    public async Task<IActionResult> RecordEvent([FromBody] AnalyticsEvent analyticsEvent)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        analyticsEvent.UserId = userId;
        analyticsEvent.IpAddress = GetClientIpAddress();
        analyticsEvent.UserAgent = Request.Headers.UserAgent.ToString();

        await _analyticsService.RecordEventAsync(analyticsEvent);
        return Ok(new { message = "Event recorded" });
    }

    /// <summary>
    /// Manually triggers analytics flush (admin only).
    /// </summary>
    [HttpPost("flush")]
    [Authorize(Roles = "superadmin,admin")]
    public async Task<IActionResult> FlushAnalytics()
    {
        await _analyticsService.FlushToPostgresAsync();
        return Ok(new { message = "Analytics flushed to database" });
    }

    private string? GetClientIpAddress()
    {
        var forwardedFor = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwardedFor))
        {
            return forwardedFor.Split(',').FirstOrDefault()?.Trim();
        }
        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }
}
