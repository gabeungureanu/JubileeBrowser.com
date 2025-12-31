/**
 * FirstRunManager
 * Handles first-run experience after installation or update.
 * Initializes user profile, sets safe defaults, and ensures smooth onboarding.
 */

import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserSettings, DEFAULT_SETTINGS } from '../shared/types';

const FIRST_RUN_FLAG_FILE = '.first-run';
const INSTALL_INFO_FILE = 'install-info.json';

interface InstallInfo {
  installedVersion: string;
  installDate: string;
  installType: 'fresh' | 'upgrade' | 'repair';
  previousVersion?: string;
  firstRunCompleted: boolean;
  autoUpdateEnabled: boolean;
}

export class FirstRunManager {
  private userDataPath: string;
  private installPath: string;
  private isFirstRun: boolean = false;
  private installInfo: InstallInfo | null = null;

  constructor() {
    this.userDataPath = app.getPath('userData');
    this.installPath = app.getAppPath();
  }

  /**
   * Check if this is a first run and initialize accordingly
   */
  async initialize(): Promise<boolean> {
    this.isFirstRun = this.checkFirstRun();
    this.loadInstallInfo();

    if (this.isFirstRun) {
      console.log('[FirstRunManager] First run detected, initializing...');
      await this.performFirstRunSetup();
    } else {
      console.log('[FirstRunManager] Existing installation detected');
    }

    return this.isFirstRun;
  }

  /**
   * Check if this is a first run by looking for the flag file
   */
  private checkFirstRun(): boolean {
    // Check for .first-run flag in install directory (set by installer)
    const installFlagPath = path.join(this.installPath, '..', FIRST_RUN_FLAG_FILE);
    const exeFlagPath = path.join(path.dirname(process.execPath), FIRST_RUN_FLAG_FILE);

    // Check for install info in user data (indicates previous run)
    const installInfoPath = path.join(this.userDataPath, INSTALL_INFO_FILE);

    // First run if: flag file exists OR no install info exists
    const flagExists = fs.existsSync(installFlagPath) || fs.existsSync(exeFlagPath);
    const installInfoExists = fs.existsSync(installInfoPath);

    if (flagExists) {
      // Remove the flag file
      try {
        if (fs.existsSync(installFlagPath)) {
          fs.unlinkSync(installFlagPath);
        }
        if (fs.existsSync(exeFlagPath)) {
          fs.unlinkSync(exeFlagPath);
        }
      } catch (err) {
        console.error('[FirstRunManager] Failed to remove first-run flag:', err);
      }
      return true;
    }

    return !installInfoExists;
  }

  /**
   * Load or create install info
   */
  private loadInstallInfo(): void {
    const installInfoPath = path.join(this.userDataPath, INSTALL_INFO_FILE);

    try {
      if (fs.existsSync(installInfoPath)) {
        const data = fs.readFileSync(installInfoPath, 'utf-8');
        this.installInfo = JSON.parse(data);

        // Check if this is an upgrade
        if (this.installInfo && this.installInfo.installedVersion !== app.getVersion()) {
          console.log(`[FirstRunManager] Upgrade detected: ${this.installInfo.installedVersion} -> ${app.getVersion()}`);
          this.installInfo.previousVersion = this.installInfo.installedVersion;
          this.installInfo.installedVersion = app.getVersion();
          this.installInfo.installType = 'upgrade';
          this.installInfo.installDate = new Date().toISOString();
          this.saveInstallInfo();
        }
      }
    } catch (err) {
      console.error('[FirstRunManager] Failed to load install info:', err);
    }
  }

  /**
   * Perform first-run setup
   */
  private async performFirstRunSetup(): Promise<void> {
    console.log('[FirstRunManager] Performing first-run setup...');

    // 1. Ensure user data directory exists
    this.ensureUserDataDirectory();

    // 2. Create install info
    this.createInstallInfo();

    // 3. Initialize default settings
    await this.initializeDefaultSettings();

    // 4. Create profile directories
    this.createProfileDirectories();

    // 5. Mark first run as completed
    this.markFirstRunCompleted();

    console.log('[FirstRunManager] First-run setup completed');
  }

  /**
   * Ensure user data directory structure exists
   */
  private ensureUserDataDirectory(): void {
    const directories = [
      this.userDataPath,
      path.join(this.userDataPath, 'profiles'),
      path.join(this.userDataPath, 'profiles', 'default'),
      path.join(this.userDataPath, 'cache'),
      path.join(this.userDataPath, 'logs'),
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[FirstRunManager] Created directory: ${dir}`);
      }
    }
  }

  /**
   * Create initial install info
   */
  private createInstallInfo(): void {
    this.installInfo = {
      installedVersion: app.getVersion(),
      installDate: new Date().toISOString(),
      installType: 'fresh',
      firstRunCompleted: false,
      autoUpdateEnabled: true,
    };

    this.saveInstallInfo();
  }

  /**
   * Save install info to disk
   */
  private saveInstallInfo(): void {
    if (!this.installInfo) return;

    const installInfoPath = path.join(this.userDataPath, INSTALL_INFO_FILE);
    try {
      fs.writeFileSync(installInfoPath, JSON.stringify(this.installInfo, null, 2));
    } catch (err) {
      console.error('[FirstRunManager] Failed to save install info:', err);
    }
  }

  /**
   * Initialize default settings
   */
  private async initializeDefaultSettings(): Promise<void> {
    const settingsPath = path.join(this.userDataPath, 'settings.json');

    if (!fs.existsSync(settingsPath)) {
      // Create default settings
      const settings: BrowserSettings = { ...DEFAULT_SETTINGS };

      try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('[FirstRunManager] Created default settings');
      } catch (err) {
        console.error('[FirstRunManager] Failed to create default settings:', err);
      }
    }
  }

  /**
   * Create profile directories
   */
  private createProfileDirectories(): void {
    const profileDirs = [
      path.join(this.userDataPath, 'profiles', 'default', 'bookmarks'),
      path.join(this.userDataPath, 'profiles', 'default', 'history'),
      path.join(this.userDataPath, 'profiles', 'default', 'sessions'),
    ];

    for (const dir of profileDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Mark first run as completed
   */
  private markFirstRunCompleted(): void {
    if (this.installInfo) {
      this.installInfo.firstRunCompleted = true;
      this.saveInstallInfo();
    }
  }

  /**
   * Get whether this is a first run
   */
  getIsFirstRun(): boolean {
    return this.isFirstRun;
  }

  /**
   * Get install info
   */
  getInstallInfo(): InstallInfo | null {
    return this.installInfo;
  }

  /**
   * Check if auto-update is enabled
   */
  isAutoUpdateEnabled(): boolean {
    return this.installInfo?.autoUpdateEnabled ?? true;
  }

  /**
   * Get install type
   */
  getInstallType(): 'fresh' | 'upgrade' | 'repair' | undefined {
    return this.installInfo?.installType;
  }

  /**
   * Get previous version (for upgrades)
   */
  getPreviousVersion(): string | undefined {
    return this.installInfo?.previousVersion;
  }
}
