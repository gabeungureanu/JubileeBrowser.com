namespace JubileeBrowser.Services;

/// <summary>
/// DNS resolution client service that integrates local caching with API calls.
/// Provides the Jubilee Browser with fast DNS lookups for Inspire protocol URLs.
/// </summary>
public interface IDnsClientService
{
    Task<ApiDnsResolutionResult> ResolveAsync(string privateUrl);
    Task<List<ApiWebSpaceType>> GetWebSpaceTypesAsync();
    Task InvalidateCacheAsync(string? privateUrl = null);
}

/// <summary>
/// API-based DNS resolution result (different from the local WWBW resolver result).
/// </summary>
public class ApiDnsResolutionResult
{
    public bool Success { get; set; }
    public string? ResolvedUrl { get; set; }
    public string? PrivateUrl { get; set; }
    public string? WebSpaceType { get; set; }
    public string? DomainName { get; set; }
    public bool FromCache { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Web space type from API.
/// </summary>
public class ApiWebSpaceType
{
    public int TypeId { get; set; }
    public string FullTypeName { get; set; } = string.Empty;
    public string? AbbreviatedName { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; }
}

public class DnsClientService : IDnsClientService
{
    private readonly ILocalCacheService _cache;
    private readonly IApiClientService _api;
    private readonly TimeSpan _dnsCacheTtl;
    private readonly TimeSpan _typesCacheTtl;

    public DnsClientService(ILocalCacheService cache, IApiClientService api)
    {
        _cache = cache;
        _api = api;
        _dnsCacheTtl = TimeSpan.FromMinutes(30);
        _typesCacheTtl = TimeSpan.FromHours(1);
    }

    /// <summary>
    /// Resolves a private protocol URL using local cache first, then API.
    /// </summary>
    public async Task<ApiDnsResolutionResult> ResolveAsync(string privateUrl)
    {
        if (string.IsNullOrWhiteSpace(privateUrl))
        {
            return new ApiDnsResolutionResult
            {
                Success = false,
                ErrorMessage = "Private URL cannot be empty"
            };
        }

        var normalizedUrl = privateUrl.Trim().ToLowerInvariant();
        var cacheKey = LocalCacheKeys.DnsResolution(normalizedUrl);

        // Try local cache first
        var cached = _cache.Get<ApiDnsResolutionResult>(cacheKey);
        if (cached != null)
        {
            cached.FromCache = true;
            return cached;
        }

        // Fallback to API
        var response = await _api.GetAsync<ApiDnsResolutionResult>($"api/dns/resolve?url={Uri.EscapeDataString(normalizedUrl)}");

        if (response.Success && response.Data != null)
        {
            // Cache successful results
            if (response.Data.Success)
            {
                _cache.Set(cacheKey, response.Data, _dnsCacheTtl);
            }
            return response.Data;
        }

        // API failed - try offline fallback if we have cached data
        return new ApiDnsResolutionResult
        {
            Success = false,
            PrivateUrl = privateUrl,
            ErrorMessage = response.ErrorMessage ?? "Failed to resolve DNS"
        };
    }

    /// <summary>
    /// Gets all available web space types.
    /// </summary>
    public async Task<List<ApiWebSpaceType>> GetWebSpaceTypesAsync()
    {
        return await _cache.GetOrSetAsync(LocalCacheKeys.WebSpaceTypes, async () =>
        {
            var response = await _api.GetAsync<List<ApiWebSpaceType>>("api/dns/types");
            return response.Success ? response.Data : new List<ApiWebSpaceType>();
        }, _typesCacheTtl) ?? new List<ApiWebSpaceType>();
    }

    /// <summary>
    /// Invalidates the local DNS cache.
    /// </summary>
    public Task InvalidateCacheAsync(string? privateUrl = null)
    {
        if (!string.IsNullOrEmpty(privateUrl))
        {
            _cache.Remove(LocalCacheKeys.DnsResolution(privateUrl));
        }
        else
        {
            // Clear all DNS cache entries
            // Note: MemoryCache doesn't support pattern removal, so this is a simple clear
            _cache.Clear();
        }
        return Task.CompletedTask;
    }
}
