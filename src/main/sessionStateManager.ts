/**
 * SessionStateManager
 * Manages browser session state persistence for seamless updates.
 * Saves and restores window state, tabs, and mode on restart.
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SessionState, BrowserMode } from '../shared/types';

const SESSION_STATE_FILE = 'session-state.json';
const MAX_STATE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SessionStateManager {
  private stateFilePath: string;
  private pendingState: SessionState | null = null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.stateFilePath = path.join(userDataPath, SESSION_STATE_FILE);
  }

  /**
   * Save current session state
   */
  saveState(
    mainWindow: BrowserWindow,
    currentMode: BrowserMode,
    tabs: Array<{ id: string; url: string; title: string; mode: BrowserMode; isActive: boolean }>,
    activeTabId?: string
  ): void {
    try {
      const bounds = mainWindow.getBounds();
      const isMaximized = mainWindow.isMaximized();

      const state: SessionState = {
        windowBounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        isMaximized,
        currentMode,
        tabs: tabs.map(tab => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          mode: tab.mode,
          isActive: tab.isActive,
        })),
        activeTabId,
        timestamp: Date.now(),
      };

      this.pendingState = state;
      this.debouncedSave();
    } catch (error) {
      console.error('[SessionStateManager] Failed to capture state:', error);
    }
  }

  /**
   * Debounced save to avoid excessive disk writes
   */
  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.flushState();
    }, 1000);
  }

  /**
   * Immediately flush pending state to disk
   */
  flushState(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    if (!this.pendingState) {
      return;
    }

    try {
      const stateJson = JSON.stringify(this.pendingState, null, 2);
      fs.writeFileSync(this.stateFilePath, stateJson, 'utf-8');
      console.log('[SessionStateManager] State saved successfully');
    } catch (error) {
      console.error('[SessionStateManager] Failed to save state:', error);
    }
  }

  /**
   * Load previously saved session state
   */
  loadState(): SessionState | null {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        console.log('[SessionStateManager] No saved state found');
        return null;
      }

      const stateJson = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state: SessionState = JSON.parse(stateJson);

      // Validate state age
      if (Date.now() - state.timestamp > MAX_STATE_AGE_MS) {
        console.log('[SessionStateManager] Saved state is too old, discarding');
        this.clearState();
        return null;
      }

      // Validate state structure
      if (!this.validateState(state)) {
        console.log('[SessionStateManager] Invalid state structure, discarding');
        this.clearState();
        return null;
      }

      console.log('[SessionStateManager] State loaded successfully');
      return state;
    } catch (error) {
      console.error('[SessionStateManager] Failed to load state:', error);
      return null;
    }
  }

  /**
   * Validate state structure
   */
  private validateState(state: any): state is SessionState {
    return (
      state &&
      typeof state === 'object' &&
      state.windowBounds &&
      typeof state.windowBounds.x === 'number' &&
      typeof state.windowBounds.y === 'number' &&
      typeof state.windowBounds.width === 'number' &&
      typeof state.windowBounds.height === 'number' &&
      typeof state.isMaximized === 'boolean' &&
      (state.currentMode === 'internet' || state.currentMode === 'jubileebibles') &&
      Array.isArray(state.tabs) &&
      typeof state.timestamp === 'number'
    );
  }

  /**
   * Clear saved state
   */
  clearState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
        console.log('[SessionStateManager] State cleared');
      }
    } catch (error) {
      console.error('[SessionStateManager] Failed to clear state:', error);
    }
  }

  /**
   * Check if there's a pending restore (after update)
   */
  hasPendingRestore(): boolean {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return false;
      }

      const stateJson = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state: SessionState = JSON.parse(stateJson);

      // Only restore if state is recent (within last 5 minutes - typical update window)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      return state.timestamp > fiveMinutesAgo;
    } catch {
      return false;
    }
  }

  /**
   * Get window bounds for restoration
   */
  getWindowBounds(): { x: number; y: number; width: number; height: number } | null {
    const state = this.loadState();
    return state?.windowBounds || null;
  }

  /**
   * Get maximized state for restoration
   */
  getMaximizedState(): boolean {
    const state = this.loadState();
    return state?.isMaximized || false;
  }

  /**
   * Prepare for update - ensure state is saved
   */
  prepareForUpdate(
    mainWindow: BrowserWindow,
    currentMode: BrowserMode,
    tabs: Array<{ id: string; url: string; title: string; mode: BrowserMode; isActive: boolean }>,
    activeTabId?: string
  ): void {
    console.log('[SessionStateManager] Preparing for update, saving state...');
    this.saveState(mainWindow, currentMode, tabs, activeTabId);
    this.flushState(); // Immediate flush before update
  }
}
