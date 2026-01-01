/**
 * IPC Handler
 * Handles all IPC communication between main and renderer processes
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  IPC_CHANNELS,
  BrowserMode,
  TabState,
  TabGroupColor,
  SignInRequest,
  ParticipationFeature,
  JubileeUserProfile,
} from '../shared/types';
import { TabManager } from './tabManager';
import { ModeManager } from './modeManager';
import { HistoryManager } from './historyManager';
import { BookmarkManager } from './bookmarkManager';
import { InspireResolver } from './inspireResolver';
import { WindowManager } from './windowManager';
import { SettingsManager } from './settingsManager';
import { UpdateManager } from './updateManager';
import { SessionStateManager } from './sessionStateManager';
import { AuthenticationManager, getAuthenticationManager } from './authenticationManager';

export class IPCHandler {
  private tabManager: TabManager;
  private modeManager: ModeManager;
  private historyManager: HistoryManager;
  private bookmarkManager: BookmarkManager;
  private inspireResolver: InspireResolver;
  private windowManager: WindowManager;
  private settingsManager: SettingsManager;
  private updateManager: UpdateManager | null = null;
  private sessionStateManager: SessionStateManager | null = null;
  private authManager: AuthenticationManager;
  private mainWindow: BrowserWindow | null = null;

  constructor(
    tabManager: TabManager,
    modeManager: ModeManager,
    historyManager: HistoryManager,
    bookmarkManager: BookmarkManager,
    inspireResolver: InspireResolver,
    windowManager: WindowManager,
    settingsManager: SettingsManager
  ) {
    this.tabManager = tabManager;
    this.modeManager = modeManager;
    this.historyManager = historyManager;
    this.bookmarkManager = bookmarkManager;
    this.inspireResolver = inspireResolver;
    this.windowManager = windowManager;
    this.settingsManager = settingsManager;
    this.authManager = getAuthenticationManager();
  }

  /**
   * Set the update manager (injected after construction)
   */
  setUpdateManager(updateManager: UpdateManager): void {
    this.updateManager = updateManager;
  }

  /**
   * Set the session state manager (injected after construction)
   */
  setSessionStateManager(sessionStateManager: SessionStateManager): void {
    this.sessionStateManager = sessionStateManager;
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.modeManager.initialize(mainWindow);
    this.registerHandlers();

    // Initialize authentication manager with main window
    this.authManager.initialize(mainWindow);
  }

  private registerHandlers(): void {
    // Tab management
    ipcMain.handle(IPC_CHANNELS.TAB_CREATE, (_, url?: string) => {
      const tabId = this.tabManager.createTab(url);
      return { tabId, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_CLOSE, (_, tabId: string) => {
      const success = this.tabManager.closeTab(tabId);
      return { success, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_SWITCH, (_, tabId: string) => {
      const success = this.tabManager.switchTab(tabId);
      return { success, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_LIST, () => {
      return this.tabManager.getTabList();
    });

    // Tab context menu actions
    ipcMain.handle(IPC_CHANNELS.TAB_DUPLICATE, (_, tabId: string) => {
      const newTabId = this.tabManager.duplicateTab(tabId);
      return { success: !!newTabId, tabId: newTabId, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_PIN, (_, tabId: string) => {
      const success = this.tabManager.pinTab(tabId);
      return { success, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_UNPIN, (_, tabId: string) => {
      const success = this.tabManager.unpinTab(tabId);
      return { success, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_MUTE, (_, tabId: string) => {
      const success = this.tabManager.muteTab(tabId);
      return { success, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_UNMUTE, (_, tabId: string) => {
      const success = this.tabManager.unmuteTab(tabId);
      return { success, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_CLOSE_OTHERS, (_, tabId: string) => {
      const closedCount = this.tabManager.closeOtherTabs(tabId);
      return { success: true, closedCount, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_CLOSE_TO_RIGHT, (_, tabId: string) => {
      const closedCount = this.tabManager.closeTabsToRight(tabId);
      return { success: true, closedCount, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_REOPEN_CLOSED, () => {
      const closedTab = this.tabManager.reopenClosedTab();
      return { success: !!closedTab, closedTab, tabs: this.tabManager.getTabList() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_GET_CLOSED, () => {
      return { closedTabs: this.tabManager.getClosedTabs(), hasClosedTabs: this.tabManager.hasClosedTabs() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_ADD_TO_GROUP, (_, data: { tabId: string; groupId: string }) => {
      const success = this.tabManager.addTabToGroup(data.tabId, data.groupId);
      return { success, tabs: this.tabManager.getTabList(), groups: this.tabManager.getGroups() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_REMOVE_FROM_GROUP, (_, tabId: string) => {
      const success = this.tabManager.removeTabFromGroup(tabId);
      return { success, tabs: this.tabManager.getTabList(), groups: this.tabManager.getGroups() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_CREATE_GROUP, (_, data: { name: string; color: TabGroupColor }) => {
      const groupId = this.tabManager.createGroup(data.name, data.color);
      return { success: true, groupId, groups: this.tabManager.getGroups() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_GET_GROUPS, () => {
      return { groups: this.tabManager.getGroups() };
    });

    ipcMain.handle(IPC_CHANNELS.TAB_MOVE_TO_NEW_WINDOW, async (_, tabId: string) => {
      try {
        const tabInfo = this.tabManager.getTabInfo(tabId);
        if (!tabInfo) {
          return { success: false, error: 'Tab not found' };
        }

        // Close the tab from current window
        this.tabManager.closeTab(tabId, false); // Don't save for restore since we're moving it

        // Create new window with the tab's content
        if (tabInfo.mode === 'jubileebibles') {
          const newWindow = await this.windowManager.createNewJubileeWindow();
          // The new window will load with the default jubileebibles home
          // We'll need to navigate it to the tab's URL
        } else {
          const newWindow = await this.windowManager.createNewWindow();
        }

        return { success: true };
      } catch (error) {
        console.error('Failed to move tab to new window:', error);
        return { success: false, error: String(error) };
      }
    });

    // Navigation
    ipcMain.handle(IPC_CHANNELS.NAV_GO, (_, url: string) => {
      this.tabManager.navigateTo(url);
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.NAV_BACK, () => {
      this.tabManager.goBack();
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.NAV_FORWARD, () => {
      this.tabManager.goForward();
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.NAV_RELOAD, () => {
      this.tabManager.reload();
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.NAV_HARD_RELOAD, () => {
      this.tabManager.hardReload();
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.NAV_STOP, () => {
      this.tabManager.stop();
      return { success: true };
    });

    // Mode switching
    ipcMain.handle(IPC_CHANNELS.MODE_SWITCH, (_, mode: BrowserMode) => {
      const success = this.modeManager.switchMode(mode);
      return { success, mode: this.modeManager.getCurrentMode() };
    });

    ipcMain.handle(IPC_CHANNELS.MODE_GET, () => {
      return { mode: this.modeManager.getCurrentMode() };
    });

    // History
    ipcMain.handle(IPC_CHANNELS.HISTORY_GET, (_, mode?: BrowserMode, limit?: number) => {
      return this.historyManager.getHistory(mode, limit);
    });

    ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, (_, mode?: BrowserMode) => {
      this.historyManager.clearHistory(mode);
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.HISTORY_ADD, (_, entry: { url: string; title: string; mode: BrowserMode }) => {
      const result = this.historyManager.addEntry(entry.url, entry.title, entry.mode);
      return result;
    });

    // Bookmarks
    ipcMain.handle(IPC_CHANNELS.BOOKMARK_ADD, (_, data: { url: string; title: string; mode: BrowserMode }) => {
      const bookmark = this.bookmarkManager.addBookmark(data.url, data.title, data.mode);
      return bookmark;
    });

    ipcMain.handle(IPC_CHANNELS.BOOKMARK_REMOVE, (_, id: string) => {
      const success = this.bookmarkManager.removeBookmark(id);
      return { success };
    });

    ipcMain.handle(IPC_CHANNELS.BOOKMARK_GET, (_, id: string) => {
      return this.bookmarkManager.getBookmark(id);
    });

    ipcMain.handle(IPC_CHANNELS.BOOKMARK_LIST, (_, mode?: BrowserMode) => {
      return this.bookmarkManager.getBookmarks(mode);
    });

    // Inspire resolution
    ipcMain.handle(IPC_CHANNELS.INSPIRE_RESOLVE, async (_, url: string) => {
      return this.inspireResolver.resolve(url);
    });

    // Window controls
    ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
      this.windowManager.minimize();
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
      this.windowManager.maximize();
      return { success: true, isMaximized: this.windowManager.isMaximized() };
    });

    // Use 'on' instead of 'handle' for close - no response needed
    ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
      console.log('IPC: Window close received');
      this.windowManager.close();
    });

    // New window creation
    ipcMain.handle(IPC_CHANNELS.WINDOW_NEW, async () => {
      try {
        await this.windowManager.createNewWindow();
        return { success: true };
      } catch (error) {
        console.error('Failed to create new window:', error);
        return { success: false, error: String(error) };
      }
    });

    // New Jubilee Bible window creation (isolated session)
    ipcMain.handle(IPC_CHANNELS.WINDOW_NEW_JUBILEE, async () => {
      try {
        await this.windowManager.createNewJubileeWindow();
        return { success: true };
      } catch (error) {
        console.error('Failed to create new Jubilee Bible window:', error);
        return { success: false, error: String(error) };
      }
    });

    // Print functionality
    ipcMain.handle(IPC_CHANNELS.WINDOW_PRINT, () => {
      this.windowManager.print();
      return { success: true };
    });

    // Zoom controls
    ipcMain.handle(IPC_CHANNELS.WINDOW_GET_ZOOM, () => {
      return { zoom: this.windowManager.getZoomLevel() };
    });

    ipcMain.handle(IPC_CHANNELS.WINDOW_SET_ZOOM, (_, factor: number) => {
      this.windowManager.setZoomLevel(factor);
      return { success: true, zoom: this.windowManager.getZoomLevel() };
    });

    // Settings
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
      return this.settingsManager.getSettings();
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, updates: object) => {
      this.settingsManager.updateSettings(updates as any);
      return { success: true, settings: this.settingsManager.getSettings() };
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, () => {
      this.settingsManager.resetToDefaults();
      return { success: true, settings: this.settingsManager.getSettings() };
    });

    // Privacy - Clear browsing data
    ipcMain.handle(IPC_CHANNELS.PRIVACY_CLEAR_DATA, async (_, options?: { history?: boolean; cookies?: boolean; cache?: boolean }) => {
      const clearHistory = options?.history !== false;
      const clearCookies = options?.cookies !== false;
      const clearCache = options?.cache !== false;

      try {
        if (clearHistory) {
          this.historyManager.clearHistory();
        }
        // Note: Cookie and cache clearing would require session.clearStorageData()
        // which should be implemented in the session management
        return { success: true };
      } catch (error) {
        console.error('Failed to clear browsing data:', error);
        return { success: false, error: String(error) };
      }
    });

    // Handle tab state updates from renderer (webview events)
    ipcMain.on('tab:state-update', (_, data: { tabId: string; updates: Partial<TabState> }) => {
      this.tabManager.updateTabState(data.tabId, data.updates);

      // Add to history if navigation completed
      if (data.updates.url && data.updates.title && !data.updates.isLoading) {
        const tab = this.tabManager.getTab(data.tabId);
        if (tab) {
          this.historyManager.addEntry(
            data.updates.url,
            data.updates.title,
            tab.state.mode
          );
        }
      }
    });

    // Handle webview creation
    ipcMain.on('webview:ready', (_, data: { tabId: string; webContentsId: number }) => {
      this.tabManager.setTabWebContents(data.tabId, data.webContentsId);
    });

    // Auto-update handlers
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
      if (!this.updateManager) {
        return { success: false, error: 'Update manager not initialized' };
      }
      const state = await this.updateManager.manualCheckForUpdates();
      return { success: true, state };
    });

    ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATE, () => {
      if (!this.updateManager) {
        return null;
      }
      return this.updateManager.getState();
    });

    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async () => {
      if (!this.updateManager) {
        return { success: false, error: 'Update manager not initialized' };
      }

      // Save session state before installing update
      if (this.sessionStateManager && this.mainWindow) {
        const tabs = this.tabManager.getTabList();
        const activeTab = tabs.find((t: any) => t.isActive);
        this.sessionStateManager.prepareForUpdate(
          this.mainWindow,
          this.modeManager.getCurrentMode(),
          tabs.map((t: any) => ({
            id: t.id,
            url: t.url,
            title: t.title,
            mode: t.mode,
            isActive: t.isActive || false,
          })),
          activeTab?.id
        );
      }

      await this.updateManager.installUpdate();
      return { success: true };
    });

    // Session state handlers
    ipcMain.handle(IPC_CHANNELS.SESSION_SAVE, () => {
      if (!this.sessionStateManager || !this.mainWindow) {
        return { success: false };
      }

      const tabs = this.tabManager.getTabList();
      const activeTab = tabs.find((t: any) => t.isActive);
      this.sessionStateManager.saveState(
        this.mainWindow,
        this.modeManager.getCurrentMode(),
        tabs.map((t: any) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          mode: t.mode,
          isActive: t.isActive || false,
        })),
        activeTab?.id
      );
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.SESSION_GET, () => {
      if (!this.sessionStateManager) {
        return null;
      }
      return this.sessionStateManager.loadState();
    });

    // ============================================
    // Authentication and Identity Handlers
    // ============================================

    // Get current authentication session
    ipcMain.handle(IPC_CHANNELS.AUTH_GET_SESSION, () => {
      return this.authManager.getSession();
    });

    // Sign in with email/password or magic link
    ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_IN, async (_, request: SignInRequest) => {
      return this.authManager.signIn(request);
    });

    // Sign out and clear all session data
    ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_OUT, async () => {
      await this.authManager.signOut();
      return { success: true };
    });

    // Refresh authentication token
    ipcMain.handle(IPC_CHANNELS.AUTH_REFRESH_TOKEN, async () => {
      const success = await this.authManager.refreshToken();
      return { success };
    });

    // Check permission for a specific feature
    ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_PERMISSION, async (_, feature: ParticipationFeature) => {
      return this.authManager.checkPermission(feature);
    });

    // Show sign-in UI (triggers modal or panel)
    ipcMain.handle(IPC_CHANNELS.AUTH_SHOW_SIGN_IN, (_, feature?: ParticipationFeature) => {
      if (feature) {
        this.authManager.requestSignIn(feature);
      }
      // Notify renderer to show sign-in UI
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('auth:show-sign-in', { feature });
      }
      return { success: true };
    });

    // Get current user profile
    ipcMain.handle(IPC_CHANNELS.AUTH_GET_PROFILE, () => {
      return this.authManager.getProfile();
    });

    // Update user profile
    ipcMain.handle(IPC_CHANNELS.AUTH_UPDATE_PROFILE, async (_, updates: Partial<JubileeUserProfile>) => {
      return this.authManager.updateProfile(updates);
    });
  }

  /**
   * Get the authentication manager instance
   */
  getAuthManager(): AuthenticationManager {
    return this.authManager;
  }
}
