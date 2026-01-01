/**
 * UpdateManager
 * Handles automatic updates for Jubilee Browser using electron-updater.
 * Implements silent background updates with staged installation.
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import { UpdateState, UpdateStatus, UpdateChannel, IPC_CHANNELS } from '../shared/types';

// Update check intervals
const INITIAL_CHECK_DELAY_MS = 30 * 1000; // 30 seconds after launch
const NORMAL_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MIN_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute minimum
const MAX_BACKOFF_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours max backoff

// Update configuration
const UPDATE_CONFIG = {
  allowDowngrade: false,
  allowPrerelease: false,
  autoDownload: true,
  autoInstallOnAppQuit: true,
};

export class UpdateManager {
  private mainWindow: BrowserWindow | null = null;
  private state: UpdateState;
  private checkTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private updateLogPath: string;
  private stateFilePath: string;

  constructor() {
    // Initialize state
    this.state = {
      status: 'idle',
      channel: 'stable',
      currentVersion: app.getVersion(),
      lastCheckTime: undefined,
    };

    // Set up paths for logging and state persistence
    const userDataPath = app.getPath('userData');
    this.updateLogPath = path.join(userDataPath, 'update.log');
    this.stateFilePath = path.join(userDataPath, 'update-state.json');

    // Load persisted state
    this.loadState();

    // Configure auto-updater
    this.configureUpdater();
  }

  /**
   * Initialize the update manager with the main window
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.log('UpdateManager initialized');
    this.log(`Current version: ${this.state.currentVersion}`);
    this.log(`Update channel: ${this.state.channel}`);

    // Start the update check schedule
    this.startUpdateSchedule();
  }

  /**
   * Configure electron-updater settings
   */
  private configureUpdater(): void {
    // Security: Only allow updates from our controlled server
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `https://updates.jubileebrowser.com/releases/${this.state.channel}`,
      channel: this.state.channel,
    });

    // Configure updater behavior
    autoUpdater.autoDownload = UPDATE_CONFIG.autoDownload;
    autoUpdater.autoInstallOnAppQuit = UPDATE_CONFIG.autoInstallOnAppQuit;
    autoUpdater.allowDowngrade = UPDATE_CONFIG.allowDowngrade;
    autoUpdater.allowPrerelease = UPDATE_CONFIG.allowPrerelease;

    // Disable interactive prompts - we handle UI ourselves
    autoUpdater.disableWebInstaller = true;

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for auto-updater events
   */
  private setupEventHandlers(): void {
    // Checking for updates
    autoUpdater.on('checking-for-update', () => {
      this.log('Checking for updates...');
      this.updateState({ status: 'checking' });
    });

    // Update available
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.log(`Update available: ${info.version}`);
      this.consecutiveFailures = 0; // Reset failure counter
      this.updateState({
        status: 'available',
        availableVersion: info.version,
        releaseNotes: typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map(n => n.note).join('\n')
            : undefined,
      });
    });

    // No update available
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.log(`No update available. Current: ${this.state.currentVersion}, Latest: ${info.version}`);
      this.consecutiveFailures = 0; // Reset failure counter
      this.updateState({
        status: 'not-available',
        lastCheckTime: Date.now(),
      });
    });

    // Download progress
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.log(`Download progress: ${progress.percent.toFixed(1)}%`);
      this.updateState({
        status: 'downloading',
        downloadProgress: progress.percent,
      });

      // Send progress to renderer
      this.sendToRenderer(IPC_CHANNELS.UPDATE_PROGRESS, {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    // Update downloaded and ready
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.log(`Update downloaded: ${info.version}`);
      this.updateState({
        status: 'downloaded',
        availableVersion: info.version,
        downloadProgress: 100,
        lastCheckTime: Date.now(),
      });
      this.saveState();
    });

    // Error handling
    autoUpdater.on('error', (error: Error) => {
      this.log(`Update error: ${error.message}`, 'error');
      this.consecutiveFailures++;

      // Don't expose raw error to UI
      const userMessage = this.getUserFriendlyError(error);

      this.updateState({
        status: 'error',
        lastError: userMessage,
        lastCheckTime: Date.now(),
      });

      // Adjust check interval based on failures
      this.rescheduleAfterFailure();
    });
  }

  /**
   * Start the automatic update check schedule
   */
  private startUpdateSchedule(): void {
    // First check after initial delay
    this.checkTimer = setTimeout(() => {
      this.checkForUpdates();

      // Then check on regular interval
      this.scheduleNextCheck(NORMAL_CHECK_INTERVAL_MS);
    }, INITIAL_CHECK_DELAY_MS);

    this.log(`Update check scheduled in ${INITIAL_CHECK_DELAY_MS / 1000} seconds`);
  }

  /**
   * Schedule the next update check
   */
  private scheduleNextCheck(interval: number): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
    }

    this.checkTimer = setTimeout(() => {
      this.checkForUpdates();
      this.scheduleNextCheck(NORMAL_CHECK_INTERVAL_MS);
    }, interval);

    this.log(`Next update check in ${interval / 1000 / 60} minutes`);
  }

  /**
   * Reschedule check with exponential backoff after failure
   */
  private rescheduleAfterFailure(): void {
    const backoffMultiplier = Math.min(this.consecutiveFailures, 6); // Max 6 doublings
    const backoffInterval = Math.min(
      NORMAL_CHECK_INTERVAL_MS * Math.pow(2, backoffMultiplier),
      MAX_BACKOFF_INTERVAL_MS
    );

    this.log(`Rescheduling after failure. Backoff: ${backoffInterval / 1000 / 60} minutes`);
    this.scheduleNextCheck(backoffInterval);
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<void> {
    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      this.log('Update check already in progress');
      return;
    }

    try {
      this.log('Starting update check');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.log(`Failed to check for updates: ${error}`, 'error');
      this.updateState({
        status: 'error',
        lastError: 'Failed to check for updates. Will retry later.',
        lastCheckTime: Date.now(),
      });
      this.consecutiveFailures++;
      this.rescheduleAfterFailure();
    }
  }

  /**
   * Manually trigger update check (from UI)
   */
  async manualCheckForUpdates(): Promise<UpdateState> {
    this.log('Manual update check requested');
    await this.checkForUpdates();
    return this.state;
  }

  /**
   * Install the downloaded update and restart
   */
  async installUpdate(): Promise<void> {
    if (this.state.status !== 'downloaded') {
      this.log('No update downloaded to install');
      return;
    }

    this.log('Installing update and restarting...');

    // Notify renderer before restart
    this.sendToRenderer(IPC_CHANNELS.UPDATE_STATE_CHANGED, {
      ...this.state,
      status: 'installing' as UpdateStatus,
    });

    // Small delay to ensure state is saved
    await new Promise(resolve => setTimeout(resolve, 500));

    // Quit and install
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Get current update state
   */
  getState(): UpdateState {
    return { ...this.state };
  }

  /**
   * Update internal state and notify renderer
   */
  private updateState(updates: Partial<UpdateState>): void {
    this.state = { ...this.state, ...updates };
    this.sendToRenderer(IPC_CHANNELS.UPDATE_STATE_CHANGED, this.state);
  }

  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Convert error to user-friendly message
   */
  private getUserFriendlyError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('enotfound') || message.includes('econnrefused')) {
      return 'Unable to connect to update server. Will retry later.';
    }
    if (message.includes('signature') || message.includes('checksum')) {
      return 'Update verification failed. Will retry later.';
    }
    if (message.includes('disk') || message.includes('enospc')) {
      return 'Insufficient disk space for update.';
    }
    if (message.includes('permission') || message.includes('eacces')) {
      return 'Permission denied. Please run as administrator.';
    }

    return 'Update check failed. Will retry later.';
  }

  /**
   * Log update activity
   */
  private log(message: string, level: 'info' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

    // Console log for development
    if (level === 'error') {
      console.error(`[UpdateManager] ${message}`);
    } else {
      console.log(`[UpdateManager] ${message}`);
    }

    // Write to log file
    try {
      fs.appendFileSync(this.updateLogPath, logLine);

      // Rotate log if too large (> 1MB)
      const stats = fs.statSync(this.updateLogPath);
      if (stats.size > 1024 * 1024) {
        const backupPath = `${this.updateLogPath}.old`;
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.renameSync(this.updateLogPath, backupPath);
      }
    } catch (err) {
      // Ignore logging errors
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    try {
      const stateToSave = {
        channel: this.state.channel,
        lastCheckTime: this.state.lastCheckTime,
        lastKnownGoodVersion: this.state.currentVersion,
        lastAttemptedVersion: this.state.availableVersion,
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(stateToSave, null, 2));
    } catch (err) {
      this.log(`Failed to save update state: ${err}`, 'error');
    }
  }

  /**
   * Load state from disk
   */
  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const saved = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
        if (saved.channel === 'stable' || saved.channel === 'beta') {
          this.state.channel = saved.channel;
        }
        if (saved.lastCheckTime) {
          this.state.lastCheckTime = saved.lastCheckTime;
        }
      }
    } catch (err) {
      // Ignore load errors, use defaults
    }
  }

  /**
   * Clean up on shutdown
   */
  destroy(): void {
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    this.saveState();
  }
}
