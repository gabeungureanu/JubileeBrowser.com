/**
 * Authentication Manager
 * Core service for managing Jubilee identity and authentication
 *
 * This module owns:
 * - Login state and session lifecycle
 * - Token storage and refresh
 * - Profile retrieval and caching
 * - Permission checks for participation features
 *
 * SECURITY PRINCIPLES:
 * - Raw tokens NEVER leave this module (main process only)
 * - Renderer processes receive only safe session state
 * - All external API calls use HTTPS
 * - Token signatures are validated
 * - Expired/malformed tokens are rejected
 *
 * PRIVACY PRINCIPLES:
 * - Minimal data collection (no behavioral tracking)
 * - Clear data lifecycle documentation
 * - Explicit user consent for all features
 */

import { BrowserWindow, net } from 'electron';
import { EventEmitter } from 'events';
import {
  AuthenticationState,
  AuthSession,
  AuthError,
  AuthErrorCode,
  JubileeUserProfile,
  TokenSet,
  SignInRequest,
  SignInResponse,
  ParticipationFeature,
  PermissionCheckResult,
  DEFAULT_IDENTITY_CONFIG,
  IdentityServiceConfig,
} from '../shared/types';
import { SecureTokenStorage, getSecureTokenStorage } from './secureTokenStorage';

/**
 * Authentication Manager events
 */
export interface AuthManagerEvents {
  'session-changed': (session: AuthSession) => void;
  'sign-in-required': (feature: ParticipationFeature) => void;
  'token-refreshed': () => void;
  'sign-out-complete': () => void;
}

/**
 * AuthenticationManager class
 * Singleton service managing all authentication operations
 */
export class AuthenticationManager extends EventEmitter {
  private config: IdentityServiceConfig;
  private tokenStorage: SecureTokenStorage;
  private currentState: AuthenticationState = 'signed_out';
  private currentProfile: JubileeUserProfile | null = null;
  private lastError: AuthError | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isInitialized: boolean = false;

  constructor(config: IdentityServiceConfig = DEFAULT_IDENTITY_CONFIG) {
    super();
    this.config = config;
    this.tokenStorage = getSecureTokenStorage();
  }

  /**
   * Initialize the authentication manager
   * Call this during app startup
   */
  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.mainWindow = mainWindow ?? null;

    // Try to restore existing session
    await this.restoreSession();

    // Start token refresh timer if authenticated
    if (this.currentState === 'signed_in') {
      this.scheduleTokenRefresh();
    }

    this.isInitialized = true;
    console.log('AuthenticationManager: Initialized');
  }

  /**
   * Set the main window reference
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Get current authentication session state
   * This is safe to expose to renderer
   */
  getSession(): AuthSession {
    return {
      state: this.currentState,
      profile: this.currentProfile,
      isAuthenticated: this.currentState === 'signed_in',
      canAccessParticipation: this.currentState === 'signed_in' &&
        this.currentProfile?.accountStatus === 'active',
      lastError: this.lastError ?? undefined,
    };
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated(): boolean {
    return this.currentState === 'signed_in';
  }

  /**
   * Sign in with email and password
   */
  async signIn(request: SignInRequest): Promise<SignInResponse> {
    try {
      this.setState('signing_in');
      this.clearError();

      // Validate request
      if (!request.email || !request.email.includes('@')) {
        throw this.createError('invalid_credentials', 'Please enter a valid email address');
      }

      if (!request.useMagicLink && !request.password) {
        throw this.createError('invalid_credentials', 'Please enter your password');
      }

      // Make authentication request to Jubilee Identity Service
      const response = await this.makeAuthRequest('/auth/login', {
        email: request.email,
        password: request.password,
        useMagicLink: request.useMagicLink,
      });

      if (!response.success) {
        throw this.createError(
          response.errorCode as AuthErrorCode ?? 'unknown_error',
          response.errorMessage ?? 'Sign in failed'
        );
      }

      // Handle magic link response
      if (request.useMagicLink && response.magicLinkSent) {
        this.setState('signed_out');
        return {
          success: true,
          magicLinkSent: true,
        };
      }

      // Handle verification required
      if (response.requiresVerification) {
        this.setState('signed_out');
        return {
          success: false,
          requiresVerification: true,
          error: this.createError('verification_required', 'Please verify your email address'),
        };
      }

      // Store tokens securely
      const tokens: TokenSet = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        idToken: response.idToken,
        tokenType: 'Bearer',
        expiresAt: Date.now() + (response.expiresIn * 1000),
        scope: response.scope ?? this.config.scopes,
      };

      await this.tokenStorage.storeTokens(tokens, response.profile.userId);

      // Update state
      this.currentProfile = response.profile;
      this.setState('signed_in');

      // Schedule token refresh
      this.scheduleTokenRefresh();

      console.log('AuthenticationManager: Sign in successful for', request.email);

      return {
        success: true,
        profile: this.currentProfile ?? undefined,
      };
    } catch (error) {
      const authError = this.isAuthError(error) ? error : this.createError(
        'unknown_error',
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );

      this.lastError = authError;
      this.setState('error');

      return {
        success: false,
        error: authError,
      };
    }
  }

  /**
   * Type guard for AuthError
   */
  private isAuthError(error: unknown): error is AuthError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'timestamp' in error
    );
  }

  /**
   * Sign out and clear all authentication state
   */
  async signOut(): Promise<void> {
    try {
      // Revoke tokens on server if we have a valid access token
      const accessToken = this.tokenStorage.getValidAccessToken();
      if (accessToken) {
        try {
          await this.makeAuthRequest('/auth/logout', {}, accessToken);
        } catch {
          // Continue with local sign out even if server revocation fails
          console.warn('AuthenticationManager: Server token revocation failed');
        }
      }
    } finally {
      // Always clear local state
      await this.clearLocalSession();
      this.emit('sign-out-complete');
      console.log('AuthenticationManager: Sign out complete');
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.tokenStorage.getRefreshToken();
      if (!refreshToken) {
        console.log('AuthenticationManager: No refresh token available');
        await this.clearLocalSession();
        return false;
      }

      const response = await this.makeAuthRequest('/auth/refresh', {
        refreshToken,
      });

      if (!response.success) {
        console.error('AuthenticationManager: Token refresh failed');
        // Token is revoked or invalid
        this.lastError = this.createError('token_revoked', 'Your session has expired. Please sign in again.');
        this.setState('token_expired');
        return false;
      }

      // Update stored access token
      await this.tokenStorage.updateAccessToken(
        response.accessToken,
        Date.now() + (response.expiresIn * 1000)
      );

      // Re-schedule refresh
      this.scheduleTokenRefresh();

      this.emit('token-refreshed');
      console.log('AuthenticationManager: Token refreshed successfully');

      return true;
    } catch (error) {
      console.error('AuthenticationManager: Token refresh error:', error);
      this.lastError = this.createError('network_error', 'Unable to refresh session');
      this.setState('token_expired');
      return false;
    }
  }

  /**
   * Check if user has permission for a specific feature
   */
  async checkPermission(feature: ParticipationFeature): Promise<PermissionCheckResult> {
    // All participation features require authentication
    if (!this.isAuthenticated()) {
      return {
        feature,
        allowed: false,
        requiresAuth: true,
        reason: 'Sign in to Jubilee to access this feature',
      };
    }

    // Check account status
    if (this.currentProfile?.accountStatus !== 'active') {
      return {
        feature,
        allowed: false,
        requiresAuth: false,
        reason: this.currentProfile?.accountStatus === 'suspended'
          ? 'Your account is currently suspended'
          : 'Please verify your email to access this feature',
      };
    }

    // For now, all features are allowed for active authenticated users
    // Future: Add role-based permissions for community_moderation
    return {
      feature,
      allowed: true,
      requiresAuth: true,
    };
  }

  /**
   * Request sign-in for a specific feature
   * Emits event and optionally shows sign-in UI
   */
  requestSignIn(feature: ParticipationFeature): void {
    this.emit('sign-in-required', feature);
  }

  /**
   * Get the current user profile
   */
  getProfile(): JubileeUserProfile | null {
    return this.currentProfile;
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<JubileeUserProfile>): Promise<{ success: boolean; error?: AuthError }> {
    if (!this.isAuthenticated()) {
      return {
        success: false,
        error: this.createError('token_expired', 'Please sign in to update your profile'),
      };
    }

    try {
      const accessToken = this.tokenStorage.getValidAccessToken();
      if (!accessToken) {
        // Try to refresh
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          return {
            success: false,
            error: this.createError('token_expired', 'Session expired. Please sign in again.'),
          };
        }
      }

      const response = await this.makeAuthRequest('/profile/update', updates, this.tokenStorage.getValidAccessToken()!);

      if (response.success && response.profile) {
        this.currentProfile = response.profile;
        this.emitSessionChanged();
        return { success: true };
      }

      return {
        success: false,
        error: this.createError('server_error', response.errorMessage ?? 'Failed to update profile'),
      };
    } catch (error) {
      return {
        success: false,
        error: this.createError('network_error', 'Unable to update profile'),
      };
    }
  }

  /**
   * Get access token for authenticated API requests
   * INTERNAL USE ONLY - never expose to renderer
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    // Check if token is expired or about to expire
    if (this.tokenStorage.isAccessTokenExpired(this.config.tokenRefreshThreshold)) {
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        return null;
      }
    }

    return this.tokenStorage.getValidAccessToken();
  }

  /**
   * Restore session from stored tokens
   */
  private async restoreSession(): Promise<void> {
    try {
      const stored = await this.tokenStorage.retrieveTokens();
      if (!stored) {
        console.log('AuthenticationManager: No stored session');
        return;
      }

      // Check if access token is still valid
      if (this.tokenStorage.isAccessTokenExpired(0)) {
        // Try to refresh
        console.log('AuthenticationManager: Stored token expired, attempting refresh');
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          return;
        }
      }

      // Fetch current profile from server
      const accessToken = this.tokenStorage.getValidAccessToken();
      if (accessToken) {
        try {
          const response = await this.makeAuthRequest('/profile', {}, accessToken);
          if (response.success && response.profile) {
            this.currentProfile = response.profile;
            this.setState('signed_in');
            console.log('AuthenticationManager: Session restored for', response.profile.email);
            return;
          }
        } catch {
          console.warn('AuthenticationManager: Failed to fetch profile, attempting token refresh');
        }
      }

      // Token may be invalid, try refresh
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        await this.clearLocalSession();
      }
    } catch (error) {
      console.error('AuthenticationManager: Session restore failed:', error);
      await this.clearLocalSession();
    }
  }

  /**
   * Clear local session state
   */
  private async clearLocalSession(): Promise<void> {
    this.cancelTokenRefresh();
    await this.tokenStorage.clearTokens();
    this.currentProfile = null;
    this.clearError();
    this.setState('signed_out');
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    this.cancelTokenRefresh();

    const expiresAt = this.tokenStorage.getTokenExpiresAt();
    if (!expiresAt) {
      return;
    }

    // Calculate time until refresh (refresh early to avoid expiration)
    const refreshIn = expiresAt - Date.now() - this.config.tokenRefreshThreshold;
    if (refreshIn <= 0) {
      // Token already needs refresh
      this.refreshToken();
      return;
    }

    this.tokenRefreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshIn);

    console.log(`AuthenticationManager: Token refresh scheduled in ${Math.round(refreshIn / 1000)}s`);
  }

  /**
   * Cancel scheduled token refresh
   */
  private cancelTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  /**
   * Set authentication state and emit event
   */
  private setState(state: AuthenticationState): void {
    if (this.currentState === state) {
      return;
    }
    this.currentState = state;
    this.emitSessionChanged();
  }

  /**
   * Emit session changed event
   */
  private emitSessionChanged(): void {
    const session = this.getSession();
    this.emit('session-changed', session);

    // Also notify main window if available
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('auth:session-changed', session);
    }
  }

  /**
   * Create an authentication error
   */
  private createError(code: AuthErrorCode, message: string): AuthError {
    return {
      code,
      message,
      timestamp: Date.now(),
    };
  }

  /**
   * Clear last error
   */
  private clearError(): void {
    this.lastError = null;
  }

  /**
   * Make authenticated request to identity service
   */
  private async makeAuthRequest(
    endpoint: string,
    body: Record<string, unknown>,
    accessToken?: string
  ): Promise<any> {
    const url = `${this.config.authEndpoint}${endpoint}`;

    // Use Electron's net module for proper HTTPS handling
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      let responseData = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch {
            reject(new Error('Invalid response from auth server'));
          }
        });
      });

      request.on('error', (error) => {
        console.error('AuthenticationManager: Network error:', error);
        reject(this.createError('network_error', 'Unable to connect to Jubilee'));
      });

      request.write(JSON.stringify(body));
      request.end();
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cancelTokenRefresh();
    this.removeAllListeners();
    this.mainWindow = null;
  }
}

// Singleton instance
let authManagerInstance: AuthenticationManager | null = null;

/**
 * Get the singleton AuthenticationManager instance
 */
export function getAuthenticationManager(): AuthenticationManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthenticationManager();
  }
  return authManagerInstance;
}
