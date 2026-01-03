using Npgsql;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

/// <summary>
/// DNS Resolver for the World Wide Bible Web (WWBW) private protocol system.
/// Resolves private protocol URLs (e.g., inspire://home.inspire) to public URLs.
/// </summary>
public class WWBWDnsResolver
{
    private readonly string _connectionString;
    private readonly Dictionary<string, DnsResolutionResult> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, DnsResolutionResult> _reverseCache = new(StringComparer.OrdinalIgnoreCase);
    private DateTime _cacheLastRefresh = DateTime.MinValue;
    private readonly TimeSpan _cacheExpiry = TimeSpan.FromMinutes(5);
    private bool _isInitialized = false;
    private bool _useFallbackOnly = false;

    // Abbreviated domain suffix mappings (short form -> full form)
    private static readonly Dictionary<string, string> DomainAbbreviations = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".webs", ".webspace" },
        { ".insp", ".inspire" },
        { ".chur", ".church" },
        { ".apos", ".apostle" },
        { ".prop", ".prophet" },
    };

    // Fallback DNS mappings when database is unavailable
    // All WWBW URLs use the inspire:// protocol only
    private static readonly Dictionary<string, (string PublicUrl, string? ThirdPartyOverride)> FallbackMappings = new(StringComparer.OrdinalIgnoreCase)
    {
        // inspire:// protocol mappings - the ONLY protocol for WWBW
        // Full form
        { "inspire://jubileeverse.webspace", ("https://www.worldwidebibleweb.com/webspace/jubileeverse/", "https://www.jubileeverse.com") },
        { "inspire://jubileebrowser.webspace", ("https://www.worldwidebibleweb.com/webspace/jubileebrowser/", "http://www.jubileebrowser.com") },
        { "inspire://home.inspire", ("https://www.worldwidebibleweb.com/inspire/home/", "https://www.jubileeverse.com") },
        { "inspire://jubileeverse.inspire", ("https://www.worldwidebibleweb.com/inspire/jubileeverse/", "https://www.jubileeverse.com") },
        { "inspire://trumplicated.webspace", ("https://www.worldwidebibleweb.com/webspace/trumplicated/", "https://www.trumplicated.com") },
        { "inspire://home.church", ("https://www.worldwidebibleweb.com/church/home/", null) },
        { "inspire://home.apostle", ("https://www.worldwidebibleweb.com/apostle/home/", null) },
        { "inspire://home.prophet", ("https://www.worldwidebibleweb.com/prophet/home/", null) },
        // Abbreviated forms
        { "inspire://jubileeverse.webs", ("https://www.worldwidebibleweb.com/webspace/jubileeverse/", "https://www.jubileeverse.com") },
        { "inspire://jubileebrowser.webs", ("https://www.worldwidebibleweb.com/webspace/jubileebrowser/", "http://www.jubileebrowser.com") },
        { "inspire://home.insp", ("https://www.worldwidebibleweb.com/inspire/home/", "https://www.jubileeverse.com") },
        { "inspire://jubileeverse.insp", ("https://www.worldwidebibleweb.com/inspire/jubileeverse/", "https://www.jubileeverse.com") },
        { "inspire://trumplicated.webs", ("https://www.worldwidebibleweb.com/webspace/trumplicated/", "https://www.trumplicated.com") },
        { "inspire://home.chur", ("https://www.worldwidebibleweb.com/church/home/", null) },
        { "inspire://home.apos", ("https://www.worldwidebibleweb.com/apostle/home/", null) },
        { "inspire://home.prop", ("https://www.worldwidebibleweb.com/prophet/home/", null) },
    };

    // Known private protocol schemes - only inspire:// is valid for WWBW mode
    private static readonly HashSet<string> PrivateProtocols = new(StringComparer.OrdinalIgnoreCase)
    {
        "inspire"
    };

    public WWBWDnsResolver(string? connectionString = null)
    {
        // Default connection string - can be overridden via settings
        _connectionString = connectionString ??
            "Host=localhost;Port=5432;Database=WorldWideBibleWeb;Username=postgres;Password=postgres";
    }

    public async Task InitializeAsync()
    {
        try
        {
            await RefreshCacheAsync();
            _isInitialized = true;
            _useFallbackOnly = false;
            System.Diagnostics.Debug.WriteLine($"WWBW DNS Resolver initialized with {_cache.Count} entries from database");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"WWBW DNS Resolver database unavailable: {ex.Message}");
            System.Diagnostics.Debug.WriteLine("Using fallback DNS mappings");
            // Continue without database - use fallback resolution
            _useFallbackOnly = true;
            _isInitialized = true; // Mark as initialized so we can use fallback mappings
            LoadFallbackMappings();
        }
    }

    private void LoadFallbackMappings()
    {
        _cache.Clear();
        _reverseCache.Clear();

        foreach (var mapping in FallbackMappings)
        {
            var privateUrl = mapping.Key;
            var (publicUrl, thirdPartyOverride) = mapping.Value;
            var resolvedUrl = thirdPartyOverride ?? publicUrl;

            // Parse the private URL to get type and domain
            var parsed = ParsePrivateUrl(privateUrl);
            var webSpaceType = parsed?.Type ?? "unknown";
            var domainName = parsed?.Domain ?? "unknown";

            var result = new DnsResolutionResult
            {
                PrivateProtocolUrl = privateUrl,
                ShortPrivateUrl = null,
                PublicUrl = publicUrl,
                ThirdPartyOverrideUrl = thirdPartyOverride,
                WebSpaceType = webSpaceType,
                DomainName = domainName,
                Priority = 1,
                ResolvedUrl = resolvedUrl
            };

            _cache[privateUrl] = result;
            _reverseCache[resolvedUrl] = result;
            if (!string.IsNullOrEmpty(thirdPartyOverride) && thirdPartyOverride != publicUrl)
            {
                _reverseCache[publicUrl] = result;
            }
        }

        _cacheLastRefresh = DateTime.UtcNow;
        System.Diagnostics.Debug.WriteLine($"WWBW DNS Resolver loaded {_cache.Count} fallback mappings");
    }

    /// <summary>
    /// Checks if the given URL uses a private WWBW protocol.
    /// </summary>
    public static bool IsPrivateProtocol(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;

        var colonIndex = url.IndexOf("://", StringComparison.Ordinal);
        if (colonIndex <= 0) return false;

        var scheme = url[..colonIndex];
        return PrivateProtocols.Contains(scheme);
    }

    /// <summary>
    /// Checks if a URL is valid for the given browser mode.
    /// - WWBW mode: Only inspire:// protocol URLs are allowed
    ///              Regular http:// and https:// URLs are NOT allowed
    /// - WWW mode: Both inspire:// protocol URLs and regular URLs are allowed
    /// </summary>
    public bool IsValidForMode(string url, BrowserMode mode)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;

        var isPrivate = IsPrivateProtocol(url);

        if (mode == BrowserMode.JubileeBibles)
        {
            // WWBW mode: ONLY inspire:// protocol allowed
            // Regular http:// and https:// URLs are blocked
            return isPrivate;
        }
        else
        {
            // WWW mode: All URLs allowed (inspire:// and regular http/https)
            return true;
        }
    }

    /// <summary>
    /// Checks if a URL should be blocked in WWBW mode.
    /// Returns true for http:// and https:// URLs that are not the result of resolving a private URL.
    /// </summary>
    public bool ShouldBlockInWWBWMode(string url, bool isResolvedFromPrivateUrl)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;

        // If this is a resolved URL from a private protocol, allow it
        if (isResolvedFromPrivateUrl) return false;

        // Check if it's a regular http/https URL
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            if (uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase) ||
                uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
            {
                // Block regular web URLs in WWBW mode
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Resolves a private protocol URL to its public equivalent.
    /// Returns null if resolution fails or URL is not a private protocol.
    /// </summary>
    public async Task<DnsResolutionResult?> ResolveAsync(string privateUrl)
    {
        if (!IsPrivateProtocol(privateUrl))
            return null;

        // Check cache first (includes fallback mappings if in fallback mode)
        if (_cache.TryGetValue(privateUrl, out var cached))
        {
            return cached;
        }

        // If using fallback only, try to create a dynamic fallback mapping
        if (_useFallbackOnly)
        {
            return TryCreateFallbackMapping(privateUrl);
        }

        // Try to resolve from database
        try
        {
            if (DateTime.UtcNow - _cacheLastRefresh > _cacheExpiry)
            {
                await RefreshCacheAsync();
            }

            if (_cache.TryGetValue(privateUrl, out cached))
            {
                return cached;
            }

            // Try parsing and resolving by components
            var parsed = ParsePrivateUrl(privateUrl);
            if (parsed != null)
            {
                var result = await ResolveByTypeAndDomainAsync(parsed.Value.Type, parsed.Value.Domain);
                if (result != null)
                {
                    _cache[privateUrl] = result;
                    return result;
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"DNS resolution error: {ex.Message}");
            // Fall back to dynamic mapping if database fails
            return TryCreateFallbackMapping(privateUrl);
        }

        return null;
    }

    /// <summary>
    /// Creates a dynamic fallback mapping for unknown private URLs.
    /// This allows any private protocol URL to resolve to a predictable public URL structure.
    /// </summary>
    private DnsResolutionResult? TryCreateFallbackMapping(string privateUrl)
    {
        var parsed = ParsePrivateUrl(privateUrl);
        if (parsed == null) return null;

        var (type, domain) = parsed.Value;

        // Create a dynamic public URL based on the pattern
        var publicUrl = $"https://www.worldwidebibleweb.com/{type.ToLowerInvariant()}/{domain.ToLowerInvariant()}/";

        var result = new DnsResolutionResult
        {
            PrivateProtocolUrl = privateUrl,
            ShortPrivateUrl = null,
            PublicUrl = publicUrl,
            ThirdPartyOverrideUrl = null,
            WebSpaceType = type,
            DomainName = domain,
            Priority = 100, // Lower priority than explicit mappings
            ResolvedUrl = publicUrl
        };

        // Cache the dynamic mapping
        _cache[privateUrl] = result;
        _reverseCache[publicUrl] = result;

        System.Diagnostics.Debug.WriteLine($"Created dynamic fallback mapping: {privateUrl} -> {publicUrl}");
        return result;
    }

    /// <summary>
    /// Resolves a private URL and returns the appropriate public URL.
    /// Uses ThirdPartyOverrideURL if available, otherwise uses PublicURL.
    /// </summary>
    public async Task<string?> ResolveToPublicUrlAsync(string privateUrl)
    {
        var result = await ResolveAsync(privateUrl);
        return result?.ResolvedUrl;
    }

    /// <summary>
    /// Reverse resolves a public URL to its private protocol equivalent.
    /// </summary>
    public async Task<string?> ReverseResolveAsync(string publicUrl)
    {
        if (string.IsNullOrWhiteSpace(publicUrl)) return null;

        // Check reverse cache
        if (_reverseCache.TryGetValue(publicUrl, out var cached) &&
            DateTime.UtcNow - _cacheLastRefresh < _cacheExpiry)
        {
            return cached.PrivateProtocolUrl;
        }

        // Refresh cache if needed
        if (DateTime.UtcNow - _cacheLastRefresh > _cacheExpiry)
        {
            await RefreshCacheAsync();
        }

        if (_reverseCache.TryGetValue(publicUrl, out cached))
        {
            return cached.PrivateProtocolUrl;
        }

        return null;
    }

    /// <summary>
    /// Parses a private URL into its type and domain components.
    /// Example: "inspire://home.inspire" -> (Type: "inspire", Domain: "home")
    /// </summary>
    public static (string Type, string Domain)? ParsePrivateUrl(string privateUrl)
    {
        if (string.IsNullOrWhiteSpace(privateUrl)) return null;

        try
        {
            var colonIndex = privateUrl.IndexOf("://", StringComparison.Ordinal);
            if (colonIndex <= 0) return null;

            var scheme = privateUrl[..colonIndex];
            var rest = privateUrl[(colonIndex + 3)..];

            // Split the domain part (e.g., "home.inspire" -> ["home", "inspire"])
            var parts = rest.Split('.');
            if (parts.Length >= 2)
            {
                var domain = parts[0];
                var typeSuffix = parts[^1]; // Last part
                return (typeSuffix, domain);
            }
            else if (parts.Length == 1)
            {
                // Just domain, use scheme as type
                return (scheme, parts[0]);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error parsing private URL: {ex.Message}");
        }

        return null;
    }

    /// <summary>
    /// Gets all known web space types.
    /// </summary>
    public IReadOnlyCollection<string> GetKnownProtocols() => PrivateProtocols;

    private async Task RefreshCacheAsync()
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            // Query the DNS resolution cache view
            const string query = @"
                SELECT
                    ""PrivateProtocolURL"",
                    ""ShortPrivateURL"",
                    ""PublicURL"",
                    ""ThirdPartyOverrideURL"",
                    ""WebSpaceType"",
                    ""DomainName"",
                    ""Priority"",
                    COALESCE(""ThirdPartyOverrideURL"", ""PublicURL"") AS ""ResolvedURL""
                FROM ""DNS_ResolutionCache""
                WHERE ""IsActive"" = TRUE
                ORDER BY ""Priority"" ASC";

            await using var cmd = new NpgsqlCommand(query, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            _cache.Clear();
            _reverseCache.Clear();

            while (await reader.ReadAsync())
            {
                var result = new DnsResolutionResult
                {
                    PrivateProtocolUrl = reader.GetString(0),
                    ShortPrivateUrl = reader.IsDBNull(1) ? null : reader.GetString(1),
                    PublicUrl = reader.GetString(2),
                    ThirdPartyOverrideUrl = reader.IsDBNull(3) ? null : reader.GetString(3),
                    WebSpaceType = reader.GetString(4),
                    DomainName = reader.GetString(5),
                    Priority = reader.GetInt32(6),
                    ResolvedUrl = reader.GetString(7)
                };

                // Add to forward cache
                _cache[result.PrivateProtocolUrl] = result;
                if (!string.IsNullOrEmpty(result.ShortPrivateUrl))
                {
                    _cache[result.ShortPrivateUrl] = result;
                }

                // Add to reverse cache
                _reverseCache[result.PublicUrl] = result;
                if (!string.IsNullOrEmpty(result.ThirdPartyOverrideUrl))
                {
                    _reverseCache[result.ThirdPartyOverrideUrl] = result;
                }
            }

            _cacheLastRefresh = DateTime.UtcNow;
            System.Diagnostics.Debug.WriteLine($"WWBW DNS cache refreshed: {_cache.Count} entries");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error refreshing DNS cache: {ex.Message}");
            throw;
        }
    }

    private async Task<DnsResolutionResult?> ResolveByTypeAndDomainAsync(string type, string domain)
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string query = @"
                SELECT
                    ""PrivateProtocolURL"",
                    ""ShortPrivateURL"",
                    ""PublicURL"",
                    ""ThirdPartyOverrideURL"",
                    ""WebSpaceType"",
                    ""DomainName"",
                    ""Priority"",
                    COALESCE(""ThirdPartyOverrideURL"", ""PublicURL"") AS ""ResolvedURL""
                FROM ""DNS_ResolutionCache""
                WHERE (""WebSpaceType"" = @type OR ""WebSpaceTypeAbbrev"" = @type)
                  AND ""DomainName"" = @domain
                  AND ""IsActive"" = TRUE
                ORDER BY ""Priority"" ASC
                LIMIT 1";

            await using var cmd = new NpgsqlCommand(query, connection);
            cmd.Parameters.AddWithValue("@type", type);
            cmd.Parameters.AddWithValue("@domain", domain);

            await using var reader = await cmd.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                return new DnsResolutionResult
                {
                    PrivateProtocolUrl = reader.GetString(0),
                    ShortPrivateUrl = reader.IsDBNull(1) ? null : reader.GetString(1),
                    PublicUrl = reader.GetString(2),
                    ThirdPartyOverrideUrl = reader.IsDBNull(3) ? null : reader.GetString(3),
                    WebSpaceType = reader.GetString(4),
                    DomainName = reader.GetString(5),
                    Priority = reader.GetInt32(6),
                    ResolvedUrl = reader.GetString(7)
                };
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error resolving by type/domain: {ex.Message}");
        }

        return null;
    }

    /// <summary>
    /// Forces a cache refresh.
    /// </summary>
    public async Task RefreshAsync()
    {
        await RefreshCacheAsync();
    }

    public bool IsInitialized => _isInitialized;
    public int CacheCount => _cache.Count;
}

/// <summary>
/// Result of a DNS resolution lookup.
/// </summary>
public class DnsResolutionResult
{
    public required string PrivateProtocolUrl { get; init; }
    public string? ShortPrivateUrl { get; init; }
    public required string PublicUrl { get; init; }
    public string? ThirdPartyOverrideUrl { get; init; }
    public required string WebSpaceType { get; init; }
    public required string DomainName { get; init; }
    public int Priority { get; init; }
    public required string ResolvedUrl { get; init; }
}
