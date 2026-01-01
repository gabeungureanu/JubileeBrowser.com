/**
 * Settings Manager
 * Manages application settings with persistence
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserSettings, DEFAULT_SETTINGS } from '../shared/types';

export class SettingsManager {
  private settings: BrowserSettings;
  private dataPath: string;

  constructor() {
    this.dataPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf-8');
        const loaded = JSON.parse(data);
        this.settings = this.mergeSettings(DEFAULT_SETTINGS, loaded);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async save(): Promise<void> {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  getSettings(): BrowserSettings {
    return { ...this.settings };
  }

  getSetting<K extends keyof BrowserSettings>(key: K): BrowserSettings[K] {
    return this.settings[key];
  }

  setSetting<K extends keyof BrowserSettings>(
    key: K,
    value: BrowserSettings[K]
  ): void {
    this.settings[key] = value;
    this.save();
  }

  updateSettings(updates: Partial<BrowserSettings>): void {
    this.settings = this.mergeSettings(this.settings, updates);
    this.save();
  }

  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
  }

  private mergeSettings(
    base: BrowserSettings,
    updates: Partial<BrowserSettings>
  ): BrowserSettings {
    return this.deepMerge(base, updates) as BrowserSettings;
  }

  /**
   * Deep merge two objects, preserving nested structures
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge nested objects
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        // Overwrite with source value
        result[key] = sourceValue;
      }
    }

    return result;
  }
}
