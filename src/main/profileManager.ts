/**
 * Profile Manager
 * Manages browser profiles with fully isolated data (history, bookmarks, passwords, settings)
 * Each profile has its own subdirectory under userData/profiles/
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ProfileSettings } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';

interface ProfileManagerState {
  activeProfileId: string;
  profiles: ProfileSettings[];
}

export class ProfileManager {
  private profilesDir: string;
  private stateFile: string;
  private state: ProfileManagerState;

  constructor() {
    const userData = app.getPath('userData');
    this.profilesDir = path.join(userData, 'profiles');
    this.stateFile = path.join(userData, 'profiles-state.json');
    this.state = this.loadState();
    this.ensureDefaultProfile();
  }

  /**
   * Load profile manager state from disk
   */
  private loadState(): ProfileManagerState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[ProfileManager] Failed to load state:', error);
    }

    // Return default state
    return {
      activeProfileId: 'default',
      profiles: [],
    };
  }

  /**
   * Save profile manager state to disk
   */
  private saveState(): void {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('[ProfileManager] Failed to save state:', error);
    }
  }

  /**
   * Ensure the default profile exists
   */
  private ensureDefaultProfile(): void {
    const defaultProfile = this.state.profiles.find((p) => p.id === 'default');
    if (!defaultProfile) {
      const profile: ProfileSettings = {
        id: 'default',
        name: 'Default',
        avatar: 'D',
        accentColor: '#E6AC00',
        createdAt: Date.now(),
      };
      this.state.profiles.push(profile);
      this.ensureProfileDirectory(profile.id);
      this.saveState();
    } else {
      this.ensureProfileDirectory('default');
    }
  }

  /**
   * Ensure profile directory exists
   */
  private ensureProfileDirectory(profileId: string): void {
    const profileDir = this.getProfileDataPath(profileId);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
  }

  /**
   * Get the data directory path for a profile
   */
  getProfileDataPath(profileId: string): string {
    return path.join(this.profilesDir, profileId);
  }

  /**
   * Get the data directory path for the active profile
   */
  getActiveProfileDataPath(): string {
    return this.getProfileDataPath(this.state.activeProfileId);
  }

  /**
   * Get the active profile
   */
  getActiveProfile(): ProfileSettings | null {
    return this.state.profiles.find((p) => p.id === this.state.activeProfileId) || null;
  }

  /**
   * Get the active profile ID
   */
  getActiveProfileId(): string {
    return this.state.activeProfileId;
  }

  /**
   * List all profiles
   */
  listProfiles(): ProfileSettings[] {
    return [...this.state.profiles];
  }

  /**
   * Create a new profile
   */
  createProfile(name: string, avatar?: string, accentColor?: string): ProfileSettings {
    const profile: ProfileSettings = {
      id: uuidv4(),
      name: name.trim(),
      avatar: avatar || name.charAt(0).toUpperCase(),
      accentColor: accentColor || this.generateAccentColor(),
      createdAt: Date.now(),
    };

    this.state.profiles.push(profile);
    this.ensureProfileDirectory(profile.id);
    this.saveState();

    console.log(`[ProfileManager] Created profile: ${profile.name} (${profile.id})`);
    return profile;
  }

  /**
   * Delete a profile
   * Cannot delete the default profile
   */
  deleteProfile(profileId: string): boolean {
    if (profileId === 'default') {
      console.error('[ProfileManager] Cannot delete default profile');
      return false;
    }

    const index = this.state.profiles.findIndex((p) => p.id === profileId);
    if (index === -1) {
      console.error(`[ProfileManager] Profile not found: ${profileId}`);
      return false;
    }

    // If deleting active profile, switch to default
    if (this.state.activeProfileId === profileId) {
      this.state.activeProfileId = 'default';
    }

    // Remove from list
    this.state.profiles.splice(index, 1);
    this.saveState();

    // Delete profile directory
    const profileDir = this.getProfileDataPath(profileId);
    try {
      if (fs.existsSync(profileDir)) {
        fs.rmSync(profileDir, { recursive: true });
      }
    } catch (error) {
      console.error(`[ProfileManager] Failed to delete profile directory: ${error}`);
    }

    console.log(`[ProfileManager] Deleted profile: ${profileId}`);
    return true;
  }

  /**
   * Switch to a different profile
   */
  switchProfile(profileId: string): boolean {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    if (!profile) {
      console.error(`[ProfileManager] Profile not found: ${profileId}`);
      return false;
    }

    this.state.activeProfileId = profileId;
    this.ensureProfileDirectory(profileId);
    this.saveState();

    console.log(`[ProfileManager] Switched to profile: ${profile.name} (${profileId})`);
    return true;
  }

  /**
   * Update profile settings
   */
  updateProfile(profileId: string, updates: Partial<Omit<ProfileSettings, 'id' | 'createdAt'>>): ProfileSettings | null {
    const profile = this.state.profiles.find((p) => p.id === profileId);
    if (!profile) {
      return null;
    }

    if (updates.name !== undefined) {
      profile.name = updates.name.trim();
    }
    if (updates.avatar !== undefined) {
      profile.avatar = updates.avatar;
    }
    if (updates.accentColor !== undefined) {
      profile.accentColor = updates.accentColor;
    }

    this.saveState();
    return profile;
  }

  /**
   * Get a specific file path within the active profile's data directory
   */
  getProfileFilePath(filename: string): string {
    return path.join(this.getActiveProfileDataPath(), filename);
  }

  /**
   * Generate a random accent color
   */
  private generateAccentColor(): string {
    const colors = [
      '#E6AC00', // Gold (default)
      '#4ECDC4', // Teal
      '#FF6B6B', // Coral
      '#7dd3fc', // Sky blue
      '#A78BFA', // Purple
      '#F472B6', // Pink
      '#34D399', // Emerald
      '#FB923C', // Orange
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
