using StackExchange.Redis;
using System.Text.Json;
using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Services;

/// <summary>
/// Redis caching service with connection pooling, cache-aside pattern,
/// and pub/sub messaging support.
/// </summary>
public interface IRedisCacheService
{
    // Basic cache operations
    Task<T?> GetAsync<T>(string key) where T : class;
    Task<bool> SetAsync<T>(string key, T value, TimeSpan? expiry = null) where T : class;
    Task<bool> RemoveAsync(string key);
    Task<bool> ExistsAsync(string key);
    Task<bool> SetExpiryAsync(string key, TimeSpan expiry);

    // Cache-aside pattern
    Task<T?> GetOrSetAsync<T>(string key, Func<Task<T?>> factory, TimeSpan? expiry = null) where T : class;

    // Hash operations for analytics
    Task<long> HashIncrementAsync(string key, string field, long value = 1);
    Task<Dictionary<string, long>> HashGetAllAsync(string key);
    Task<bool> HashDeleteAsync(string key, string field);

    // Pub/Sub operations
    Task PublishAsync(string channel, PubSubMessage message);
    Task SubscribeAsync(string channel, Action<PubSubMessage> handler);

    // Bulk operations
    Task<bool> RemoveByPatternAsync(string pattern);
    Task<long> GetKeyCountAsync(string pattern);

    // Health check
    Task<bool> IsConnectedAsync();
}

public class RedisCacheService : IRedisCacheService, IDisposable
{
    private readonly IConnectionMultiplexer _redis;
    private readonly IDatabase _db;
    private readonly ISubscriber _subscriber;
    private readonly ILogger<RedisCacheService> _logger;
    private readonly IConfiguration _configuration;
    private readonly string _keyPrefix;
    private readonly TimeSpan _defaultTtl;

    public RedisCacheService(
        IConnectionMultiplexer redis,
        ILogger<RedisCacheService> logger,
        IConfiguration configuration)
    {
        _redis = redis;
        _db = redis.GetDatabase();
        _subscriber = redis.GetSubscriber();
        _logger = logger;
        _configuration = configuration;
        _keyPrefix = configuration["Redis:KeyPrefix"] ?? "jubilee:";
        _defaultTtl = TimeSpan.FromMinutes(
            configuration.GetValue<int>("Redis:DefaultCacheTtlMinutes", 60));
    }

    private string PrefixKey(string key) => $"{_keyPrefix}{key}";

    public async Task<T?> GetAsync<T>(string key) where T : class
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var value = await _db.StringGetAsync(prefixedKey);

            if (value.IsNullOrEmpty)
            {
                _logger.LogDebug("Cache miss for key: {Key}", key);
                return null;
            }

            _logger.LogDebug("Cache hit for key: {Key}", key);
            return JsonSerializer.Deserialize<T>(value!);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cache key: {Key}", key);
            return null;
        }
    }

    public async Task<bool> SetAsync<T>(string key, T value, TimeSpan? expiry = null) where T : class
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var serialized = JsonSerializer.Serialize(value);
            var ttl = expiry ?? _defaultTtl;

            var result = await _db.StringSetAsync(prefixedKey, serialized, ttl);
            _logger.LogDebug("Cache set for key: {Key}, TTL: {Ttl}", key, ttl);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting cache key: {Key}", key);
            return false;
        }
    }

    public async Task<bool> RemoveAsync(string key)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var result = await _db.KeyDeleteAsync(prefixedKey);
            _logger.LogDebug("Cache removed for key: {Key}", key);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing cache key: {Key}", key);
            return false;
        }
    }

    public async Task<bool> ExistsAsync(string key)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            return await _db.KeyExistsAsync(prefixedKey);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking cache key existence: {Key}", key);
            return false;
        }
    }

    public async Task<bool> SetExpiryAsync(string key, TimeSpan expiry)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            return await _db.KeyExpireAsync(prefixedKey, expiry);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting expiry for key: {Key}", key);
            return false;
        }
    }

    /// <summary>
    /// Cache-aside pattern: Get from cache, or fetch from source and cache.
    /// </summary>
    public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T?>> factory, TimeSpan? expiry = null) where T : class
    {
        // Try cache first
        var cached = await GetAsync<T>(key);
        if (cached != null)
        {
            return cached;
        }

        // Cache miss - fetch from source
        var value = await factory();
        if (value != null)
        {
            await SetAsync(key, value, expiry);
        }

        return value;
    }

    /// <summary>
    /// Increment a hash field - used for analytics counters.
    /// </summary>
    public async Task<long> HashIncrementAsync(string key, string field, long value = 1)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var result = await _db.HashIncrementAsync(prefixedKey, field, value);
            _logger.LogDebug("Hash increment: {Key}.{Field} += {Value} = {Result}", key, field, value, result);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error incrementing hash: {Key}.{Field}", key, field);
            return 0;
        }
    }

    public async Task<Dictionary<string, long>> HashGetAllAsync(string key)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            var entries = await _db.HashGetAllAsync(prefixedKey);
            return entries.ToDictionary(
                e => e.Name.ToString(),
                e => (long)e.Value);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting hash: {Key}", key);
            return new Dictionary<string, long>();
        }
    }

    public async Task<bool> HashDeleteAsync(string key, string field)
    {
        try
        {
            var prefixedKey = PrefixKey(key);
            return await _db.HashDeleteAsync(prefixedKey, field);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting hash field: {Key}.{Field}", key, field);
            return false;
        }
    }

    /// <summary>
    /// Publish a message to a Redis channel.
    /// </summary>
    public async Task PublishAsync(string channel, PubSubMessage message)
    {
        try
        {
            var prefixedChannel = PrefixKey($"channel:{channel}");
            var serialized = JsonSerializer.Serialize(message);
            await _subscriber.PublishAsync(RedisChannel.Literal(prefixedChannel), serialized);
            _logger.LogDebug("Published to channel: {Channel}, EventType: {EventType}", channel, message.EventType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error publishing to channel: {Channel}", channel);
        }
    }

    /// <summary>
    /// Subscribe to a Redis channel.
    /// </summary>
    public async Task SubscribeAsync(string channel, Action<PubSubMessage> handler)
    {
        try
        {
            var prefixedChannel = PrefixKey($"channel:{channel}");
            await _subscriber.SubscribeAsync(RedisChannel.Literal(prefixedChannel), (ch, message) =>
            {
                try
                {
                    var msg = JsonSerializer.Deserialize<PubSubMessage>(message!);
                    if (msg != null)
                    {
                        handler(msg);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error handling message from channel: {Channel}", channel);
                }
            });
            _logger.LogInformation("Subscribed to channel: {Channel}", channel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error subscribing to channel: {Channel}", channel);
        }
    }

    public async Task<bool> RemoveByPatternAsync(string pattern)
    {
        try
        {
            var prefixedPattern = PrefixKey(pattern);
            var endpoints = _redis.GetEndPoints();
            var server = _redis.GetServer(endpoints.First());
            var keys = server.Keys(pattern: prefixedPattern).ToArray();

            if (keys.Length > 0)
            {
                await _db.KeyDeleteAsync(keys);
                _logger.LogDebug("Removed {Count} keys matching pattern: {Pattern}", keys.Length, pattern);
            }
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing keys by pattern: {Pattern}", pattern);
            return false;
        }
    }

    public async Task<long> GetKeyCountAsync(string pattern)
    {
        try
        {
            var prefixedPattern = PrefixKey(pattern);
            var endpoints = _redis.GetEndPoints();
            var server = _redis.GetServer(endpoints.First());
            return server.Keys(pattern: prefixedPattern).Count();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error counting keys by pattern: {Pattern}", pattern);
            return 0;
        }
    }

    public async Task<bool> IsConnectedAsync()
    {
        try
        {
            await _db.PingAsync();
            return _redis.IsConnected;
        }
        catch
        {
            return false;
        }
    }

    public void Dispose()
    {
        // Connection multiplexer is managed by DI container
    }
}

/// <summary>
/// Cache key builder for consistent key generation.
/// </summary>
public static class CacheKeys
{
    public static string DnsRecord(string privateUrl) => $"dns:{privateUrl.ToLowerInvariant()}";
    public static string DnsRecordById(int dnsId) => $"dns:id:{dnsId}";
    public static string DnsByType(string typeName) => $"dns:type:{typeName.ToLowerInvariant()}";
    public static string WebSpaceType(string typeName) => $"webspace:type:{typeName.ToLowerInvariant()}";
    public static string WebSpaceTypeById(int typeId) => $"webspace:type:id:{typeId}";
    public static string AllWebSpaceTypes => "webspace:types:all";
    public static string UserSession(Guid userId) => $"session:{userId}";
    public static string UserPermissions(Guid userId) => $"permissions:{userId}";
    public static string RefreshToken(string tokenHash) => $"token:refresh:{tokenHash}";
    public static string HitCount(string webspaceId, DateTime date) => $"hits:{date:yyyy-MM-dd}:{webspaceId}";
    public static string HitCountPattern(DateTime date) => $"hits:{date:yyyy-MM-dd}:*";
}
