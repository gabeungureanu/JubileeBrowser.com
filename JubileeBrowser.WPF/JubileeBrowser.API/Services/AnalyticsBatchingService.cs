using Npgsql;
using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Services;

/// <summary>
/// Analytics batching service that accumulates hit counts in Redis
/// and periodically flushes them to PostgreSQL.
/// Uses Redis HINCRBY for atomic counter increments.
/// </summary>
public interface IAnalyticsBatchingService
{
    Task RecordHitAsync(string webspaceId, string? userId = null, string? ipAddress = null);
    Task RecordEventAsync(AnalyticsEvent analyticsEvent);
    Task<WebSpaceAnalytics> GetWebSpaceAnalyticsAsync(string webspaceId);
    Task FlushToPostgresAsync();
}

public class AnalyticsBatchingService : IAnalyticsBatchingService
{
    private readonly IRedisCacheService _cache;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AnalyticsBatchingService> _logger;
    private readonly string _connectionString;
    private readonly int _batchSize;

    public AnalyticsBatchingService(
        IRedisCacheService cache,
        IConfiguration configuration,
        ILogger<AnalyticsBatchingService> logger)
    {
        _cache = cache;
        _configuration = configuration;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("PostgreSQL")
            ?? throw new InvalidOperationException("PostgreSQL connection string not configured");
        _batchSize = configuration.GetValue<int>("Analytics:BatchSize", 100);
    }

    /// <summary>
    /// Records a page hit in Redis using HINCRBY for atomic increment.
    /// Format: hits:YYYY-MM-DD:{webspaceId} -> hash with hourly buckets
    /// </summary>
    public async Task RecordHitAsync(string webspaceId, string? userId = null, string? ipAddress = null)
    {
        var now = DateTime.UtcNow;
        var dateKey = CacheKeys.HitCount(webspaceId, now);
        var hourField = now.Hour.ToString("D2"); // "00" - "23"

        try
        {
            // Increment hourly bucket
            await _cache.HashIncrementAsync(dateKey, hourField);

            // Increment daily total
            await _cache.HashIncrementAsync(dateKey, "total");

            // Set expiry on the key (48 hours to ensure flush happens)
            await _cache.SetExpiryAsync(dateKey, TimeSpan.FromHours(48));

            // Publish hit event for real-time dashboards
            await _cache.PublishAsync("events", new PubSubMessage
            {
                EventType = EventTypes.PageHit,
                EntityId = webspaceId,
                EntityType = "WebSpace",
                Data = new Dictionary<string, object>
                {
                    ["hour"] = now.Hour,
                    ["userId"] = userId ?? "anonymous",
                    ["ipAddress"] = ipAddress ?? "unknown"
                },
                SourceService = "AnalyticsBatchingService"
            });

            _logger.LogDebug("Recorded hit for {WebspaceId} at {Hour}:00", webspaceId, hourField);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record hit for {WebspaceId}", webspaceId);
        }
    }

    /// <summary>
    /// Records a generic analytics event.
    /// </summary>
    public async Task RecordEventAsync(AnalyticsEvent analyticsEvent)
    {
        var now = DateTime.UtcNow;
        var eventKey = $"events:{now:yyyy-MM-dd}:{analyticsEvent.EventType}";

        try
        {
            await _cache.HashIncrementAsync(eventKey, analyticsEvent.WebSpaceId);
            await _cache.SetExpiryAsync(eventKey, TimeSpan.FromHours(48));

            _logger.LogDebug("Recorded event {EventType} for {WebspaceId}",
                analyticsEvent.EventType, analyticsEvent.WebSpaceId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to record event {EventType}", analyticsEvent.EventType);
        }
    }

    /// <summary>
    /// Gets analytics summary for a webspace.
    /// Combines Redis (today) and PostgreSQL (historical) data.
    /// </summary>
    public async Task<WebSpaceAnalytics> GetWebSpaceAnalyticsAsync(string webspaceId)
    {
        var analytics = new WebSpaceAnalytics
        {
            WebSpaceId = webspaceId,
            WebSpaceName = webspaceId
        };

        try
        {
            // Get today's hits from Redis
            var todayKey = CacheKeys.HitCount(webspaceId, DateTime.UtcNow);
            var todayHits = await _cache.HashGetAllAsync(todayKey);
            analytics.TodayHits = todayHits.GetValueOrDefault("total", 0);

            // Get historical data from PostgreSQL
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            // Get totals and recent trends
            await using var cmd = new NpgsqlCommand(@"
                SELECT
                    COALESCE(SUM(""HitCount""), 0) as total_hits,
                    COALESCE(SUM(CASE WHEN ""RecordDate"" >= CURRENT_DATE - INTERVAL '7 days'
                                      THEN ""HitCount"" ELSE 0 END), 0) as week_hits,
                    COALESCE(SUM(CASE WHEN ""RecordDate"" >= CURRENT_DATE - INTERVAL '30 days'
                                      THEN ""HitCount"" ELSE 0 END), 0) as month_hits
                FROM ""HitCount_Daily""
                WHERE ""WebSpaceID"" = @webspaceId", conn);

            cmd.Parameters.AddWithValue("webspaceId", webspaceId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                analytics.TotalHits = reader.GetInt64(0) + analytics.TodayHits;
                analytics.WeekHits = reader.GetInt64(1) + analytics.TodayHits;
                analytics.MonthHits = reader.GetInt64(2) + analytics.TodayHits;
            }

            await reader.CloseAsync();

            // Get daily trend (last 30 days)
            await using var trendCmd = new NpgsqlCommand(@"
                SELECT ""RecordDate"", ""HitCount""
                FROM ""HitCount_Daily""
                WHERE ""WebSpaceID"" = @webspaceId
                  AND ""RecordDate"" >= CURRENT_DATE - INTERVAL '30 days'
                ORDER BY ""RecordDate"" DESC", conn);

            trendCmd.Parameters.AddWithValue("webspaceId", webspaceId);

            await using var trendReader = await trendCmd.ExecuteReaderAsync();
            while (await trendReader.ReadAsync())
            {
                analytics.DailyTrend.Add(new DailyHitSummary
                {
                    Date = trendReader.GetDateTime(0),
                    Hits = trendReader.GetInt64(1)
                });
            }

            // Add today's data to trend
            if (analytics.TodayHits > 0)
            {
                analytics.DailyTrend.Insert(0, new DailyHitSummary
                {
                    Date = DateTime.UtcNow.Date,
                    Hits = analytics.TodayHits
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get analytics for {WebspaceId}", webspaceId);
        }

        return analytics;
    }

    /// <summary>
    /// Flushes accumulated hit counts from Redis to PostgreSQL.
    /// Called by the background service on a schedule.
    /// </summary>
    public async Task FlushToPostgresAsync()
    {
        var yesterday = DateTime.UtcNow.AddDays(-1);
        var flushDate = yesterday.Date;

        _logger.LogInformation("Starting analytics flush for date: {Date}", flushDate);

        try
        {
            // Get all hit count keys for yesterday
            var keyPattern = $"hits:{flushDate:yyyy-MM-dd}:*";
            var keyCount = await _cache.GetKeyCountAsync(keyPattern);

            if (keyCount == 0)
            {
                _logger.LogDebug("No analytics data to flush for {Date}", flushDate);
                return;
            }

            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            // We need to iterate through keys manually
            // In production, you'd use SCAN to get matching keys
            // For now, we'll use a simpler approach with known webspace IDs

            await using var webspaceCmd = new NpgsqlCommand(@"
                SELECT DISTINCT ""DomainName"" || '.' || wt.""FullTypeName"" as webspace_id
                FROM ""DNS"" d
                JOIN ""WebSpaceTypes"" wt ON wt.""Type_ID"" = d.""Type_ID""
                WHERE d.""IsActive"" = TRUE", conn);

            var webspaceIds = new List<string>();
            await using var reader = await webspaceCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                webspaceIds.Add(reader.GetString(0));
            }
            await reader.CloseAsync();

            var flushedCount = 0;
            foreach (var webspaceId in webspaceIds)
            {
                var cacheKey = CacheKeys.HitCount(webspaceId, flushDate);
                var hits = await _cache.HashGetAllAsync(cacheKey);

                if (!hits.TryGetValue("total", out var totalHits) || totalHits == 0)
                {
                    continue;
                }

                // Build hourly breakdown JSON
                var hourlyBreakdown = hits
                    .Where(kv => kv.Key != "total" && int.TryParse(kv.Key, out _))
                    .ToDictionary(kv => kv.Key, kv => kv.Value);

                // Upsert into PostgreSQL
                await using var upsertCmd = new NpgsqlCommand(@"
                    INSERT INTO ""HitCount_Daily"" (""WebSpaceID"", ""RecordDate"", ""HitCount"", ""HourlyBreakdown"")
                    VALUES (@webspaceId, @recordDate, @hitCount, @hourlyBreakdown::jsonb)
                    ON CONFLICT (""WebSpaceID"", ""RecordDate"")
                    DO UPDATE SET
                        ""HitCount"" = ""HitCount_Daily"".""HitCount"" + EXCLUDED.""HitCount"",
                        ""HourlyBreakdown"" = EXCLUDED.""HourlyBreakdown"",
                        ""UpdatedAt"" = CURRENT_TIMESTAMP", conn);

                upsertCmd.Parameters.AddWithValue("webspaceId", webspaceId);
                upsertCmd.Parameters.AddWithValue("recordDate", flushDate);
                upsertCmd.Parameters.AddWithValue("hitCount", totalHits);
                upsertCmd.Parameters.AddWithValue("hourlyBreakdown",
                    System.Text.Json.JsonSerializer.Serialize(hourlyBreakdown));

                await upsertCmd.ExecuteNonQueryAsync();

                // Remove the flushed Redis key
                await _cache.RemoveAsync(cacheKey);
                flushedCount++;
            }

            _logger.LogInformation("Flushed {Count} webspace analytics to PostgreSQL for {Date}",
                flushedCount, flushDate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to flush analytics for {Date}", flushDate);
        }
    }
}

/// <summary>
/// Background service that periodically flushes analytics from Redis to PostgreSQL.
/// </summary>
public class AnalyticsFlushBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AnalyticsFlushBackgroundService> _logger;
    private readonly TimeSpan _flushInterval;

    public AnalyticsFlushBackgroundService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<AnalyticsFlushBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _flushInterval = TimeSpan.FromSeconds(
            configuration.GetValue<int>("Analytics:FlushIntervalSeconds", 300));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Analytics flush service started with interval: {Interval}", _flushInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(_flushInterval, stoppingToken);

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var analyticsService = scope.ServiceProvider.GetRequiredService<IAnalyticsBatchingService>();
                await analyticsService.FlushToPostgresAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during analytics flush");
            }
        }
    }
}
