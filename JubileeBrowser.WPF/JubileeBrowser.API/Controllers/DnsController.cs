using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using JubileeBrowser.API.Services;
using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DnsController : ControllerBase
{
    private readonly IDnsResolutionService _dnsService;
    private readonly IAnalyticsBatchingService _analyticsService;
    private readonly ILogger<DnsController> _logger;

    public DnsController(
        IDnsResolutionService dnsService,
        IAnalyticsBatchingService analyticsService,
        ILogger<DnsController> logger)
    {
        _dnsService = dnsService;
        _analyticsService = analyticsService;
        _logger = logger;
    }

    /// <summary>
    /// Resolves a private protocol URL to its public URL.
    /// Example: inspire://home.inspire -> https://www.worldwidebibleweb.com/inspire/home/
    /// </summary>
    [HttpGet("resolve")]
    [AllowAnonymous]
    public async Task<ActionResult<DnsResolutionResult>> Resolve([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new DnsResolutionResult
            {
                Success = false,
                ErrorMessage = "URL parameter is required"
            });
        }

        var result = await _dnsService.ResolveAsync(url);

        // Record hit for analytics (fire and forget)
        if (result.Success && !string.IsNullOrEmpty(result.DomainName))
        {
            var webspaceId = $"{result.DomainName}.{result.WebSpaceType}";
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var ipAddress = GetClientIpAddress();
            _ = _analyticsService.RecordHitAsync(webspaceId, userId, ipAddress);
        }

        return Ok(result);
    }

    /// <summary>
    /// Gets a DNS record by ID.
    /// </summary>
    [HttpGet("{id:int}")]
    [Authorize(Roles = "superadmin,admin,dns_manager")]
    public async Task<ActionResult<DnsRecord>> GetById(int id)
    {
        var record = await _dnsService.GetDnsRecordByIdAsync(id);
        if (record == null)
        {
            return NotFound();
        }
        return Ok(record);
    }

    /// <summary>
    /// Gets all DNS records for a specific web space type.
    /// </summary>
    [HttpGet("type/{typeName}")]
    [AllowAnonymous]
    public async Task<ActionResult<List<DnsRecord>>> GetByType(string typeName)
    {
        var records = await _dnsService.GetDnsRecordsByTypeAsync(typeName);
        return Ok(records);
    }

    /// <summary>
    /// Gets all web space types.
    /// </summary>
    [HttpGet("types")]
    [AllowAnonymous]
    public async Task<ActionResult<List<WebSpaceType>>> GetWebSpaceTypes()
    {
        var types = await _dnsService.GetAllWebSpaceTypesAsync();
        return Ok(types);
    }

    /// <summary>
    /// Invalidates DNS cache (admin only).
    /// </summary>
    [HttpPost("invalidate-cache")]
    [Authorize(Roles = "superadmin,admin")]
    public async Task<IActionResult> InvalidateCache([FromQuery] string? url = null, [FromQuery] int? id = null)
    {
        await _dnsService.InvalidateCacheAsync(url, id);
        return Ok(new { message = "Cache invalidated successfully" });
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
