using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using JubileeBrowser.Shared.Models;

namespace JubileeBrowser.API.Services;

/// <summary>
/// JWT authentication service integrated with SSO database.
/// Handles login, token generation, refresh, and validation.
/// </summary>
public interface IJwtAuthenticationService
{
    Task<LoginResponse> AuthenticateAsync(LoginRequest request, string? ipAddress = null, string? userAgent = null);
    Task<RefreshTokenResponse> RefreshTokenAsync(string refreshToken, string? ipAddress = null);
    Task<bool> RevokeTokenAsync(string refreshToken, string reason = "user_logout");
    Task<bool> RevokeAllUserTokensAsync(Guid userId, string reason = "logout_all");
    ClaimsPrincipal? ValidateToken(string token);
    Task<UserInfo?> GetUserInfoAsync(Guid userId);
}

public class JwtAuthenticationService : IJwtAuthenticationService
{
    private readonly IRedisCacheService _cache;
    private readonly IEventBusService _eventBus;
    private readonly IConfiguration _configuration;
    private readonly ILogger<JwtAuthenticationService> _logger;
    private readonly string _connectionString;
    private readonly string _secretKey;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _accessTokenExpiryMinutes;
    private readonly int _refreshTokenExpiryDays;

    public JwtAuthenticationService(
        IRedisCacheService cache,
        IEventBusService eventBus,
        IConfiguration configuration,
        ILogger<JwtAuthenticationService> logger)
    {
        _cache = cache;
        _eventBus = eventBus;
        _configuration = configuration;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("PostgreSQL")
            ?? throw new InvalidOperationException("PostgreSQL connection string not configured");
        _secretKey = configuration["Jwt:SecretKey"]
            ?? throw new InvalidOperationException("JWT secret key not configured");
        _issuer = configuration["Jwt:Issuer"] ?? "JubileeBrowser.API";
        _audience = configuration["Jwt:Audience"] ?? "JubileeBrowser.Client";
        _accessTokenExpiryMinutes = configuration.GetValue<int>("Jwt:AccessTokenExpiryMinutes", 15);
        _refreshTokenExpiryDays = configuration.GetValue<int>("Jwt:RefreshTokenExpiryDays", 30);
    }

    /// <summary>
    /// Authenticates a user and returns JWT tokens.
    /// </summary>
    public async Task<LoginResponse> AuthenticateAsync(LoginRequest request, string? ipAddress = null, string? userAgent = null)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            // Use the SSO stored function for authentication
            await using var cmd = new NpgsqlCommand(@"
                SELECT * FROM sso_authenticate_user(@usernameOrEmail, @password, @ipAddress, @userAgent)", conn);

            cmd.Parameters.AddWithValue("usernameOrEmail", request.UsernameOrEmail);
            cmd.Parameters.AddWithValue("password", request.Password);
            cmd.Parameters.AddWithValue("ipAddress", (object?)ParseIpAddress(ipAddress) ?? DBNull.Value);
            cmd.Parameters.AddWithValue("userAgent", (object?)userAgent ?? DBNull.Value);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync() || reader.IsDBNull(0))
            {
                return new LoginResponse
                {
                    Success = false,
                    ErrorMessage = "Invalid username/email or password"
                };
            }

            var userId = reader.GetGuid(0);
            var username = reader.GetString(1);
            var email = reader.GetString(2);
            var displayName = reader.IsDBNull(3) ? username : reader.GetString(3);
            var rolesJson = reader.GetString(4);
            var requires2fa = reader.GetBoolean(5);
            var requirePasswordChange = reader.GetBoolean(6);

            await reader.CloseAsync();

            // Check if 2FA is required
            if (requires2fa && string.IsNullOrEmpty(request.TwoFactorCode))
            {
                return new LoginResponse
                {
                    Success = false,
                    RequiresTwoFactor = true,
                    ErrorMessage = "Two-factor authentication required"
                };
            }

            // TODO: Validate 2FA code if provided

            // Get user roles and permissions
            var roles = await GetUserRolesAsync(conn, userId);
            var permissions = await GetUserPermissionsAsync(conn, userId);

            // Generate tokens
            var accessToken = GenerateAccessToken(userId, username, email, roles);
            var refreshToken = GenerateRefreshToken();
            var refreshTokenHash = HashToken(refreshToken);

            // Store refresh token in database
            var refreshTokenExpiry = DateTime.UtcNow.AddDays(_refreshTokenExpiryDays);
            await StoreRefreshTokenAsync(conn, userId, refreshTokenHash, refreshTokenExpiry, ipAddress, userAgent);

            // Cache user session
            var userInfo = new UserInfo
            {
                UserId = userId,
                Username = username,
                Email = email,
                DisplayName = displayName,
                Roles = roles,
                Permissions = permissions
            };
            await _cache.SetAsync(CacheKeys.UserSession(userId), userInfo,
                TimeSpan.FromMinutes(_configuration.GetValue<int>("Redis:SessionCacheTtlMinutes", 120)));

            // Publish login event
            await _eventBus.PublishAsync(EventTypes.UserLoggedIn, new { username, ipAddress }, userId.ToString(), "User");

            return new LoginResponse
            {
                Success = true,
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                AccessTokenExpiry = DateTime.UtcNow.AddMinutes(_accessTokenExpiryMinutes),
                RefreshTokenExpiry = refreshTokenExpiry,
                User = userInfo,
                RequiresPasswordChange = requirePasswordChange
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Authentication failed for {UsernameOrEmail}", request.UsernameOrEmail);
            return new LoginResponse
            {
                Success = false,
                ErrorMessage = "Authentication failed"
            };
        }
    }

    /// <summary>
    /// Refreshes an access token using a refresh token.
    /// </summary>
    public async Task<RefreshTokenResponse> RefreshTokenAsync(string refreshToken, string? ipAddress = null)
    {
        try
        {
            var tokenHash = HashToken(refreshToken);

            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            // Validate refresh token using SSO function
            await using var cmd = new NpgsqlCommand(@"
                SELECT * FROM sso_validate_refresh_token(@tokenHash, @ipAddress)", conn);

            cmd.Parameters.AddWithValue("tokenHash", tokenHash);
            cmd.Parameters.AddWithValue("ipAddress", (object?)ParseIpAddress(ipAddress) ?? DBNull.Value);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return new RefreshTokenResponse
                {
                    Success = false,
                    ErrorMessage = "Invalid refresh token"
                };
            }

            var tokenId = reader.IsDBNull(0) ? (Guid?)null : reader.GetGuid(0);
            var userId = reader.IsDBNull(1) ? (Guid?)null : reader.GetGuid(1);
            var tokenFamily = reader.IsDBNull(2) ? (Guid?)null : reader.GetGuid(2);
            var isValid = reader.GetBoolean(3);
            var isReuseAttack = reader.GetBoolean(4);

            await reader.CloseAsync();

            if (isReuseAttack)
            {
                _logger.LogWarning("Token reuse attack detected for user {UserId}", userId);
                return new RefreshTokenResponse
                {
                    Success = false,
                    ErrorMessage = "Security violation detected. Please log in again."
                };
            }

            if (!isValid || !userId.HasValue)
            {
                return new RefreshTokenResponse
                {
                    Success = false,
                    ErrorMessage = "Invalid or expired refresh token"
                };
            }

            // Get user info
            var userInfo = await GetUserInfoAsync(userId.Value);
            if (userInfo == null)
            {
                return new RefreshTokenResponse
                {
                    Success = false,
                    ErrorMessage = "User not found"
                };
            }

            // Generate new tokens (token rotation)
            var newAccessToken = GenerateAccessToken(userInfo.UserId, userInfo.Username, userInfo.Email, userInfo.Roles);
            var newRefreshToken = GenerateRefreshToken();
            var newRefreshTokenHash = HashToken(newRefreshToken);
            var newRefreshTokenExpiry = DateTime.UtcNow.AddDays(_refreshTokenExpiryDays);

            // Store new refresh token and revoke old one
            await using var storeCmd = new NpgsqlCommand(@"
                SELECT sso_create_refresh_token(@userId, @tokenHash, @expiresAt, @ipAddress, NULL, @tokenFamily, @replacedTokenId)", conn);

            storeCmd.Parameters.AddWithValue("userId", userId.Value);
            storeCmd.Parameters.AddWithValue("tokenHash", newRefreshTokenHash);
            storeCmd.Parameters.AddWithValue("expiresAt", newRefreshTokenExpiry);
            storeCmd.Parameters.AddWithValue("ipAddress", (object?)ParseIpAddress(ipAddress) ?? DBNull.Value);
            storeCmd.Parameters.AddWithValue("tokenFamily", tokenFamily ?? Guid.NewGuid());
            storeCmd.Parameters.AddWithValue("replacedTokenId", tokenId ?? (object)DBNull.Value);

            await storeCmd.ExecuteNonQueryAsync();

            return new RefreshTokenResponse
            {
                Success = true,
                AccessToken = newAccessToken,
                RefreshToken = newRefreshToken,
                AccessTokenExpiry = DateTime.UtcNow.AddMinutes(_accessTokenExpiryMinutes)
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh failed");
            return new RefreshTokenResponse
            {
                Success = false,
                ErrorMessage = "Token refresh failed"
            };
        }
    }

    /// <summary>
    /// Revokes a refresh token.
    /// </summary>
    public async Task<bool> RevokeTokenAsync(string refreshToken, string reason = "user_logout")
    {
        try
        {
            var tokenHash = HashToken(refreshToken);

            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand(@"
                SELECT sso_revoke_refresh_token(@tokenHash, @reason)", conn);

            cmd.Parameters.AddWithValue("tokenHash", tokenHash);
            cmd.Parameters.AddWithValue("reason", reason);

            var result = await cmd.ExecuteScalarAsync();
            return result is bool success && success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to revoke token");
            return false;
        }
    }

    /// <summary>
    /// Revokes all refresh tokens for a user.
    /// </summary>
    public async Task<bool> RevokeAllUserTokensAsync(Guid userId, string reason = "logout_all")
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand(@"
                SELECT sso_revoke_all_user_tokens(@userId, @reason)", conn);

            cmd.Parameters.AddWithValue("userId", userId);
            cmd.Parameters.AddWithValue("reason", reason);

            await cmd.ExecuteNonQueryAsync();

            // Clear cached session
            await _cache.RemoveAsync(CacheKeys.UserSession(userId));
            await _cache.RemoveAsync(CacheKeys.UserPermissions(userId));

            // Publish logout event
            await _eventBus.PublishAsync(EventTypes.UserLoggedOut, new { reason }, userId.ToString(), "User");

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to revoke all tokens for user {UserId}", userId);
            return false;
        }
    }

    /// <summary>
    /// Validates a JWT token and returns the claims principal.
    /// </summary>
    public ClaimsPrincipal? ValidateToken(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_secretKey);

            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _issuer,
                ValidAudience = _audience,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ClockSkew = TimeSpan.Zero
            };

            var principal = tokenHandler.ValidateToken(token, validationParameters, out _);
            return principal;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Token validation failed");
            return null;
        }
    }

    /// <summary>
    /// Gets user info by ID.
    /// </summary>
    public async Task<UserInfo?> GetUserInfoAsync(Guid userId)
    {
        // Try cache first
        var cached = await _cache.GetAsync<UserInfo>(CacheKeys.UserSession(userId));
        if (cached != null) return cached;

        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand(@"
                SELECT ""UserID"", ""Username"", ""Email"", ""DisplayName"", ""ProfileImageURL""
                FROM ""Users""
                WHERE ""UserID"" = @userId AND ""IsActive"" = TRUE", conn);

            cmd.Parameters.AddWithValue("userId", userId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                return null;
            }

            var userInfo = new UserInfo
            {
                UserId = reader.GetGuid(0),
                Username = reader.GetString(1),
                Email = reader.GetString(2),
                DisplayName = reader.IsDBNull(3) ? reader.GetString(1) : reader.GetString(3),
                ProfileImageUrl = reader.IsDBNull(4) ? null : reader.GetString(4)
            };

            await reader.CloseAsync();

            userInfo.Roles = await GetUserRolesAsync(conn, userId);
            userInfo.Permissions = await GetUserPermissionsAsync(conn, userId);

            // Cache for future requests
            await _cache.SetAsync(CacheKeys.UserSession(userId), userInfo,
                TimeSpan.FromMinutes(_configuration.GetValue<int>("Redis:SessionCacheTtlMinutes", 120)));

            return userInfo;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get user info for {UserId}", userId);
            return null;
        }
    }

    private string GenerateAccessToken(Guid userId, string username, string email, List<RoleInfo> roles)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, username),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        // Add role claims
        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role.RoleName));
        }

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_accessTokenExpiryMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    private static string HashToken(string token)
    {
        using var sha256 = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(token);
        var hash = sha256.ComputeHash(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static System.Net.IPAddress? ParseIpAddress(string? ipAddress)
    {
        if (string.IsNullOrEmpty(ipAddress)) return null;
        return System.Net.IPAddress.TryParse(ipAddress, out var ip) ? ip : null;
    }

    private async Task<List<RoleInfo>> GetUserRolesAsync(NpgsqlConnection conn, Guid userId)
    {
        var roles = new List<RoleInfo>();

        await using var cmd = new NpgsqlCommand(@"
            SELECT r.""RoleID"", r.""RoleName"", r.""DisplayName""
            FROM ""UserRoleAssignments"" ura
            JOIN ""UserRoles"" r ON r.""RoleID"" = ura.""RoleID""
            WHERE ura.""UserID"" = @userId
              AND r.""IsActive"" = TRUE
              AND (ura.""ValidUntil"" IS NULL OR ura.""ValidUntil"" > CURRENT_TIMESTAMP)", conn);

        cmd.Parameters.AddWithValue("userId", userId);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            roles.Add(new RoleInfo
            {
                RoleId = reader.GetGuid(0),
                RoleName = reader.GetString(1),
                DisplayName = reader.GetString(2)
            });
        }

        return roles;
    }

    private async Task<List<string>> GetUserPermissionsAsync(NpgsqlConnection conn, Guid userId)
    {
        var permissions = new List<string>();

        await using var cmd = new NpgsqlCommand(@"
            SELECT permission_name FROM sso_get_user_permissions(@userId)", conn);

        cmd.Parameters.AddWithValue("userId", userId);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            permissions.Add(reader.GetString(0));
        }

        return permissions;
    }

    private async Task StoreRefreshTokenAsync(NpgsqlConnection conn, Guid userId, string tokenHash,
        DateTime expiresAt, string? ipAddress, string? userAgent)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT sso_create_refresh_token(@userId, @tokenHash, @expiresAt, @ipAddress, @userAgent, NULL, NULL)", conn);

        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("tokenHash", tokenHash);
        cmd.Parameters.AddWithValue("expiresAt", expiresAt);
        cmd.Parameters.AddWithValue("ipAddress", (object?)ParseIpAddress(ipAddress) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("userAgent", (object?)userAgent ?? DBNull.Value);

        await cmd.ExecuteNonQueryAsync();
    }
}
