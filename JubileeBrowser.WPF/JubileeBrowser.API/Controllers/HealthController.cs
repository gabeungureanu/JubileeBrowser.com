using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using JubileeBrowser.API.Services;

namespace JubileeBrowser.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IRedisCacheService _cache;
    private readonly IConfiguration _configuration;
    private readonly ILogger<HealthController> _logger;

    public HealthController(
        IRedisCacheService cache,
        IConfiguration configuration,
        ILogger<HealthController> logger)
    {
        _cache = cache;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Basic health check endpoint.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "healthy",
            timestamp = DateTime.UtcNow,
            version = "8.0.6"
        });
    }

    /// <summary>
    /// Detailed health check including Redis and PostgreSQL.
    /// </summary>
    [HttpGet("detailed")]
    [Authorize(Roles = "superadmin,admin")]
    public async Task<IActionResult> GetDetailed()
    {
        var redisConnected = await _cache.IsConnectedAsync();

        // PostgreSQL check
        bool postgresConnected = false;
        try
        {
            await using var conn = new Npgsql.NpgsqlConnection(_configuration.GetConnectionString("PostgreSQL"));
            await conn.OpenAsync();
            postgresConnected = true;
        }
        catch
        {
            // Connection failed
        }

        var status = redisConnected && postgresConnected ? "healthy" : "degraded";

        return Ok(new
        {
            status,
            timestamp = DateTime.UtcNow,
            version = "8.0.6",
            services = new
            {
                redis = new { connected = redisConnected },
                postgres = new { connected = postgresConnected }
            }
        });
    }
}
