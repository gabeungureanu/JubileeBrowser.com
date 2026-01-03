namespace JubileeBrowser.Models;

public enum AuthenticationState
{
    SignedOut,
    SigningIn,
    SignedIn,
    TokenExpired,
    Error
}

public enum AccountStatus
{
    Active,
    Pending,
    Suspended,
    Deactivated
}

public class JubileeUserProfile
{
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public AccountStatus AccountStatus { get; set; } = AccountStatus.Active;
    public long CreatedAt { get; set; }
    public long LastLoginAt { get; set; }
    public string? AvatarUrl { get; set; }
}

public class TokenSet
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public string? IdToken { get; set; }
    public string TokenType { get; set; } = "Bearer";
    public long ExpiresAt { get; set; }
    public List<string> Scope { get; set; } = new();
}

public class AuthSession
{
    public AuthenticationState State { get; set; } = AuthenticationState.SignedOut;
    public JubileeUserProfile? Profile { get; set; }
    public bool IsAuthenticated => State == AuthenticationState.SignedIn && Profile != null;
    public bool CanAccessParticipation => IsAuthenticated && Profile?.AccountStatus == AccountStatus.Active;
    public string? LastError { get; set; }
}

public enum ParticipationFeature
{
    RoundTable,
    Chat,
    Video,
    PrayerRooms,
    DomainManagement,
    SavedNotes,
    CrossDeviceSync,
    CommunityModeration
}

public class PermissionCheckResult
{
    public bool Allowed { get; set; }
    public string? Reason { get; set; }
    public bool RequiresSignIn { get; set; }
}
