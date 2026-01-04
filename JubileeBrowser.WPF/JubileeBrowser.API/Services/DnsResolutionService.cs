using Npgsql;
using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Services;

/// <summary>
/// DNS resolution service with Redis cache-aside pattern.
/// Handles Inspire protocol and webspace URL resolution.
/// </summary>
public interface IDnsResolutionService
{
    Task<DnsResolutionResult> ResolveAsync(string privateUrl);
    Task<DnsRecord?> GetDnsRecordByIdAsync(int dnsId);
    Task<List<DnsRecord>> GetDnsRecordsByTypeAsync(string typeName);
    Task<List<WebSpaceType>> GetAllWebSpaceTypesAsync();
    Task InvalidateCacheAsync(string? privateUrl = null, int? dnsId = null);
}

public class DnsResolutionService : IDnsResolutionService
{
    private readonly IRedisCacheService _cache;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DnsResolutionService> _logger;
    private readonly string _connectionString;
    private readonly TimeSpan _dnsCacheTtl;

    public DnsResolutionService(
        IRedisCacheService cache,
        IConfiguration configuration,
        ILogger<DnsResolutionService> logger)
    {
        _cache = cache;
        _configuration = configuration;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("PostgreSQL")
            ?? throw new InvalidOperationException("PostgreSQL connection string not configured");
        _dnsCacheTtl = TimeSpan.FromMinutes(
            configuration.GetValue<int>("Redis:DnsCacheTtlMinutes", 30));
    }

    /// <summary>
    /// Resolves a private protocol URL (e.g., inspire://home.inspire) to its public URL.
    /// Uses cache-aside pattern: check Redis first, then PostgreSQL.
    /// </summary>
    public async Task<DnsResolutionResult> ResolveAsync(string privateUrl)
    {
        if (string.IsNullOrWhiteSpace(privateUrl))
        {
            return new DnsResolutionResult
            {
                Success = false,
                ErrorMessage = "Private URL cannot be empty"
            };
        }

        var normalizedUrl = privateUrl.Trim().ToLowerInvariant();
        var cacheKey = CacheKeys.DnsRecord(normalizedUrl);

        try
        {
            // Try cache first (cache-aside pattern)
            var cached = await _cache.GetAsync<DnsResolutionResult>(cacheKey);
            if (cached != null)
            {
                cached.FromCache = true;
                return cached;
            }

            // Cache miss - query PostgreSQL
            var result = await ResolveFromDatabaseAsync(normalizedUrl);

            // Cache the result (even failures to prevent repeated queries)
            if (result.Success || result.ErrorMessage == "DNS record not found")
            {
                await _cache.SetAsync(cacheKey, result, _dnsCacheTtl);
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolving DNS for: {PrivateUrl}", privateUrl);
            return new DnsResolutionResult
            {
                Success = false,
                ErrorMessage = "Internal error during DNS resolution"
            };
        }
    }

    private async Task<DnsResolutionResult> ResolveFromDatabaseAsync(string privateUrl)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        // Use the stored function for resolution
        await using var cmd = new NpgsqlCommand(@"
            SELECT
                d.""PublicURL"",
                d.""ThirdPartyOverrideURL"",
                d.""PrivateProtocolURL"",
                d.""DomainName"",
                wt.""FullTypeName""
            FROM ""DNS"" d
            JOIN ""WebSpaceTypes"" wt ON wt.""Type_ID"" = d.""Type_ID""
            WHERE LOWER(d.""PrivateProtocolURL"") = @privateUrl
              AND d.""IsActive"" = TRUE
              AND wt.""IsActive"" = TRUE
            ORDER BY d.""Priority"" ASC
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("privateUrl", privateUrl);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            var publicUrl = reader.GetString(0);
            var overrideUrl = reader.IsDBNull(1) ? null : reader.GetString(1);
            var resolvedUrl = !string.IsNullOrEmpty(overrideUrl) ? overrideUrl : publicUrl;

            return new DnsResolutionResult
            {
                Success = true,
                ResolvedUrl = resolvedUrl,
                PrivateUrl = reader.GetString(2),
                DomainName = reader.GetString(3),
                WebSpaceType = reader.GetString(4),
                FromCache = false
            };
        }

        return new DnsResolutionResult
        {
            Success = false,
            PrivateUrl = privateUrl,
            ErrorMessage = "DNS record not found"
        };
    }

    public async Task<DnsRecord?> GetDnsRecordByIdAsync(int dnsId)
    {
        var cacheKey = CacheKeys.DnsRecordById(dnsId);

        return await _cache.GetOrSetAsync(cacheKey, async () =>
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand(@"
                SELECT
                    d.""DNS_ID"", d.""Type_ID"", d.""DomainName"",
                    d.""PrivateProtocolURL"", d.""PublicRelativePath"", d.""PublicURL"",
                    d.""ThirdPartyOverrideURL"", d.""IsActive"", d.""Priority"",
                    d.""Description"", d.""CreatedAt"", d.""UpdatedAt"",
                    wt.""FullTypeName""
                FROM ""DNS"" d
                JOIN ""WebSpaceTypes"" wt ON wt.""Type_ID"" = d.""Type_ID""
                WHERE d.""DNS_ID"" = @dnsId", conn);

            cmd.Parameters.AddWithValue("dnsId", dnsId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return MapDnsRecord(reader);
            }
            return null;
        }, _dnsCacheTtl);
    }

    public async Task<List<DnsRecord>> GetDnsRecordsByTypeAsync(string typeName)
    {
        var cacheKey = CacheKeys.DnsByType(typeName);

        var cached = await _cache.GetAsync<List<DnsRecord>>(cacheKey);
        if (cached != null) return cached;

        var records = new List<DnsRecord>();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT
                d.""DNS_ID"", d.""Type_ID"", d.""DomainName"",
                d.""PrivateProtocolURL"", d.""PublicRelativePath"", d.""PublicURL"",
                d.""ThirdPartyOverrideURL"", d.""IsActive"", d.""Priority"",
                d.""Description"", d.""CreatedAt"", d.""UpdatedAt"",
                wt.""FullTypeName""
            FROM ""DNS"" d
            JOIN ""WebSpaceTypes"" wt ON wt.""Type_ID"" = d.""Type_ID""
            WHERE LOWER(wt.""FullTypeName"") = @typeName
              AND d.""IsActive"" = TRUE
            ORDER BY d.""DomainName""", conn);

        cmd.Parameters.AddWithValue("typeName", typeName.ToLowerInvariant());

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            records.Add(MapDnsRecord(reader));
        }

        if (records.Any())
        {
            await _cache.SetAsync(cacheKey, records, _dnsCacheTtl);
        }

        return records;
    }

    public async Task<List<WebSpaceType>> GetAllWebSpaceTypesAsync()
    {
        var cacheKey = CacheKeys.AllWebSpaceTypes;

        var cached = await _cache.GetAsync<List<WebSpaceType>>(cacheKey);
        if (cached != null) return cached;

        var types = new List<WebSpaceType>();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT ""Type_ID"", ""FullTypeName"", ""AbbreviatedName"",
                   ""Description"", ""IsActive"", ""CreatedAt"", ""UpdatedAt""
            FROM ""WebSpaceTypes""
            WHERE ""IsActive"" = TRUE
            ORDER BY ""FullTypeName""", conn);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            types.Add(new WebSpaceType
            {
                TypeId = reader.GetInt32(0),
                FullTypeName = reader.GetString(1),
                AbbreviatedName = reader.IsDBNull(2) ? null : reader.GetString(2).Trim(),
                Description = reader.IsDBNull(3) ? null : reader.GetString(3),
                IsActive = reader.GetBoolean(4),
                CreatedAt = reader.GetDateTime(5),
                UpdatedAt = reader.GetDateTime(6)
            });
        }

        await _cache.SetAsync(cacheKey, types, _dnsCacheTtl);
        return types;
    }

    /// <summary>
    /// Invalidates DNS cache entries.
    /// </summary>
    public async Task InvalidateCacheAsync(string? privateUrl = null, int? dnsId = null)
    {
        if (!string.IsNullOrEmpty(privateUrl))
        {
            await _cache.RemoveAsync(CacheKeys.DnsRecord(privateUrl));
        }

        if (dnsId.HasValue)
        {
            await _cache.RemoveAsync(CacheKeys.DnsRecordById(dnsId.Value));
        }

        // Also invalidate type-based caches
        await _cache.RemoveByPatternAsync("dns:type:*");
        await _cache.RemoveAsync(CacheKeys.AllWebSpaceTypes);

        // Publish cache invalidation event
        await _cache.PublishAsync("events", new PubSubMessage
        {
            EventType = EventTypes.CacheInvalidated,
            EntityType = "DNS",
            EntityId = privateUrl ?? dnsId?.ToString(),
            SourceService = "DnsResolutionService"
        });

        _logger.LogInformation("DNS cache invalidated for: {PrivateUrl}, ID: {DnsId}", privateUrl, dnsId);
    }

    private static DnsRecord MapDnsRecord(NpgsqlDataReader reader)
    {
        return new DnsRecord
        {
            DnsId = reader.GetInt32(0),
            TypeId = reader.GetInt32(1),
            DomainName = reader.GetString(2),
            PrivateProtocolUrl = reader.GetString(3),
            PublicRelativePath = reader.GetString(4),
            PublicUrl = reader.GetString(5),
            ThirdPartyOverrideUrl = reader.IsDBNull(6) ? null : reader.GetString(6),
            IsActive = reader.GetBoolean(7),
            Priority = reader.GetInt32(8),
            Description = reader.IsDBNull(9) ? null : reader.GetString(9),
            CreatedAt = reader.GetDateTime(10),
            UpdatedAt = reader.GetDateTime(11),
            WebSpaceTypeName = reader.GetString(12)
        };
    }
}
