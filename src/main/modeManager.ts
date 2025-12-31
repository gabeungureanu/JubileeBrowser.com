/**
 * Mode Manager
 * Handles switching between Internet and JubileeBibles modes
 */

import { BrowserWindow } from 'electron';
import { BrowserMode, IPC_CHANNELS } from '../shared/types';
import { SettingsManager } from './settingsManager';

export type ModeChangeListener = (newMode: BrowserMode, oldMode: BrowserMode) => void;

export class ModeManager {
  private currentMode: BrowserMode;
  private listeners: Set<ModeChangeListener> = new Set();
  private settingsManager: SettingsManager;
  private mainWindow: BrowserWindow | null = null;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
    this.currentMode = settingsManager.getSettings().defaultMode;
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  getCurrentMode(): BrowserMode {
    return this.currentMode;
  }

  switchMode(newMode: BrowserMode): boolean {
    if (newMode === this.currentMode) {
      return false;
    }

    const oldMode = this.currentMode;
    this.currentMode = newMode;

    // Notify all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(newMode, oldMode);
      } catch (error) {
        console.error('Mode change listener error:', error);
      }
    });

    // Notify renderer process
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.MODE_CHANGED, {
        mode: newMode,
        previousMode: oldMode,
      });
    }

    return true;
  }

  toggleMode(): BrowserMode {
    const newMode = this.currentMode === 'internet' ? 'jubileebibles' : 'internet';
    this.switchMode(newMode);
    return newMode;
  }

  addChangeListener(listener: ModeChangeListener): void {
    this.listeners.add(listener);
  }

  removeChangeListener(listener: ModeChangeListener): void {
    this.listeners.delete(listener);
  }

  // Get the session partition name for the current mode
  getSessionPartition(): string {
    return `persist:${this.currentMode}`;
  }

  // Check if a URL is valid for the current mode
  isUrlValidForMode(url: string, mode?: BrowserMode): boolean {
    const targetMode = mode ?? this.currentMode;

    if (targetMode === 'jubileebibles') {
      // In JubileeBibles mode, only inspire:// URLs and internal resources
      return (
        url.startsWith('inspire://') ||
        url.startsWith('about:') ||
        url.startsWith('file://') ||
        url.startsWith('data:')
      );
    }

    // In Internet mode, standard web protocols
    return (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('about:') ||
      url.startsWith('file://') ||
      url.startsWith('data:')
    );
  }

  // Get the homepage for a specific mode
  getHomepage(mode?: BrowserMode): string {
    const targetMode = mode ?? this.currentMode;
    const settings = this.settingsManager.getSettings();
    return settings.homepage[targetMode];
  }
}
