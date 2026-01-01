/**
 * Window Manager
 * Handles Electron window creation and management with state persistence
 */

import { BrowserWindow, screen, app, session, webContents } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Track if we're quitting to avoid save loops
let isQuitting = false;

// Window mode type
export type WindowMode = 'internet' | 'jubileebibles';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Track all browser windows and their modes
interface ManagedWindow {
  window: BrowserWindow;
  mode: WindowMode;
  isJubileeWindow: boolean;
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private windowStatePath: string;
  private windowState: WindowState;
  private managedWindows: Map<number, ManagedWindow> = new Map();
  private jubileeWindowCount: number = 0;

  constructor() {
    this.windowStatePath = path.join(app.getPath('userData'), 'window-state.json');
    this.windowState = this.loadWindowState();
  }

  private loadWindowState(): WindowState {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const defaultState: WindowState = {
      width: Math.min(1400, Math.floor(width * 0.9)),
      height: Math.min(900, Math.floor(height * 0.9)),
      isMaximized: false,
    };

    try {
      if (fs.existsSync(this.windowStatePath)) {
        const data = fs.readFileSync(this.windowStatePath, 'utf-8');
        const savedState = JSON.parse(data) as WindowState;

        // Validate that the saved position is still on screen
        if (this.isPositionOnScreen(savedState)) {
          return { ...defaultState, ...savedState };
        }
      }
    } catch (error) {
      console.error('Failed to load window state:', error);
    }

    return defaultState;
  }

  private isPositionOnScreen(state: WindowState): boolean {
    if (state.x === undefined || state.y === undefined) {
      return true; // Let the OS position the window
    }

    const displays = screen.getAllDisplays();
    return displays.some((display) => {
      const { x, y, width, height } = display.bounds;
      return (
        state.x! >= x &&
        state.x! < x + width &&
        state.y! >= y &&
        state.y! < y + height
      );
    });
  }

  saveWindowState(): void {
    if (!this.mainWindow) return;

    try {
      const isMaximized = this.mainWindow.isMaximized();

      // Only save bounds if not maximized (to remember the restored size)
      if (!isMaximized) {
        const bounds = this.mainWindow.getBounds();
        this.windowState = {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: false,
        };
      } else {
        this.windowState.isMaximized = true;
      }

      const dir = path.dirname(this.windowStatePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.windowStatePath, JSON.stringify(this.windowState, null, 2));
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }

  // Create window without loading content - allows IPC handlers to be registered first
  createWindowOnly(): BrowserWindow {
    // Get the icon path - use .ico on Windows, .png on other platforms
    const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    const iconPath = path.join(__dirname, '../../assets', iconExt);

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: this.windowState.width,
      height: this.windowState.height,
      minWidth: 800,
      minHeight: 300,
      title: 'Jubilee Browser', // Window title for taskbar
      frame: false, // Custom title bar
      titleBarStyle: 'hidden',
      backgroundColor: '#1a1a2e',
      icon: iconPath, // Application icon
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Disabled to allow IPC to work properly
        preload: path.join(__dirname, '../preload/preload.js'),
        webviewTag: true, // Enable webview for tab content
        spellcheck: true,
      },
      show: false, // Don't show until ready
    };

    // Add position if saved
    if (this.windowState.x !== undefined && this.windowState.y !== undefined) {
      windowOptions.x = this.windowState.x;
      windowOptions.y = this.windowState.y;
    }

    this.mainWindow = new BrowserWindow(windowOptions);

    // Maximize if was maximized before
    if (this.windowState.isMaximized) {
      this.mainWindow.maximize();
    }

    // Track window state changes
    this.mainWindow.on('resize', () => this.saveWindowState());
    this.mainWindow.on('move', () => this.saveWindowState());
    this.mainWindow.on('maximize', () => this.saveWindowState());
    this.mainWindow.on('unmaximize', () => this.saveWindowState());

    // Handle window close - save state before closing
    this.mainWindow.on('close', () => {
      this.saveWindowState();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  // Load content into the window - call this AFTER IPC handlers are registered
  async loadContent(): Promise<void> {
    if (!this.mainWindow) return;

    const uiPath = path.join(__dirname, '../renderer/index.html');
    await this.mainWindow.loadFile(uiPath);

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });
  }

  async createMainWindow(): Promise<BrowserWindow> {
    // For backwards compatibility - creates window and loads content
    const window = this.createWindowOnly();
    await this.loadContent();
    return window;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  minimize(): void {
    this.mainWindow?.minimize();
  }

  maximize(): void {
    if (this.mainWindow?.isMaximized()) {
      this.mainWindow.unmaximize();
    } else {
      this.mainWindow?.maximize();
    }
  }

  close(): void {
    if (this.mainWindow && !isQuitting) {
      isQuitting = true;
      this.saveWindowState();
      this.mainWindow.close();
      app.quit();
    }
  }

  isMaximized(): boolean {
    return this.mainWindow?.isMaximized() ?? false;
  }

  /**
   * Creates a new Internet mode browser window
   * Uses the standard persist:internet session partition
   */
  async createNewWindow(): Promise<BrowserWindow> {
    return this.createBrowserWindow('internet', false);
  }

  /**
   * Creates a new Jubilee Bible window with isolated session
   * This window runs in jubileebibles mode with a separate session context
   * providing privacy through isolation, not anonymity
   */
  async createNewJubileeWindow(): Promise<BrowserWindow> {
    this.jubileeWindowCount++;
    return this.createBrowserWindow('jubileebibles', true);
  }

  /**
   * Creates a browser window with the specified mode and session isolation
   */
  private async createBrowserWindow(mode: WindowMode, isJubileeWindow: boolean): Promise<BrowserWindow> {
    // Get the icon path - use .ico on Windows, .png on other platforms
    const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    const iconPath = path.join(__dirname, '../../assets', iconExt);

    // Calculate offset for new window (cascade effect)
    const windowCount = BrowserWindow.getAllWindows().length;
    const offset = windowCount * 30;

    // Get default dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const defaultWidth = Math.min(1400, Math.floor(screenWidth * 0.85));
    const defaultHeight = Math.min(900, Math.floor(screenHeight * 0.85));

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: defaultWidth,
      height: defaultHeight,
      x: 50 + offset,
      y: 50 + offset,
      minWidth: 800,
      minHeight: 300,
      title: isJubileeWindow ? 'Jubilee Browser (Jubilee Bible)' : 'Jubilee Browser', // Window title
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: isJubileeWindow ? '#2a1f0a' : '#1a1a2e', // Gold-tinted bg for Jubilee windows
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: path.join(__dirname, '../preload/preload.js'),
        webviewTag: true,
        spellcheck: true,
      },
      show: false,
    };

    const newWindow = new BrowserWindow(windowOptions);

    // Track this window
    this.managedWindows.set(newWindow.id, {
      window: newWindow,
      mode,
      isJubileeWindow,
    });

    // Clean up on close
    newWindow.on('closed', () => {
      this.managedWindows.delete(newWindow.id);
    });

    // Load content with mode parameter
    const uiPath = path.join(__dirname, '../renderer/index.html');
    const queryParams = `?mode=${mode}&isJubileeWindow=${isJubileeWindow}`;
    await newWindow.loadFile(uiPath, { query: { mode, isJubileeWindow: String(isJubileeWindow) } });

    // Show when ready
    newWindow.once('ready-to-show', () => {
      newWindow.show();
    });

    return newWindow;
  }

  /**
   * Gets the mode for a specific window
   */
  getWindowMode(windowId: number): WindowMode | null {
    const managed = this.managedWindows.get(windowId);
    return managed?.mode ?? null;
  }

  /**
   * Checks if a window is a Jubilee Bible window
   */
  isJubileeBibleWindow(windowId: number): boolean {
    const managed = this.managedWindows.get(windowId);
    return managed?.isJubileeWindow ?? false;
  }

  /**
   * Gets all managed windows
   */
  getAllManagedWindows(): ManagedWindow[] {
    return Array.from(this.managedWindows.values());
  }

  /**
   * Gets the current zoom level of the focused webview
   */
  getZoomLevel(): number {
    if (!this.mainWindow) return 1;
    return this.mainWindow.webContents.getZoomFactor();
  }

  /**
   * Sets the zoom level for the focused webview
   */
  setZoomLevel(factor: number): void {
    if (!this.mainWindow) return;
    // Clamp between 0.25 (25%) and 5 (500%)
    const clampedFactor = Math.max(0.25, Math.min(5, factor));
    this.mainWindow.webContents.setZoomFactor(clampedFactor);
  }

  /**
   * Triggers print dialog for the current window
   */
  print(): void {
    if (this.mainWindow) {
      // Send message to renderer to print the active webview
      this.mainWindow.webContents.send('menu:print');
    }
  }
}
