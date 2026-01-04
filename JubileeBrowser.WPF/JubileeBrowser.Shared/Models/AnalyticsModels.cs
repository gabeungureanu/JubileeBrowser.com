namespace JubileeBrowser.Shared.Models;

/// <summary>
/// Represents a hit count record for analytics.
/// </summary>
public class HitCountRecord
{
    public string WebSpaceId { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public long HitCount { get; set; }
    public Dictionary<string, long> HourlyBreakdown { get; set; } = new();
}

/// <summary>
/// Analytics event to be batched.
/// </summary>
public class AnalyticsEvent
{
    public string EventType { get; set; } = string.Empty;
    public string WebSpaceId { get; set; } = string.Empty;
    public string? UserId { get; set; }
    public string? SessionId { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string? Referrer { get; set; }
    public Dictionary<string, object>? Metadata { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Analytics summary for a webspace.
/// </summary>
public class WebSpaceAnalytics
{
    public string WebSpaceId { get; set; } = string.Empty;
    public string WebSpaceName { get; set; } = string.Empty;
    public long TotalHits { get; set; }
    public long UniqueVisitors { get; set; }
    public long TodayHits { get; set; }
    public long WeekHits { get; set; }
    public long MonthHits { get; set; }
    public List<DailyHitSummary> DailyTrend { get; set; } = new();
}

/// <summary>
/// Daily hit summary for trending.
/// </summary>
public class DailyHitSummary
{
    public DateTime Date { get; set; }
    public long Hits { get; set; }
}

/// <summary>
/// Event types for the message bus.
/// </summary>
public static class EventTypes
{
    public const string WebSpaceCreated = "webspace.created";
    public const string WebSpaceUpdated = "webspace.updated";
    public const string WebSpaceDeleted = "webspace.deleted";
    public const string DnsCreated = "dns.created";
    public const string DnsUpdated = "dns.updated";
    public const string DnsDeleted = "dns.deleted";
    public const string UserLoggedIn = "user.logged_in";
    public const string UserLoggedOut = "user.logged_out";
    public const string UserCreated = "user.created";
    public const string CacheInvalidated = "cache.invalidated";
    public const string PageHit = "page.hit";
}

/// <summary>
/// Message for Redis Pub/Sub.
/// </summary>
public class PubSubMessage
{
    public string EventType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string? EntityType { get; set; }
    public Dictionary<string, object>? Data { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string? SourceService { get; set; }
}
