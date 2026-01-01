/**
 * Password Manager
 * Manages saved website credentials with encrypted storage
 * Uses Electron's safeStorage for OS-level encryption
 */

import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BrowserMode } from '../shared/types';

/**
 * Saved credential entry
 */
export interface SavedCredential {
  id: string;
  origin: string;       // e.g., "https://example.com"
  username: string;
  password: string;     // Stored encrypted at rest
  displayName?: string; // Optional friendly name for the site
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  mode: BrowserMode;    // Which browser mode this credential is for
}

/**
 * Credential data structure for storage (passwords masked for UI)
 */
export interface CredentialInfo {
  id: string;
  origin: string;
  username: string;
  displayName?: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  mode: BrowserMode;
}

const PASSWORDS_FILE = 'passwords.encrypted';

export class PasswordManager {
  private dataPath: string;
  private credentials: Map<string, SavedCredential> = new Map();
  private loaded: boolean = false;

  constructor(profileDataPath?: string) {
    // Use provided profile path or default userData
    const basePath = profileDataPath || app.getPath('userData');
    this.dataPath = path.join(basePath, PASSWORDS_FILE);
  }

  /**
   * Check if secure storage (encryption) is available
   */
  isSecureStorageAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Load credentials from encrypted storage
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (!this.isSecureStorageAvailable()) {
        console.warn('[PasswordManager] Secure storage not available');
        this.loaded = true;
        return;
      }

      if (!fs.existsSync(this.dataPath)) {
        this.loaded = true;
        return;
      }

      const encryptedBuffer = await fs.promises.readFile(this.dataPath);
      const decryptedJson = safeStorage.decryptString(encryptedBuffer);
      const credentialsList: SavedCredential[] = JSON.parse(decryptedJson);

      this.credentials.clear();
      for (const cred of credentialsList) {
        this.credentials.set(cred.id, cred);
      }

      console.log(`[PasswordManager] Loaded ${this.credentials.size} credentials`);
      this.loaded = true;
    } catch (error) {
      console.error('[PasswordManager] Failed to load credentials:', error);
      // Clear potentially corrupted data
      this.credentials.clear();
      this.loaded = true;
    }
  }

  /**
   * Save credentials to encrypted storage
   */
  async save(): Promise<boolean> {
    try {
      if (!this.isSecureStorageAvailable()) {
        console.error('[PasswordManager] Cannot save - secure storage not available');
        return false;
      }

      const credentialsList = Array.from(this.credentials.values());
      const jsonData = JSON.stringify(credentialsList);
      const encryptedBuffer = safeStorage.encryptString(jsonData);

      // Ensure directory exists
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await fs.promises.writeFile(this.dataPath, encryptedBuffer);
      console.log(`[PasswordManager] Saved ${this.credentials.size} credentials`);
      return true;
    } catch (error) {
      console.error('[PasswordManager] Failed to save credentials:', error);
      return false;
    }
  }

  /**
   * Save a new credential or update existing one for the same origin/username
   */
  async saveCredential(
    origin: string,
    username: string,
    password: string,
    mode: BrowserMode,
    displayName?: string
  ): Promise<SavedCredential> {
    await this.load();

    // Normalize origin
    const normalizedOrigin = this.normalizeOrigin(origin);

    // Check if credential already exists for this origin/username combination
    const existing = this.findCredential(normalizedOrigin, username, mode);

    if (existing) {
      // Update existing credential
      existing.password = password;
      existing.lastUsedAt = Date.now();
      existing.useCount++;
      if (displayName) {
        existing.displayName = displayName;
      }
      await this.save();
      console.log(`[PasswordManager] Updated credential for ${normalizedOrigin}`);
      return existing;
    }

    // Create new credential
    const credential: SavedCredential = {
      id: uuidv4(),
      origin: normalizedOrigin,
      username,
      password,
      displayName,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
      mode,
    };

    this.credentials.set(credential.id, credential);
    await this.save();
    console.log(`[PasswordManager] Saved new credential for ${normalizedOrigin}`);
    return credential;
  }

  /**
   * Get credentials for a specific origin
   * Returns credentials with passwords for autofill (main process only)
   */
  async getCredentials(origin: string, mode?: BrowserMode): Promise<SavedCredential[]> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    const results: SavedCredential[] = [];

    for (const cred of this.credentials.values()) {
      if (cred.origin === normalizedOrigin) {
        if (mode === undefined || cred.mode === mode) {
          results.push(cred);
        }
      }
    }

    // Sort by most recently used
    return results.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  /**
   * Get credential info for display in settings (passwords masked)
   */
  async getAllCredentialInfo(): Promise<CredentialInfo[]> {
    await this.load();

    const results: CredentialInfo[] = [];
    for (const cred of this.credentials.values()) {
      results.push({
        id: cred.id,
        origin: cred.origin,
        username: cred.username,
        displayName: cred.displayName,
        createdAt: cred.createdAt,
        lastUsedAt: cred.lastUsedAt,
        useCount: cred.useCount,
        mode: cred.mode,
      });
    }

    // Sort by origin, then by username
    return results.sort((a, b) => {
      const originCompare = a.origin.localeCompare(b.origin);
      if (originCompare !== 0) return originCompare;
      return a.username.localeCompare(b.username);
    });
  }

  /**
   * Get a specific credential by ID (with password)
   * Should only be called from main process
   */
  async getCredentialById(id: string): Promise<SavedCredential | null> {
    await this.load();
    return this.credentials.get(id) || null;
  }

  /**
   * Update a credential's use statistics
   */
  async markCredentialUsed(id: string): Promise<void> {
    await this.load();

    const cred = this.credentials.get(id);
    if (cred) {
      cred.lastUsedAt = Date.now();
      cred.useCount++;
      await this.save();
    }
  }

  /**
   * Update credential password
   */
  async updateCredential(
    id: string,
    updates: Partial<Pick<SavedCredential, 'username' | 'password' | 'displayName'>>
  ): Promise<boolean> {
    await this.load();

    const cred = this.credentials.get(id);
    if (!cred) {
      return false;
    }

    if (updates.username !== undefined) {
      cred.username = updates.username;
    }
    if (updates.password !== undefined) {
      cred.password = updates.password;
    }
    if (updates.displayName !== undefined) {
      cred.displayName = updates.displayName;
    }

    await this.save();
    return true;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(id: string): Promise<boolean> {
    await this.load();

    if (!this.credentials.has(id)) {
      return false;
    }

    this.credentials.delete(id);
    await this.save();
    console.log(`[PasswordManager] Deleted credential ${id}`);
    return true;
  }

  /**
   * Delete all credentials for an origin
   */
  async deleteCredentialsForOrigin(origin: string): Promise<number> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    let deletedCount = 0;

    for (const [id, cred] of this.credentials.entries()) {
      if (cred.origin === normalizedOrigin) {
        this.credentials.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await this.save();
      console.log(`[PasswordManager] Deleted ${deletedCount} credentials for ${normalizedOrigin}`);
    }

    return deletedCount;
  }

  /**
   * Delete all credentials
   */
  async clearAllCredentials(): Promise<void> {
    this.credentials.clear();

    if (fs.existsSync(this.dataPath)) {
      await fs.promises.unlink(this.dataPath);
    }

    console.log('[PasswordManager] Cleared all credentials');
  }

  /**
   * Export credentials to CSV format (for backup)
   * Password are included - use with caution
   */
  async exportToCSV(): Promise<string> {
    await this.load();

    const headers = ['origin', 'username', 'password', 'displayName', 'createdAt', 'lastUsedAt'];
    const rows: string[] = [headers.join(',')];

    for (const cred of this.credentials.values()) {
      const row = [
        this.escapeCSV(cred.origin),
        this.escapeCSV(cred.username),
        this.escapeCSV(cred.password),
        this.escapeCSV(cred.displayName || ''),
        new Date(cred.createdAt).toISOString(),
        new Date(cred.lastUsedAt).toISOString(),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Find existing credential by origin and username
   */
  private findCredential(origin: string, username: string, mode: BrowserMode): SavedCredential | null {
    for (const cred of this.credentials.values()) {
      if (cred.origin === origin && cred.username === username && cred.mode === mode) {
        return cred;
      }
    }
    return null;
  }

  /**
   * Normalize origin URL to consistent format
   */
  private normalizeOrigin(url: string): string {
    try {
      const parsed = new URL(url);
      // Return just the origin (protocol + host)
      return parsed.origin;
    } catch {
      // If URL parsing fails, return as-is
      return url.toLowerCase();
    }
  }

  /**
   * Escape value for CSV
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get total number of saved credentials
   */
  async getCredentialCount(): Promise<number> {
    await this.load();
    return this.credentials.size;
  }
}
