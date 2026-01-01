/**
 * Site Permissions Manager
 * Manages per-site permission settings (camera, microphone, location, notifications, etc.)
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserMode } from '../shared/types';

/**
 * Permission types supported by the browser
 */
export type PermissionType =
  | 'camera'
  | 'microphone'
  | 'location'
  | 'notifications'
  | 'popups'
  | 'javascript'
  | 'cookies'
  | 'autoplay'
  | 'fullscreen'
  | 'clipboard';

/**
 * Permission value - what the user selected
 */
export type PermissionValue = 'allow' | 'block' | 'ask';

/**
 * Individual site permission entry
 */
export interface SitePermission {
  origin: string;          // e.g., "https://example.com"
  permission: PermissionType;
  value: PermissionValue;
  mode: BrowserMode;       // Which browser mode this applies to
  updatedAt: number;       // When this permission was last changed
}

/**
 * Permission summary for a site
 */
export interface SitePermissionSummary {
  origin: string;
  permissions: Record<PermissionType, PermissionValue>;
  mode: BrowserMode;
  lastUpdated: number;
}

const PERMISSIONS_FILE = 'site-permissions.json';

export class SitePermissionsManager {
  private dataPath: string;
  private permissions: Map<string, SitePermission> = new Map(); // key: origin:permission:mode
  private loaded: boolean = false;

  constructor(profileDataPath?: string) {
    const basePath = profileDataPath || app.getPath('userData');
    this.dataPath = path.join(basePath, PERMISSIONS_FILE);
  }

  /**
   * Generate a unique key for a permission entry
   */
  private getKey(origin: string, permission: PermissionType, mode: BrowserMode): string {
    return `${origin}:${permission}:${mode}`;
  }

  /**
   * Load permissions from storage
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (!fs.existsSync(this.dataPath)) {
        this.loaded = true;
        return;
      }

      const data = await fs.promises.readFile(this.dataPath, 'utf-8');
      const permissionsList: SitePermission[] = JSON.parse(data);

      this.permissions.clear();
      for (const perm of permissionsList) {
        const key = this.getKey(perm.origin, perm.permission, perm.mode);
        this.permissions.set(key, perm);
      }

      console.log(`[SitePermissionsManager] Loaded ${this.permissions.size} permissions`);
      this.loaded = true;
    } catch (error) {
      console.error('[SitePermissionsManager] Failed to load permissions:', error);
      this.permissions.clear();
      this.loaded = true;
    }
  }

  /**
   * Save permissions to storage
   */
  async save(): Promise<boolean> {
    try {
      const permissionsList = Array.from(this.permissions.values());
      const jsonData = JSON.stringify(permissionsList, null, 2);

      // Ensure directory exists
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await fs.promises.writeFile(this.dataPath, jsonData);
      console.log(`[SitePermissionsManager] Saved ${this.permissions.size} permissions`);
      return true;
    } catch (error) {
      console.error('[SitePermissionsManager] Failed to save permissions:', error);
      return false;
    }
  }

  /**
   * Get permission value for a specific origin and permission type
   */
  async getPermission(
    origin: string,
    permission: PermissionType,
    mode: BrowserMode
  ): Promise<PermissionValue | null> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    const key = this.getKey(normalizedOrigin, permission, mode);
    const entry = this.permissions.get(key);

    return entry?.value ?? null;
  }

  /**
   * Set permission value for a specific origin
   */
  async setPermission(
    origin: string,
    permission: PermissionType,
    value: PermissionValue,
    mode: BrowserMode
  ): Promise<void> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    const key = this.getKey(normalizedOrigin, permission, mode);

    const entry: SitePermission = {
      origin: normalizedOrigin,
      permission,
      value,
      mode,
      updatedAt: Date.now(),
    };

    this.permissions.set(key, entry);
    await this.save();

    console.log(`[SitePermissionsManager] Set ${permission}=${value} for ${normalizedOrigin} (${mode})`);
  }

  /**
   * Remove a specific permission for an origin
   */
  async removePermission(
    origin: string,
    permission: PermissionType,
    mode: BrowserMode
  ): Promise<boolean> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    const key = this.getKey(normalizedOrigin, permission, mode);

    if (!this.permissions.has(key)) {
      return false;
    }

    this.permissions.delete(key);
    await this.save();

    console.log(`[SitePermissionsManager] Removed ${permission} for ${normalizedOrigin} (${mode})`);
    return true;
  }

  /**
   * Clear all permissions for a specific origin
   */
  async clearPermissionsForOrigin(origin: string, mode?: BrowserMode): Promise<number> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    let deletedCount = 0;

    for (const [key, perm] of this.permissions.entries()) {
      if (perm.origin === normalizedOrigin) {
        if (mode === undefined || perm.mode === mode) {
          this.permissions.delete(key);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      await this.save();
      console.log(`[SitePermissionsManager] Cleared ${deletedCount} permissions for ${normalizedOrigin}`);
    }

    return deletedCount;
  }

  /**
   * Clear all permissions
   */
  async clearAllPermissions(): Promise<void> {
    this.permissions.clear();

    if (fs.existsSync(this.dataPath)) {
      await fs.promises.unlink(this.dataPath);
    }

    console.log('[SitePermissionsManager] Cleared all permissions');
  }

  /**
   * Get all permissions for a specific origin
   */
  async getAllPermissionsForOrigin(
    origin: string,
    mode: BrowserMode
  ): Promise<SitePermission[]> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    const results: SitePermission[] = [];

    for (const perm of this.permissions.values()) {
      if (perm.origin === normalizedOrigin && perm.mode === mode) {
        results.push(perm);
      }
    }

    return results;
  }

  /**
   * Get all permissions grouped by origin
   */
  async getAllPermissions(): Promise<SitePermission[]> {
    await this.load();
    return Array.from(this.permissions.values());
  }

  /**
   * Get unique origins that have custom permissions
   */
  async getOriginsWithPermissions(mode?: BrowserMode): Promise<string[]> {
    await this.load();

    const origins = new Set<string>();
    for (const perm of this.permissions.values()) {
      if (mode === undefined || perm.mode === mode) {
        origins.add(perm.origin);
      }
    }

    return Array.from(origins).sort();
  }

  /**
   * Get permission summary for an origin
   */
  async getPermissionSummary(origin: string, mode: BrowserMode): Promise<SitePermissionSummary | null> {
    await this.load();

    const normalizedOrigin = this.normalizeOrigin(origin);
    const permissions: Partial<Record<PermissionType, PermissionValue>> = {};
    let lastUpdated = 0;

    for (const perm of this.permissions.values()) {
      if (perm.origin === normalizedOrigin && perm.mode === mode) {
        permissions[perm.permission] = perm.value;
        if (perm.updatedAt > lastUpdated) {
          lastUpdated = perm.updatedAt;
        }
      }
    }

    if (Object.keys(permissions).length === 0) {
      return null;
    }

    return {
      origin: normalizedOrigin,
      permissions: permissions as Record<PermissionType, PermissionValue>,
      mode,
      lastUpdated,
    };
  }

  /**
   * Check if a permission should be allowed based on stored settings
   * Returns null if no preference is stored (should fall back to default)
   */
  async shouldAllow(
    origin: string,
    permission: PermissionType,
    mode: BrowserMode
  ): Promise<boolean | null> {
    const value = await this.getPermission(origin, permission, mode);

    if (value === null) {
      return null; // No preference, use default
    }

    return value === 'allow';
  }

  /**
   * Normalize origin URL to consistent format
   */
  private normalizeOrigin(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Get total number of permission entries
   */
  async getPermissionCount(): Promise<number> {
    await this.load();
    return this.permissions.size;
  }
}
