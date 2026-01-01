/**
 * JubileeBrowser Main Process
 * Entry point for the Electron application
 */

import { app, BrowserWindow, session, ipcMain, globalShortcut, dialog } from 'electron';
import * as path from 'path';

// Handle uncaught exceptions gracefully to prevent EPIPE errors
process.on('uncaughtException', (error) => {
  // Ignore EPIPE errors (broken pipe from closed parent process)
  if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
    return;
  }
  // For other errors, show dialog if possible
  if (app.isReady()) {
    dialog.showErrorBox('Application Error', `An unexpected error occurred:\n${error.message}`);
  }
  console.error('Uncaught exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
import { WindowManager } from './windowManager';
import { TabManager } from './tabManager';
import { ModeManager } from './modeManager';
import { InspireResolver } from './inspireResolver';
import { HistoryManager } from './historyManager';
import { BookmarkManager } from './bookmarkManager';
import { NavigationInterceptor } from './navigationInterceptor';
import { IPCHandler } from './ipcHandler';
import { SettingsManager } from './settingsManager';
import { BlacklistManager } from './blacklistManager';
import { UpdateManager } from './updateManager';
import { SessionStateManager } from './sessionStateManager';
import { FirstRunManager } from './firstRunManager';
import { InternalPageHandler } from './internalPageHandler';

class JubileeBrowser {
  private windowManager!: WindowManager;
  private tabManager!: TabManager;
  private modeManager!: ModeManager;
  private inspireResolver!: InspireResolver;
  private historyManager!: HistoryManager;
  private bookmarkManager!: BookmarkManager;
  private navigationInterceptor!: NavigationInterceptor;
  private ipcHandler!: IPCHandler;
  private settingsManager!: SettingsManager;
  private blacklistManager!: BlacklistManager;
  private updateManager!: UpdateManager;
  private sessionStateManager!: SessionStateManager;
  private firstRunManager!: FirstRunManager;
  private internalPageHandler!: InternalPageHandler;
  private mainWindow: BrowserWindow | null = null;

  async initialize(): Promise<void> {
    // Set app name and Windows App User Model ID BEFORE app is ready
    // This ensures proper taskbar identity on Windows
    app.setName('Jubilee Browser');

    // Windows App User Model ID - critical for taskbar grouping and identification
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.jubileebrowser.jubilee');
    }

    // Wait for app to be ready before initializing managers
    // (app.getPath requires app to be ready)
    await app.whenReady();

    // Initialize first-run manager and perform setup if needed
    this.firstRunManager = new FirstRunManager();
    const isFirstRun = await this.firstRunManager.initialize();

    if (isFirstRun) {
      console.log('[JubileeBrowser] First run detected - welcome to Jubilee Browser!');
    }

    // Initialize managers after app is ready
    this.settingsManager = new SettingsManager();
    this.inspireResolver = new InspireResolver();
    this.internalPageHandler = new InternalPageHandler();
    this.internalPageHandler.setSettingsManager(this.settingsManager);
    this.modeManager = new ModeManager(this.settingsManager);
    this.historyManager = new HistoryManager();
    this.bookmarkManager = new BookmarkManager();
    this.blacklistManager = new BlacklistManager();
    this.windowManager = new WindowManager(); // Now safe to call - app is ready
    this.tabManager = new TabManager(this.modeManager, this.inspireResolver);
    this.navigationInterceptor = new NavigationInterceptor(
      this.modeManager,
      this.inspireResolver,
      this.historyManager,
      this.blacklistManager
    );
    this.ipcHandler = new IPCHandler(
      this.tabManager,
      this.modeManager,
      this.historyManager,
      this.bookmarkManager,
      this.inspireResolver,
      this.windowManager,
      this.settingsManager
    );

    // Initialize update and session managers
    this.updateManager = new UpdateManager();
    this.sessionStateManager = new SessionStateManager();

    // Inject managers into IPC handler
    this.ipcHandler.setUpdateManager(this.updateManager);
    this.ipcHandler.setSessionStateManager(this.sessionStateManager);

    // Configure security settings
    this.configureSecurityPolicy();

    // Set up session partitions for mode isolation
    this.setupSessionPartitions();

    // Register window close handlers BEFORE creating window
    // Using sync handler which is guaranteed to work
    ipcMain.on('window:close-sync', (event) => {
      console.log('MAIN: window:close-sync received');
      event.returnValue = true; // Required for sendSync
      if (this.mainWindow) {
        this.windowManager.saveWindowState();
        this.mainWindow.destroy();
        app.quit();
      }
    });

    // Also handle async version as fallback
    ipcMain.on('window:close', () => {
      console.log('MAIN: window:close received directly');
      if (this.mainWindow) {
        this.windowManager.saveWindowState();
        this.mainWindow.destroy();
        app.quit();
      }
    });

    // Step 1: Create window WITHOUT loading content
    this.mainWindow = this.windowManager.createWindowOnly();

    // Step 2: Initialize ALL IPC handlers BEFORE loading content
    this.ipcHandler.initialize(this.mainWindow);

    // Step 3: Set up navigation interception
    this.navigationInterceptor.initialize(this.mainWindow);

    // Step 4: Initialize tab manager with the main window
    this.tabManager.initialize(this.mainWindow);

    // Step 5: NOW load the content - IPC handlers are ready
    await this.windowManager.loadContent();

    // Step 6: Initialize the update manager (starts background update checks)
    this.updateManager.initialize(this.mainWindow);

    // Handle app activation (macOS)
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.mainWindow = await this.windowManager.createMainWindow();
      }
    });

    // Handle window close
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle before quit - save state
    app.on('before-quit', async () => {
      // Clean up update manager
      this.updateManager.destroy();

      // Flush session state
      this.sessionStateManager.flushState();

      // Save other managers
      await this.historyManager.save();
      await this.bookmarkManager.save();
      await this.settingsManager.save();
    });
  }

  private configureSecurityPolicy(): void {
    // Prevent new windows from being created via window.open
    app.on('web-contents-created', (_, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        // Handle new window requests through our tab system
        if (this.mainWindow) {
          this.tabManager.createTab(url);
        }
        return { action: 'deny' };
      });

      // Prevent navigation to unexpected protocols
      contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        const allowedProtocols = ['http:', 'https:', 'inspire:', 'jubilee:', 'file:'];

        if (!allowedProtocols.includes(parsedUrl.protocol)) {
          event.preventDefault();
        }
      });
    });
  }

  private setupSessionPartitions(): void {
    // Create separate sessions for Internet and JubileeBibles modes
    // This ensures complete isolation of cookies, storage, and cache

    // Internet mode session
    const internetSession = session.fromPartition('persist:internet');
    internetSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['clipboard-read', 'clipboard-write', 'notifications'];
      callback(allowedPermissions.includes(permission));
    });

    // JubileeBibles mode session
    const jubileebiblesSession = session.fromPartition('persist:jubileebibles');
    jubileebiblesSession.setPermissionRequestHandler((webContents, permission, callback) => {
      // JubileeBibles may have different permission rules
      const allowedPermissions = ['clipboard-read', 'clipboard-write', 'notifications'];
      callback(allowedPermissions.includes(permission));
    });

    // Register custom protocol handler for inspire:// (JubileeBibles only)
    jubileebiblesSession.protocol.registerStringProtocol('inspire', (request, callback) => {
      const resolution = this.inspireResolver.resolveSync(request.url);
      if (resolution.success && resolution.content) {
        callback({
          mimeType: 'text/html',
          data: resolution.content,
        });
      } else {
        callback({
          mimeType: 'text/html',
          data: this.inspireResolver.getErrorPage(resolution.errorMessage || 'Unknown error'),
        });
      }
    });

    // Register jubilee:// protocol for internal browser pages (both sessions)
    // This enables jubilee://settings and other internal pages
    const registerJubileeProtocol = (ses: Electron.Session) => {
      ses.protocol.registerStringProtocol('jubilee', (request, callback) => {
        const content = this.internalPageHandler.handle(request.url);
        callback({
          mimeType: 'text/html',
          data: content,
        });
      });
    };

    registerJubileeProtocol(internetSession);
    registerJubileeProtocol(jubileebiblesSession);
  }
}

// Create and start the application
const browser = new JubileeBrowser();
browser.initialize().catch((error) => {
  console.error('Failed to initialize JubileeBrowser:', error);
  app.quit();
});
