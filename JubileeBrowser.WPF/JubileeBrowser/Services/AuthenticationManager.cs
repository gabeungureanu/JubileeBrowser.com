using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using JubileeBrowser.Models;

namespace JubileeBrowser.Services;

public class AuthenticationManager
{
    private const string AuthEndpoint = "https://auth.jubileebrowser.com";
    private const int TokenRefreshBufferMinutes = 5;

    private readonly SecureTokenStorage _tokenStorage;
    private readonly HttpClient _httpClient;

    private AuthSession _session = new();
    private System.Timers.Timer? _tokenRefreshTimer;

    public event EventHandler<AuthSession>? SessionChanged;
    public event EventHandler<ParticipationFeature>? SignInRequired;

    public AuthSession Session => _session;

    public AuthenticationManager()
    {
        _tokenStorage = new SecureTokenStorage();
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(AuthEndpoint)
        };
    }

    public async Task InitializeAsync()
    {
        try
        {
            var tokens = await _tokenStorage.LoadTokensAsync();
            if (tokens != null && !IsTokenExpired(tokens))
            {
                await RefreshSessionAsync(tokens);
            }
            else if (tokens != null && !string.IsNullOrEmpty(tokens.RefreshToken))
            {
                await RefreshTokenAsync(tokens.RefreshToken);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error initializing auth: {ex.Message}");
            _session = new AuthSession { State = AuthenticationState.SignedOut };
        }
    }

    public async Task<AuthSession> SignInAsync(string email, string? password = null)
    {
        try
        {
            _session.State = AuthenticationState.SigningIn;
            OnSessionChanged();

            var request = new
            {
                email,
                password,
                grant_type = password == null ? "magic_link" : "password"
            };

            var response = await _httpClient.PostAsync("/oauth/token",
                new StringContent(JsonConvert.SerializeObject(request), Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                throw new Exception($"Authentication failed: {error}");
            }

            var content = await response.Content.ReadAsStringAsync();
            var tokens = JsonConvert.DeserializeObject<TokenSet>(content);

            if (tokens != null)
            {
                await _tokenStorage.SaveTokensAsync(tokens);
                await RefreshSessionAsync(tokens);
            }

            return _session;
        }
        catch (Exception ex)
        {
            _session.State = AuthenticationState.Error;
            _session.LastError = ex.Message;
            OnSessionChanged();
            throw;
        }
    }

    public async Task SignOutAsync()
    {
        try
        {
            var tokens = await _tokenStorage.LoadTokensAsync();
            if (tokens != null)
            {
                // Revoke token on server
                _httpClient.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue("Bearer", tokens.AccessToken);

                await _httpClient.PostAsync("/oauth/revoke", null);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error revoking token: {ex.Message}");
        }
        finally
        {
            await _tokenStorage.ClearTokensAsync();
            _session = new AuthSession { State = AuthenticationState.SignedOut };
            StopTokenRefreshTimer();
            OnSessionChanged();
        }
    }

    public async Task<bool> RefreshTokenAsync(string? refreshToken = null)
    {
        try
        {
            if (string.IsNullOrEmpty(refreshToken))
            {
                var tokens = await _tokenStorage.LoadTokensAsync();
                refreshToken = tokens?.RefreshToken;
            }

            if (string.IsNullOrEmpty(refreshToken))
            {
                _session.State = AuthenticationState.SignedOut;
                OnSessionChanged();
                return false;
            }

            var request = new
            {
                grant_type = "refresh_token",
                refresh_token = refreshToken
            };

            var response = await _httpClient.PostAsync("/oauth/token",
                new StringContent(JsonConvert.SerializeObject(request), Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode)
            {
                _session.State = AuthenticationState.TokenExpired;
                OnSessionChanged();
                return false;
            }

            var content = await response.Content.ReadAsStringAsync();
            var newTokens = JsonConvert.DeserializeObject<TokenSet>(content);

            if (newTokens != null)
            {
                await _tokenStorage.SaveTokensAsync(newTokens);
                await RefreshSessionAsync(newTokens);
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error refreshing token: {ex.Message}");
            _session.State = AuthenticationState.Error;
            _session.LastError = ex.Message;
            OnSessionChanged();
            return false;
        }
    }

    private async Task RefreshSessionAsync(TokenSet tokens)
    {
        try
        {
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", tokens.AccessToken);

            var response = await _httpClient.GetAsync("/userinfo");
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var profile = JsonConvert.DeserializeObject<JubileeUserProfile>(content);

                _session = new AuthSession
                {
                    State = AuthenticationState.SignedIn,
                    Profile = profile
                };

                StartTokenRefreshTimer(tokens);
                OnSessionChanged();
            }
            else
            {
                _session.State = AuthenticationState.TokenExpired;
                OnSessionChanged();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error refreshing session: {ex.Message}");
            _session.State = AuthenticationState.Error;
            _session.LastError = ex.Message;
            OnSessionChanged();
        }
    }

    private void StartTokenRefreshTimer(TokenSet tokens)
    {
        StopTokenRefreshTimer();

        var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(tokens.ExpiresAt);
        var refreshTime = expiresAt.AddMinutes(-TokenRefreshBufferMinutes);
        var delay = refreshTime - DateTimeOffset.UtcNow;

        if (delay.TotalMilliseconds <= 0)
        {
            _ = RefreshTokenAsync(tokens.RefreshToken);
            return;
        }

        _tokenRefreshTimer = new System.Timers.Timer(delay.TotalMilliseconds);
        _tokenRefreshTimer.Elapsed += async (s, e) =>
        {
            _tokenRefreshTimer?.Stop();
            await RefreshTokenAsync(tokens.RefreshToken);
        };
        _tokenRefreshTimer.AutoReset = false;
        _tokenRefreshTimer.Start();
    }

    private void StopTokenRefreshTimer()
    {
        _tokenRefreshTimer?.Stop();
        _tokenRefreshTimer?.Dispose();
        _tokenRefreshTimer = null;
    }

    private static bool IsTokenExpired(TokenSet tokens)
    {
        return DateTimeOffset.FromUnixTimeMilliseconds(tokens.ExpiresAt) <= DateTimeOffset.UtcNow;
    }

    public PermissionCheckResult CheckPermission(ParticipationFeature feature)
    {
        if (!_session.IsAuthenticated)
        {
            return new PermissionCheckResult
            {
                Allowed = false,
                RequiresSignIn = true,
                Reason = "Sign in required"
            };
        }

        if (_session.Profile?.AccountStatus != AccountStatus.Active)
        {
            return new PermissionCheckResult
            {
                Allowed = false,
                RequiresSignIn = false,
                Reason = "Account not active"
            };
        }

        return new PermissionCheckResult { Allowed = true };
    }

    public void RequestSignIn(ParticipationFeature feature)
    {
        SignInRequired?.Invoke(this, feature);
    }

    private void OnSessionChanged()
    {
        SessionChanged?.Invoke(this, _session);
    }
}

public class SecureTokenStorage
{
    private readonly string _tokenPath;

    public SecureTokenStorage()
    {
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileeBrowser"
        );
        Directory.CreateDirectory(appDataPath);
        _tokenPath = Path.Combine(appDataPath, "tokens.dat");
    }

    public async Task<TokenSet?> LoadTokensAsync()
    {
        try
        {
            if (!File.Exists(_tokenPath))
                return null;

            var encryptedData = await File.ReadAllBytesAsync(_tokenPath);
            var decryptedData = ProtectedData.Unprotect(
                encryptedData,
                null,
                DataProtectionScope.CurrentUser);

            var json = Encoding.UTF8.GetString(decryptedData);
            return JsonConvert.DeserializeObject<TokenSet>(json);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading tokens: {ex.Message}");
            return null;
        }
    }

    public async Task SaveTokensAsync(TokenSet tokens)
    {
        try
        {
            var json = JsonConvert.SerializeObject(tokens);
            var data = Encoding.UTF8.GetBytes(json);
            var encryptedData = ProtectedData.Protect(
                data,
                null,
                DataProtectionScope.CurrentUser);

            await File.WriteAllBytesAsync(_tokenPath, encryptedData);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error saving tokens: {ex.Message}");
        }
    }

    public Task ClearTokensAsync()
    {
        try
        {
            if (File.Exists(_tokenPath))
            {
                File.Delete(_tokenPath);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error clearing tokens: {ex.Message}");
        }
        return Task.CompletedTask;
    }
}
