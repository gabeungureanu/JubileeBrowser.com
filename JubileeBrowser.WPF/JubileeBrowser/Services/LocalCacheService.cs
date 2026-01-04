using System.Runtime.Caching;
using System.Text.Json;

namespace JubileeBrowser.Services;

/// <summary>
/// Local in-memory cache service for browser-side caching.
/// Uses MemoryCache for fast DNS resolutions, session data, and content fragments.
/// </summary>
public interface ILocalCacheService
{
    T? Get<T>(string key) where T : class;
    void Set<T>(string key, T value, TimeSpan? expiry = null) where T : class;
    void Remove(string key);
    bool Exists(string key);
    void Clear();
    T? GetOrSet<T>(string key, Func<T?> factory, TimeSpan? expiry = null) where T : class;
    Task<T?> GetOrSetAsync<T>(string key, Func<Task<T?>> factory, TimeSpan? expiry = null) where T : class;
    CacheStatistics GetStatistics();
}

public class CacheStatistics
{
    public long TotalHits { get; set; }
    public long TotalMisses { get; set; }
    public long CurrentItemCount { get; set; }
    public double HitRatio => TotalHits + TotalMisses > 0
        ? (double)TotalHits / (TotalHits + TotalMisses)
        : 0;
}

public class LocalCacheService : ILocalCacheService, IDisposable
{
    private readonly MemoryCache _cache;
    private readonly TimeSpan _defaultExpiry;
    private long _hits;
    private long _misses;

    public LocalCacheService()
    {
        _cache = new MemoryCache("JubileeBrowserCache");
        _defaultExpiry = TimeSpan.FromMinutes(30);
    }

    public T? Get<T>(string key) where T : class
    {
        var item = _cache.Get(key);
        if (item != null)
        {
            Interlocked.Increment(ref _hits);
            return item as T;
        }
        Interlocked.Increment(ref _misses);
        return null;
    }

    public void Set<T>(string key, T value, TimeSpan? expiry = null) where T : class
    {
        var policy = new CacheItemPolicy
        {
            AbsoluteExpiration = DateTimeOffset.UtcNow.Add(expiry ?? _defaultExpiry)
        };
        _cache.Set(key, value, policy);
    }

    public void Remove(string key)
    {
        _cache.Remove(key);
    }

    public bool Exists(string key)
    {
        return _cache.Contains(key);
    }

    public void Clear()
    {
        // MemoryCache doesn't have a clear method, so we dispose and recreate
        // In production, iterate and remove items or use a different approach
        var keys = _cache.Select(kvp => kvp.Key).ToList();
        foreach (var key in keys)
        {
            _cache.Remove(key);
        }
    }

    public T? GetOrSet<T>(string key, Func<T?> factory, TimeSpan? expiry = null) where T : class
    {
        var cached = Get<T>(key);
        if (cached != null)
        {
            return cached;
        }

        var value = factory();
        if (value != null)
        {
            Set(key, value, expiry);
        }
        return value;
    }

    public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T?>> factory, TimeSpan? expiry = null) where T : class
    {
        var cached = Get<T>(key);
        if (cached != null)
        {
            return cached;
        }

        var value = await factory();
        if (value != null)
        {
            Set(key, value, expiry);
        }
        return value;
    }

    public CacheStatistics GetStatistics()
    {
        return new CacheStatistics
        {
            TotalHits = Interlocked.Read(ref _hits),
            TotalMisses = Interlocked.Read(ref _misses),
            CurrentItemCount = _cache.GetCount()
        };
    }

    public void Dispose()
    {
        _cache.Dispose();
    }
}

/// <summary>
/// Cache keys for browser-side caching.
/// </summary>
public static class LocalCacheKeys
{
    public static string DnsResolution(string privateUrl) => $"dns:{privateUrl.ToLowerInvariant()}";
    public static string WebSpaceTypes => "webspace:types";
    public static string UserSession => "session:current";
    public static string AccessToken => "token:access";
    public static string RefreshToken => "token:refresh";
    public static string UserPermissions => "user:permissions";
    public static string RecentHistory(int count) => $"history:recent:{count}";
    public static string Favorites => "favorites:all";
    public static string Settings => "settings:user";
}
