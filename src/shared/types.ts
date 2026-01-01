/**
 * JubileeBrowser Shared Types
 * Core type definitions used across main and renderer processes
 */

// Browser operating modes
export type BrowserMode = 'internet' | 'jubileebibles';

// Tab state representation
export interface TabState {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  mode: BrowserMode;
  isSecure?: boolean;
}

// Navigation entry for history
export interface NavigationEntry {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  mode: BrowserMode;
  favicon?: string;
}

// Bookmark entry
export interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  createdAt: number;
  mode: BrowserMode;
  folder?: string;
  favicon?: string;
}

// Session data for mode isolation
export interface SessionData {
  mode: BrowserMode;
  cookies: string[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

// Inspire namespace resolution result
export interface InspireResolution {
  success: boolean;
  internalUrl?: string;  // .ins internal URL
  contentType: 'local' | 'hosted' | 'distributed' | 'error';
  content?: string;
  metadata?: InspireMetadata;
  errorMessage?: string;
}

// Metadata for .inspire locations
export interface InspireMetadata {
  name: string;
  description?: string;
  steward?: string;
  consecrated?: boolean;
  requiresIdentity?: boolean;
  permissions?: string[];
}

// Update status for auto-updater
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

// Update channel for release management
export type UpdateChannel = 'stable' | 'beta';

// Update state information
export interface UpdateState {
  status: UpdateStatus;
  channel: UpdateChannel;
  currentVersion: string;
  availableVersion?: string;
  downloadProgress?: number;
  lastCheckTime?: number;
  lastError?: string;
  releaseNotes?: string;
}

// Session state for seamless updates
export interface SessionState {
  windowBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMaximized: boolean;
  currentMode: BrowserMode;
  tabs: Array<{
    id: string;
    url: string;
    title: string;
    mode: BrowserMode;
    isActive: boolean;
  }>;
  activeTabId?: string;
  timestamp: number;
}

// Tab group definition
export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  tabIds: string[];
  collapsed: boolean;
}

// Tab group colors matching Chrome
export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

// Extended tab state with pin, mute, and group support
export interface ExtendedTabState extends TabState {
  isPinned: boolean;
  isMuted: boolean;
  isAudible: boolean;
  groupId?: string;
}

// Closed tab entry for restoration
export interface ClosedTabEntry {
  id: string;
  url: string;
  title: string;
  mode: BrowserMode;
  closedAt: number;
  scrollPosition?: number;
}

// IPC Channel names - centralized for type safety
export const IPC_CHANNELS = {
  // Tab management
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_SWITCH: 'tab:switch',
  TAB_UPDATE: 'tab:update',
  TAB_LIST: 'tab:list',
  TAB_DUPLICATE: 'tab:duplicate',
  TAB_PIN: 'tab:pin',
  TAB_UNPIN: 'tab:unpin',
  TAB_MUTE: 'tab:mute',
  TAB_UNMUTE: 'tab:unmute',
  TAB_MOVE_TO_NEW_WINDOW: 'tab:move-to-new-window',
  TAB_CLOSE_OTHERS: 'tab:close-others',
  TAB_CLOSE_TO_RIGHT: 'tab:close-to-right',
  TAB_REOPEN_CLOSED: 'tab:reopen-closed',
  TAB_GET_CLOSED: 'tab:get-closed',
  TAB_ADD_TO_GROUP: 'tab:add-to-group',
  TAB_REMOVE_FROM_GROUP: 'tab:remove-from-group',
  TAB_CREATE_GROUP: 'tab:create-group',
  TAB_GET_GROUPS: 'tab:get-groups',

  // Navigation
  NAV_GO: 'nav:go',
  NAV_BACK: 'nav:back',
  NAV_FORWARD: 'nav:forward',
  NAV_RELOAD: 'nav:reload',
  NAV_HARD_RELOAD: 'nav:hard-reload',
  NAV_STOP: 'nav:stop',
  NAV_STATE: 'nav:state',

  // Mode switching
  MODE_SWITCH: 'mode:switch',
  MODE_GET: 'mode:get',
  MODE_CHANGED: 'mode:changed',

  // History
  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_ADD: 'history:add',

  // Bookmarks
  BOOKMARK_ADD: 'bookmark:add',
  BOOKMARK_REMOVE: 'bookmark:remove',
  BOOKMARK_GET: 'bookmark:get',
  BOOKMARK_LIST: 'bookmark:list',

  // Inspire resolution
  INSPIRE_RESOLVE: 'inspire:resolve',
  INSPIRE_REGISTER: 'inspire:register',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_NEW: 'window:new',
  WINDOW_NEW_JUBILEE: 'window:new-jubilee',
  WINDOW_PRINT: 'window:print',
  WINDOW_GET_ZOOM: 'window:get-zoom',
  WINDOW_SET_ZOOM: 'window:set-zoom',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  SETTINGS_GET_SECTION: 'settings:get-section',

  // Profiles
  PROFILES_LIST: 'profiles:list',
  PROFILES_CREATE: 'profiles:create',
  PROFILES_DELETE: 'profiles:delete',
  PROFILES_SWITCH: 'profiles:switch',
  PROFILES_GET_ACTIVE: 'profiles:get-active',

  // Passwords
  PASSWORDS_GET: 'passwords:get',
  PASSWORDS_SAVE: 'passwords:save',
  PASSWORDS_DELETE: 'passwords:delete',
  PASSWORDS_EXPORT: 'passwords:export',

  // Site Permissions
  SITE_PERMISSIONS_GET: 'site-permissions:get',
  SITE_PERMISSIONS_SET: 'site-permissions:set',
  SITE_PERMISSIONS_CLEAR: 'site-permissions:clear',
  SITE_PERMISSIONS_LIST: 'site-permissions:list',

  // Privacy / Clear Data
  PRIVACY_CLEAR_DATA: 'privacy:clear-data',

  // Auto-update
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_STATE_CHANGED: 'update:state-changed',
  UPDATE_PROGRESS: 'update:progress',

  // Session state
  SESSION_SAVE: 'session:save',
  SESSION_RESTORE: 'session:restore',
  SESSION_GET: 'session:get',

  // Identity and authentication
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_SIGN_IN: 'auth:sign-in',
  AUTH_SIGN_OUT: 'auth:sign-out',
  AUTH_REFRESH_TOKEN: 'auth:refresh-token',
  AUTH_CHECK_PERMISSION: 'auth:check-permission',
  AUTH_SESSION_CHANGED: 'auth:session-changed',
  AUTH_SHOW_SIGN_IN: 'auth:show-sign-in',
  AUTH_GET_PROFILE: 'auth:get-profile',
  AUTH_UPDATE_PROFILE: 'auth:update-profile',
} as const;

// ============================================
// Profile Types
// ============================================

/**
 * Individual browser profile settings
 * Each profile has isolated data (history, bookmarks, passwords, settings)
 */
export interface ProfileSettings {
  id: string;
  name: string;
  avatar: string; // Single character or emoji
  accentColor: string; // Hex color for profile indicator
  createdAt: number;
}

/**
 * Search engine configuration
 */
export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string; // URL with {searchTerms} placeholder
  isDefault: boolean;
}

// ============================================
// Settings Interface (Expanded)
// ============================================

export interface BrowserSettings {
  // Existing settings
  defaultMode: BrowserMode;
  homepage: {
    internet: string;
    jubileebibles: string;
  };

  // Profile & Identity
  profiles: {
    active: string; // Active profile ID
    list: ProfileSettings[];
  };

  // Autofill & Saved Data
  autofill: {
    passwords: {
      enabled: boolean;
      autoSignIn: boolean;
    };
    addresses: {
      enabled: boolean;
    };
    paymentMethods: {
      enabled: boolean;
    };
  };

  // Privacy & Security (expanded)
  privacy: {
    clearOnExit: boolean;
    doNotTrack: boolean;
    cookieBehavior: 'allow' | 'block-third-party' | 'block-all';
    trackingProtection: 'standard' | 'strict' | 'off';
    safeBrowsing: boolean;
  };

  // Permissions (global defaults)
  permissions: {
    camera: 'ask' | 'allow' | 'block';
    microphone: 'ask' | 'allow' | 'block';
    location: 'ask' | 'allow' | 'block';
    notifications: 'ask' | 'allow' | 'block';
    popups: 'allow' | 'block';
    javascript: boolean;
  };

  // Appearance (expanded)
  appearance: {
    theme: 'light' | 'dark' | 'system';
    fontSize: 'small' | 'medium' | 'large';
    zoomLevel: number; // 0.5 to 2.0, default 1
    showBookmarksBar: boolean;
  };

  // Search & Address Bar
  search: {
    defaultEngine: string; // Search engine ID
    engines: SearchEngine[];
    suggestionsEnabled: boolean;
  };

  // Startup & Home Pages
  startup: {
    internet: {
      behavior: 'homepage' | 'restore' | 'specific';
      pages: string[];
    };
    jubileebibles: {
      behavior: 'homepage' | 'restore' | 'specific';
      pages: string[];
    };
  };

  // Advanced settings
  advanced: {
    downloadPath: string;
    askDownloadLocation: boolean;
    language: string;
    spellcheck: boolean;
    hardwareAcceleration: boolean;
    backgroundApps: boolean;
  };
}

// Default settings
export const DEFAULT_SETTINGS: BrowserSettings = {
  defaultMode: 'internet',
  homepage: {
    internet: 'https://www.jubileeverse.com',
    jubileebibles: 'https://www.jubileeverse.com',
  },
  profiles: {
    active: 'default',
    list: [
      {
        id: 'default',
        name: 'Default',
        avatar: 'D',
        accentColor: '#E6AC00',
        createdAt: Date.now(),
      },
    ],
  },
  autofill: {
    passwords: {
      enabled: true,
      autoSignIn: true,
    },
    addresses: {
      enabled: true,
    },
    paymentMethods: {
      enabled: false, // Disabled by default for privacy
    },
  },
  privacy: {
    clearOnExit: false,
    doNotTrack: true,
    cookieBehavior: 'block-third-party',
    trackingProtection: 'standard',
    safeBrowsing: true,
  },
  permissions: {
    camera: 'ask',
    microphone: 'ask',
    location: 'ask',
    notifications: 'ask',
    popups: 'block',
    javascript: true,
  },
  appearance: {
    theme: 'dark',
    fontSize: 'medium',
    zoomLevel: 1,
    showBookmarksBar: false,
  },
  search: {
    defaultEngine: 'jubilee',
    engines: [
      {
        id: 'jubilee',
        name: 'Jubilee',
        urlTemplate: 'https://www.jubileeverse.com/search?q={searchTerms}',
        isDefault: true,
      },
      {
        id: 'google',
        name: 'Google',
        urlTemplate: 'https://www.google.com/search?q={searchTerms}',
        isDefault: false,
      },
      {
        id: 'bing',
        name: 'Bing',
        urlTemplate: 'https://www.bing.com/search?q={searchTerms}',
        isDefault: false,
      },
      {
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        urlTemplate: 'https://duckduckgo.com/?q={searchTerms}',
        isDefault: false,
      },
    ],
    suggestionsEnabled: true,
  },
  startup: {
    internet: {
      behavior: 'homepage',
      pages: [],
    },
    jubileebibles: {
      behavior: 'homepage',
      pages: [],
    },
  },
  advanced: {
    downloadPath: '', // Empty means use system default
    askDownloadLocation: false,
    language: 'en-US',
    spellcheck: true,
    hardwareAcceleration: true,
    backgroundApps: false,
  },
};

// ============================================
// Jubilee Identity System Types
// ============================================

/**
 * Authentication state representing current sign-in status
 */
export type AuthenticationState =
  | 'signed_out'      // No active session
  | 'signing_in'      // Authentication in progress
  | 'signed_in'       // Fully authenticated
  | 'token_expired'   // Session expired, needs refresh
  | 'error';          // Authentication error occurred

/**
 * Account status for moderation and lifecycle management
 */
export type AccountStatus =
  | 'active'          // Normal active account
  | 'pending'         // Email verification pending
  | 'suspended'       // Temporarily suspended by moderator
  | 'deactivated';    // User-initiated deactivation

/**
 * Jubilee user profile - minimal required data only
 * Note: This system does NOT collect behavioral data for advertising
 */
export interface JubileeUserProfile {
  userId: string;           // Unique identifier (UUID)
  email: string;            // Primary email address
  displayName: string;      // User-chosen display name
  accountStatus: AccountStatus;
  createdAt: number;        // Account creation timestamp
  lastLoginAt: number;      // Last successful login timestamp
  avatarUrl?: string;       // Optional profile avatar URL
  preferences?: UserPreferences;
}

/**
 * User preferences synced across devices
 */
export interface UserPreferences {
  defaultBibleTranslation?: string;
  emailNotifications: boolean;
  syncEnabled: boolean;
}

/**
 * OAuth 2.0 / OpenID Connect token set
 * Access tokens are short-lived, refresh tokens are long-lived
 */
export interface TokenSet {
  accessToken: string;      // Short-lived JWT for API access
  refreshToken: string;     // Long-lived token for obtaining new access tokens
  idToken?: string;         // OpenID Connect identity token
  tokenType: 'Bearer';
  expiresAt: number;        // Access token expiration timestamp (ms)
  scope: string[];          // Token permissions/scopes
}

/**
 * Authentication session state exposed to renderer
 * Note: Raw tokens are NEVER exposed to renderer - only via main process
 */
export interface AuthSession {
  state: AuthenticationState;
  profile: JubileeUserProfile | null;
  isAuthenticated: boolean;
  canAccessParticipation: boolean;  // Can access Round Table, chat, etc.
  lastError?: AuthError;
}

/**
 * Authentication error details
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;          // User-friendly message
  timestamp: number;
}

/**
 * Authentication error codes
 */
export type AuthErrorCode =
  | 'network_error'         // Unable to reach auth server
  | 'invalid_credentials'   // Wrong email/password
  | 'account_suspended'     // Account has been suspended
  | 'account_not_found'     // Email not registered
  | 'token_expired'         // Session expired
  | 'token_revoked'         // Token was explicitly revoked
  | 'verification_required' // Email verification needed
  | 'rate_limited'          // Too many attempts
  | 'server_error'          // Auth server error
  | 'unknown_error';        // Catch-all

/**
 * Sign-in request parameters
 */
export interface SignInRequest {
  email: string;
  password?: string;        // For password-based auth
  useMagicLink?: boolean;   // For passwordless magic link
}

/**
 * Sign-in response from identity service
 */
export interface SignInResponse {
  success: boolean;
  profile?: JubileeUserProfile;
  error?: AuthError;
  requiresVerification?: boolean;
  magicLinkSent?: boolean;
}

/**
 * Features that require authentication in Jubilee Bible mode
 */
export type ParticipationFeature =
  | 'round_table'           // Round Table discussions
  | 'chat'                  // Live chat
  | 'video'                 // Video calls
  | 'prayer_rooms'          // Prayer room participation
  | 'domain_management'     // Managing .inspire domains
  | 'saved_notes'           // Personal notes/highlights
  | 'cross_device_sync'     // Sync across devices
  | 'community_moderation'; // Moderation tools (admin only)

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  feature: ParticipationFeature;
  allowed: boolean;
  requiresAuth: boolean;
  reason?: string;
}

/**
 * Identity service configuration
 */
export interface IdentityServiceConfig {
  authEndpoint: string;     // Jubilee auth API base URL
  clientId: string;         // OAuth client identifier
  scopes: string[];         // Requested OAuth scopes
  tokenRefreshThreshold: number;  // Refresh token when this many ms before expiry
}

/**
 * Default identity service configuration
 */
export const DEFAULT_IDENTITY_CONFIG: IdentityServiceConfig = {
  authEndpoint: 'https://auth.jubileebrowser.com',
  clientId: 'jubilee-browser-desktop',
  scopes: ['openid', 'profile', 'email', 'jubilee.services'],
  tokenRefreshThreshold: 5 * 60 * 1000,  // Refresh 5 minutes before expiry
};
