using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace JubileeBrowser.Services;

/// <summary>
/// HTTP client for communicating with the Jubilee Browser API.
/// Handles authentication, token refresh, and API calls.
/// </summary>
public interface IApiClientService
{
    Task<ApiResponse<T>> GetAsync<T>(string endpoint) where T : class;
    Task<ApiResponse<T>> PostAsync<T>(string endpoint, object? data = null) where T : class;
    Task<ApiResponse<T>> PutAsync<T>(string endpoint, object? data = null) where T : class;
    Task<ApiResponse<T>> DeleteAsync<T>(string endpoint) where T : class;
    Task<bool> LoginAsync(string usernameOrEmail, string password);
    Task LogoutAsync();
    Task<bool> RefreshTokenAsync();
    bool IsAuthenticated { get; }
    UserSession? CurrentSession { get; }
    event EventHandler<AuthenticationStateChangedEventArgs>? AuthenticationStateChanged;
}

public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? ErrorMessage { get; set; }
    public int StatusCode { get; set; }
}

public class UserSession
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public List<string> Roles { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
    public DateTime AccessTokenExpiry { get; set; }
    public DateTime RefreshTokenExpiry { get; set; }
}

public class AuthenticationStateChangedEventArgs : EventArgs
{
    public bool IsAuthenticated { get; set; }
    public UserSession? Session { get; set; }
}

public class ApiClientService : IApiClientService, IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly ILocalCacheService _cache;
    private readonly JsonSerializerOptions _jsonOptions;
    private string? _accessToken;
    private string? _refreshToken;
    private UserSession? _currentSession;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    public bool IsAuthenticated => _currentSession != null && DateTime.UtcNow < _currentSession.RefreshTokenExpiry;
    public UserSession? CurrentSession => _currentSession;
    public event EventHandler<AuthenticationStateChangedEventArgs>? AuthenticationStateChanged;

    public ApiClientService(ILocalCacheService cache, string baseUrl = "https://localhost:5001")
    {
        _cache = cache;
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(baseUrl),
            Timeout = TimeSpan.FromSeconds(30)
        };
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        // Try to restore session from cache
        RestoreSession();
    }

    private void RestoreSession()
    {
        _accessToken = _cache.Get<string>(LocalCacheKeys.AccessToken);
        _refreshToken = _cache.Get<string>(LocalCacheKeys.RefreshToken);
        _currentSession = _cache.Get<UserSession>(LocalCacheKeys.UserSession);

        if (_accessToken != null)
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
        }
    }

    public async Task<bool> LoginAsync(string usernameOrEmail, string password)
    {
        try
        {
            var response = await PostAsync<LoginResponse>("api/auth/login", new
            {
                usernameOrEmail,
                password
            });

            if (!response.Success || response.Data == null || !response.Data.Success)
            {
                return false;
            }

            var loginResponse = response.Data;

            // Store tokens
            _accessToken = loginResponse.AccessToken;
            _refreshToken = loginResponse.RefreshToken;
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            // Create session
            _currentSession = new UserSession
            {
                UserId = loginResponse.User?.UserId ?? Guid.Empty,
                Username = loginResponse.User?.Username ?? string.Empty,
                Email = loginResponse.User?.Email ?? string.Empty,
                DisplayName = loginResponse.User?.DisplayName,
                Roles = loginResponse.User?.Roles?.Select(r => r.RoleName).ToList() ?? new(),
                Permissions = loginResponse.User?.Permissions ?? new(),
                AccessTokenExpiry = loginResponse.AccessTokenExpiry ?? DateTime.UtcNow,
                RefreshTokenExpiry = loginResponse.RefreshTokenExpiry ?? DateTime.UtcNow
            };

            // Cache session data
            _cache.Set(LocalCacheKeys.AccessToken, _accessToken!, TimeSpan.FromMinutes(15));
            _cache.Set(LocalCacheKeys.RefreshToken, _refreshToken!, TimeSpan.FromDays(30));
            _cache.Set(LocalCacheKeys.UserSession, _currentSession, TimeSpan.FromDays(30));

            // Notify listeners
            AuthenticationStateChanged?.Invoke(this, new AuthenticationStateChangedEventArgs
            {
                IsAuthenticated = true,
                Session = _currentSession
            });

            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public async Task LogoutAsync()
    {
        try
        {
            if (!string.IsNullOrEmpty(_refreshToken))
            {
                await PostAsync<object>("api/auth/logout", new { refreshToken = _refreshToken });
            }
        }
        finally
        {
            ClearSession();
        }
    }

    private void ClearSession()
    {
        _accessToken = null;
        _refreshToken = null;
        _currentSession = null;
        _httpClient.DefaultRequestHeaders.Authorization = null;

        _cache.Remove(LocalCacheKeys.AccessToken);
        _cache.Remove(LocalCacheKeys.RefreshToken);
        _cache.Remove(LocalCacheKeys.UserSession);

        AuthenticationStateChanged?.Invoke(this, new AuthenticationStateChangedEventArgs
        {
            IsAuthenticated = false,
            Session = null
        });
    }

    public async Task<bool> RefreshTokenAsync()
    {
        if (string.IsNullOrEmpty(_refreshToken))
        {
            return false;
        }

        await _refreshLock.WaitAsync();
        try
        {
            // Check if another thread already refreshed
            if (_currentSession != null && DateTime.UtcNow < _currentSession.AccessTokenExpiry.AddMinutes(-1))
            {
                return true;
            }

            var response = await SendAsync<RefreshTokenResponse>(HttpMethod.Post, "api/auth/refresh",
                new { refreshToken = _refreshToken });

            if (!response.Success || response.Data == null || !response.Data.Success)
            {
                ClearSession();
                return false;
            }

            _accessToken = response.Data.AccessToken;
            _refreshToken = response.Data.RefreshToken;
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);

            if (_currentSession != null)
            {
                _currentSession.AccessTokenExpiry = response.Data.AccessTokenExpiry ?? DateTime.UtcNow;
            }

            // Update cache
            _cache.Set(LocalCacheKeys.AccessToken, _accessToken!, TimeSpan.FromMinutes(15));
            _cache.Set(LocalCacheKeys.RefreshToken, _refreshToken!, TimeSpan.FromDays(30));

            return true;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public async Task<ApiResponse<T>> GetAsync<T>(string endpoint) where T : class
    {
        return await SendWithRetryAsync<T>(HttpMethod.Get, endpoint);
    }

    public async Task<ApiResponse<T>> PostAsync<T>(string endpoint, object? data = null) where T : class
    {
        return await SendWithRetryAsync<T>(HttpMethod.Post, endpoint, data);
    }

    public async Task<ApiResponse<T>> PutAsync<T>(string endpoint, object? data = null) where T : class
    {
        return await SendWithRetryAsync<T>(HttpMethod.Put, endpoint, data);
    }

    public async Task<ApiResponse<T>> DeleteAsync<T>(string endpoint) where T : class
    {
        return await SendWithRetryAsync<T>(HttpMethod.Delete, endpoint);
    }

    private async Task<ApiResponse<T>> SendWithRetryAsync<T>(HttpMethod method, string endpoint, object? data = null) where T : class
    {
        var response = await SendAsync<T>(method, endpoint, data);

        // If unauthorized and we have a refresh token, try to refresh and retry
        if (response.StatusCode == 401 && !string.IsNullOrEmpty(_refreshToken))
        {
            var refreshed = await RefreshTokenAsync();
            if (refreshed)
            {
                response = await SendAsync<T>(method, endpoint, data);
            }
        }

        return response;
    }

    private async Task<ApiResponse<T>> SendAsync<T>(HttpMethod method, string endpoint, object? data = null) where T : class
    {
        try
        {
            using var request = new HttpRequestMessage(method, endpoint);

            if (data != null)
            {
                var json = JsonSerializer.Serialize(data, _jsonOptions);
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
            }

            using var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var result = string.IsNullOrEmpty(content)
                    ? default
                    : JsonSerializer.Deserialize<T>(content, _jsonOptions);

                return new ApiResponse<T>
                {
                    Success = true,
                    Data = result,
                    StatusCode = (int)response.StatusCode
                };
            }

            return new ApiResponse<T>
            {
                Success = false,
                ErrorMessage = content,
                StatusCode = (int)response.StatusCode
            };
        }
        catch (Exception ex)
        {
            return new ApiResponse<T>
            {
                Success = false,
                ErrorMessage = ex.Message,
                StatusCode = 0
            };
        }
    }

    public void Dispose()
    {
        _httpClient.Dispose();
        _refreshLock.Dispose();
    }
}

// Response DTOs (matching the API models)
public class LoginResponse
{
    public bool Success { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? AccessTokenExpiry { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }
    public UserInfo? User { get; set; }
    public string? ErrorMessage { get; set; }
    public bool RequiresTwoFactor { get; set; }
    public bool RequiresPasswordChange { get; set; }
}

public class RefreshTokenResponse
{
    public bool Success { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? AccessTokenExpiry { get; set; }
    public string? ErrorMessage { get; set; }
}

public class UserInfo
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? ProfileImageUrl { get; set; }
    public List<RoleInfo> Roles { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
}

public class RoleInfo
{
    public Guid RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}
