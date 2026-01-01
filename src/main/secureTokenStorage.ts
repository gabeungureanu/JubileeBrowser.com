/**
 * Secure Token Storage
 * Uses OS-level secure storage mechanisms for credential protection
 *
 * On Windows: Uses Windows Credential Manager via keytar
 * On macOS: Uses Keychain via keytar
 * On Linux: Uses Secret Service API via keytar
 *
 * SECURITY: Raw tokens are never exposed to renderer processes.
 * All token operations happen exclusively in the main process.
 */

import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { TokenSet } from '../shared/types';

// Service name for credential storage
const SERVICE_NAME = 'JubileeBrowser';
const ACCOUNT_NAME = 'jubilee-identity';

// Encrypted file fallback path
const ENCRYPTED_TOKENS_FILE = 'encrypted-tokens.dat';

/**
 * Secure token storage interface
 */
interface StoredTokenData {
  tokens: TokenSet;
  storedAt: number;
  userId: string;
}

/**
 * SecureTokenStorage class
 * Manages secure storage and retrieval of authentication tokens
 */
export class SecureTokenStorage {
  private encryptedFilePath: string;
  private cachedTokens: TokenSet | null = null;
  private cachedUserId: string | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.encryptedFilePath = path.join(userDataPath, ENCRYPTED_TOKENS_FILE);
  }

  /**
   * Check if secure storage (encryption) is available
   */
  isSecureStorageAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Store tokens securely
   * Uses Electron's safeStorage which leverages OS-level encryption
   */
  async storeTokens(tokens: TokenSet, userId: string): Promise<boolean> {
    try {
      if (!this.isSecureStorageAvailable()) {
        console.error('SecureTokenStorage: Secure storage not available');
        return false;
      }

      const tokenData: StoredTokenData = {
        tokens,
        storedAt: Date.now(),
        userId,
      };

      const jsonData = JSON.stringify(tokenData);
      const encryptedBuffer = safeStorage.encryptString(jsonData);

      // Write encrypted data to file
      await fs.promises.writeFile(this.encryptedFilePath, encryptedBuffer);

      // Update cache
      this.cachedTokens = tokens;
      this.cachedUserId = userId;

      console.log('SecureTokenStorage: Tokens stored securely');
      return true;
    } catch (error) {
      console.error('SecureTokenStorage: Failed to store tokens:', error);
      return false;
    }
  }

  /**
   * Retrieve stored tokens
   */
  async retrieveTokens(): Promise<{ tokens: TokenSet; userId: string } | null> {
    try {
      // Return cached tokens if available
      if (this.cachedTokens && this.cachedUserId) {
        return { tokens: this.cachedTokens, userId: this.cachedUserId };
      }

      if (!this.isSecureStorageAvailable()) {
        console.error('SecureTokenStorage: Secure storage not available');
        return null;
      }

      // Check if encrypted file exists
      if (!fs.existsSync(this.encryptedFilePath)) {
        return null;
      }

      const encryptedBuffer = await fs.promises.readFile(this.encryptedFilePath);
      const decryptedJson = safeStorage.decryptString(encryptedBuffer);
      const tokenData: StoredTokenData = JSON.parse(decryptedJson);

      // Validate token structure
      if (!tokenData.tokens || !tokenData.tokens.accessToken || !tokenData.tokens.refreshToken) {
        console.error('SecureTokenStorage: Invalid token structure');
        await this.clearTokens();
        return null;
      }

      // Update cache
      this.cachedTokens = tokenData.tokens;
      this.cachedUserId = tokenData.userId;

      return { tokens: tokenData.tokens, userId: tokenData.userId };
    } catch (error) {
      console.error('SecureTokenStorage: Failed to retrieve tokens:', error);
      // Clear corrupted data
      await this.clearTokens();
      return null;
    }
  }

  /**
   * Clear all stored tokens
   * Called on sign-out or when tokens are revoked
   */
  async clearTokens(): Promise<boolean> {
    try {
      // Clear cache
      this.cachedTokens = null;
      this.cachedUserId = null;

      // Remove encrypted file
      if (fs.existsSync(this.encryptedFilePath)) {
        await fs.promises.unlink(this.encryptedFilePath);
      }

      console.log('SecureTokenStorage: Tokens cleared');
      return true;
    } catch (error) {
      console.error('SecureTokenStorage: Failed to clear tokens:', error);
      return false;
    }
  }

  /**
   * Check if tokens are stored
   */
  hasStoredTokens(): boolean {
    if (this.cachedTokens) {
      return true;
    }
    return fs.existsSync(this.encryptedFilePath);
  }

  /**
   * Check if access token is expired or about to expire
   * @param thresholdMs - Consider expired if within this many ms of expiry
   */
  isAccessTokenExpired(thresholdMs: number = 0): boolean {
    if (!this.cachedTokens) {
      return true;
    }
    return Date.now() + thresholdMs >= this.cachedTokens.expiresAt;
  }

  /**
   * Get cached access token if valid
   * Returns null if expired or not available
   */
  getValidAccessToken(): string | null {
    if (!this.cachedTokens) {
      return null;
    }
    if (this.isAccessTokenExpired()) {
      return null;
    }
    return this.cachedTokens.accessToken;
  }

  /**
   * Get cached refresh token
   * Returns null if not available
   */
  getRefreshToken(): string | null {
    return this.cachedTokens?.refreshToken ?? null;
  }

  /**
   * Update only the access token (after refresh)
   */
  async updateAccessToken(newAccessToken: string, newExpiresAt: number): Promise<boolean> {
    if (!this.cachedTokens || !this.cachedUserId) {
      return false;
    }

    const updatedTokens: TokenSet = {
      ...this.cachedTokens,
      accessToken: newAccessToken,
      expiresAt: newExpiresAt,
    };

    return this.storeTokens(updatedTokens, this.cachedUserId);
  }

  /**
   * Get token expiration time
   */
  getTokenExpiresAt(): number | null {
    return this.cachedTokens?.expiresAt ?? null;
  }

  /**
   * Get cached user ID
   */
  getCachedUserId(): string | null {
    return this.cachedUserId;
  }
}

// Singleton instance
let tokenStorageInstance: SecureTokenStorage | null = null;

/**
 * Get the singleton SecureTokenStorage instance
 */
export function getSecureTokenStorage(): SecureTokenStorage {
  if (!tokenStorageInstance) {
    tokenStorageInstance = new SecureTokenStorage();
  }
  return tokenStorageInstance;
}
