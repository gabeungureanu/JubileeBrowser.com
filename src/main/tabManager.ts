/**
 * Tab Manager
 * Manages browser tabs and their associated webviews
 */

import { BrowserWindow, ipcMain, WebContents } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { TabState, BrowserMode, IPC_CHANNELS, TabGroup, TabGroupColor, ExtendedTabState, ClosedTabEntry } from '../shared/types';
import { ModeManager } from './modeManager';
import { InspireResolver } from './inspireResolver';

interface TabData {
  id: string;
  webContentsId?: number;
  state: TabState;
  isPinned: boolean;
  isMuted: boolean;
  isAudible: boolean;
  groupId?: string;
}

export class TabManager {
  private tabs: Map<string, TabData> = new Map();
  private activeTabId: string | null = null;
  private mainWindow: BrowserWindow | null = null;
  private modeManager: ModeManager;
  private inspireResolver: InspireResolver;
  private tabGroups: Map<string, TabGroup> = new Map();
  private closedTabs: ClosedTabEntry[] = [];
  private maxClosedTabs: number = 25; // Keep last 25 closed tabs
  private mutedOrigins: Set<string> = new Set(); // Track muted origins for site-level muting

  constructor(modeManager: ModeManager, inspireResolver: InspireResolver) {
    this.modeManager = modeManager;
    this.inspireResolver = inspireResolver;
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
  }

  createTab(url?: string, mode?: BrowserMode): string {
    const currentMode = mode ?? this.modeManager.getCurrentMode();
    const id = uuidv4();

    // Determine starting URL based on mode
    let startUrl = url;
    if (!startUrl) {
      startUrl = currentMode === 'jubileebibles'
        ? 'inspire://home.inspire'
        : 'about:blank';
    }

    const tabState: TabState = {
      id,
      title: 'New Tab',
      url: startUrl,
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      mode: currentMode,
    };

    const tabData: TabData = {
      id,
      state: tabState,
      isPinned: false,
      isMuted: false,
      isAudible: false,
    };

    this.tabs.set(id, tabData);
    this.activeTabId = id;

    // Notify renderer to create the tab UI
    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());

    return id;
  }

  closeTab(tabId: string, saveForRestore: boolean = true): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    // Prevent closing pinned tabs accidentally (require explicit unpin first)
    // But allow closing if saveForRestore is false (bulk operations)

    // Save to closed tabs for restoration
    if (saveForRestore && tab.state.url !== 'about:blank') {
      const closedEntry: ClosedTabEntry = {
        id: uuidv4(),
        url: tab.state.url,
        title: tab.state.title,
        mode: tab.state.mode,
        closedAt: Date.now(),
      };
      this.closedTabs.unshift(closedEntry);
      // Keep only the last N closed tabs
      if (this.closedTabs.length > this.maxClosedTabs) {
        this.closedTabs = this.closedTabs.slice(0, this.maxClosedTabs);
      }
    }

    // Remove from any group
    if (tab.groupId) {
      this.removeTabFromGroup(tabId);
    }

    this.tabs.delete(tabId);

    // If closing active tab, switch to another
    if (this.activeTabId === tabId) {
      const remainingTabs = Array.from(this.tabs.keys());
      this.activeTabId = remainingTabs.length > 0 ? remainingTabs[0] : null;

      // Create a new tab if none remain
      if (!this.activeTabId) {
        this.createTab();
      }
    }

    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  switchTab(tabId: string): boolean {
    if (!this.tabs.has(tabId)) return false;

    this.activeTabId = tabId;
    const tab = this.tabs.get(tabId);

    // Switch mode if tab is in different mode
    if (tab && tab.state.mode !== this.modeManager.getCurrentMode()) {
      this.modeManager.switchMode(tab.state.mode);
    }

    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  updateTabState(tabId: string, updates: Partial<TabState>): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    tab.state = { ...tab.state, ...updates };
    this.tabs.set(tabId, tab);

    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
  }

  setTabWebContents(tabId: string, webContentsId: number): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    tab.webContentsId = webContentsId;
    this.tabs.set(tabId, tab);
  }

  getActiveTab(): TabData | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) ?? null : null;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  getTab(tabId: string): TabData | undefined {
    return this.tabs.get(tabId);
  }

  getTabList(): (ExtendedTabState & { isActive: boolean })[] {
    // Sort tabs: pinned tabs first, then by insertion order
    const tabArray = Array.from(this.tabs.values());
    const pinnedTabs = tabArray.filter(t => t.isPinned);
    const unpinnedTabs = tabArray.filter(t => !t.isPinned);
    const sortedTabs = [...pinnedTabs, ...unpinnedTabs];

    return sortedTabs.map((tab) => ({
      ...tab.state,
      isPinned: tab.isPinned,
      isMuted: tab.isMuted,
      isAudible: tab.isAudible,
      groupId: tab.groupId,
      isActive: tab.id === this.activeTabId,
    }));
  }

  getTabsForMode(mode: BrowserMode): TabData[] {
    return Array.from(this.tabs.values()).filter((tab) => tab.state.mode === mode);
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // Navigate the active tab to a URL
  navigateTo(url: string): void {
    if (!this.activeTabId) return;

    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    // Update tab state
    this.updateTabState(this.activeTabId, {
      url,
      isLoading: true,
    });

    // Send navigation command to renderer (webview will handle actual navigation)
    this.sendToRenderer(IPC_CHANNELS.NAV_GO, {
      tabId: this.activeTabId,
      url,
    });
  }

  goBack(): void {
    if (!this.activeTabId) return;
    this.sendToRenderer(IPC_CHANNELS.NAV_BACK, { tabId: this.activeTabId });
  }

  goForward(): void {
    if (!this.activeTabId) return;
    this.sendToRenderer(IPC_CHANNELS.NAV_FORWARD, { tabId: this.activeTabId });
  }

  reload(): void {
    if (!this.activeTabId) return;
    this.sendToRenderer(IPC_CHANNELS.NAV_RELOAD, { tabId: this.activeTabId });
  }

  hardReload(): void {
    if (!this.activeTabId) return;
    this.sendToRenderer(IPC_CHANNELS.NAV_HARD_RELOAD, { tabId: this.activeTabId });
  }

  stop(): void {
    if (!this.activeTabId) return;
    this.sendToRenderer(IPC_CHANNELS.NAV_STOP, { tabId: this.activeTabId });
  }

  // ========== Tab Context Menu Methods ==========

  /**
   * Duplicate a tab - creates a new tab with the same URL and mode
   */
  duplicateTab(tabId: string): string | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    // Create new tab with same URL and mode
    const newTabId = this.createTab(tab.state.url, tab.state.mode);
    return newTabId;
  }

  /**
   * Pin a tab - moves it to the pinned region
   */
  pinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.isPinned) return false;

    tab.isPinned = true;
    // Remove from any group when pinning
    if (tab.groupId) {
      this.removeTabFromGroup(tabId);
    }
    this.tabs.set(tabId, tab);
    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  /**
   * Unpin a tab - moves it back to regular tabs
   */
  unpinTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.isPinned) return false;

    tab.isPinned = false;
    this.tabs.set(tabId, tab);
    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  /**
   * Toggle pin state
   */
  togglePin(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    return tab.isPinned ? this.unpinTab(tabId) : this.pinTab(tabId);
  }

  /**
   * Mute a tab's audio (site-level muting)
   */
  muteTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    tab.isMuted = true;

    // Extract origin for site-level muting
    try {
      const url = new URL(tab.state.url);
      this.mutedOrigins.add(url.origin);

      // Mute all tabs from the same origin
      this.tabs.forEach((t, id) => {
        try {
          const tabUrl = new URL(t.state.url);
          if (tabUrl.origin === url.origin) {
            t.isMuted = true;
            this.tabs.set(id, t);
          }
        } catch {}
      });
    } catch {
      // If URL parsing fails, just mute this tab
      this.tabs.set(tabId, tab);
    }

    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  /**
   * Unmute a tab's audio (site-level unmuting)
   */
  unmuteTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    tab.isMuted = false;

    // Extract origin for site-level unmuting
    try {
      const url = new URL(tab.state.url);
      this.mutedOrigins.delete(url.origin);

      // Unmute all tabs from the same origin
      this.tabs.forEach((t, id) => {
        try {
          const tabUrl = new URL(t.state.url);
          if (tabUrl.origin === url.origin) {
            t.isMuted = false;
            this.tabs.set(id, t);
          }
        } catch {}
      });
    } catch {
      // If URL parsing fails, just unmute this tab
      this.tabs.set(tabId, tab);
    }

    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  /**
   * Toggle mute state
   */
  toggleMute(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    return tab.isMuted ? this.unmuteTab(tabId) : this.muteTab(tabId);
  }

  /**
   * Set tab audible state (called from renderer when audio starts/stops)
   */
  setTabAudible(tabId: string, isAudible: boolean): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.isAudible = isAudible;
    this.tabs.set(tabId, tab);
    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
  }

  /**
   * Check if an origin is muted
   */
  isOriginMuted(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return this.mutedOrigins.has(parsedUrl.origin);
    } catch {
      return false;
    }
  }

  /**
   * Close all tabs to the right of the specified tab
   */
  closeTabsToRight(tabId: string): number {
    const tabList = this.getTabList();
    const tabIndex = tabList.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return 0;

    let closedCount = 0;
    for (let i = tabList.length - 1; i > tabIndex; i--) {
      const tab = tabList[i];
      if (!tab.isPinned) { // Don't close pinned tabs
        this.closeTab(tab.id, true);
        closedCount++;
      }
    }
    return closedCount;
  }

  /**
   * Close all other tabs except the specified tab
   */
  closeOtherTabs(tabId: string): number {
    const tabList = this.getTabList();
    let closedCount = 0;

    for (const tab of tabList) {
      if (tab.id !== tabId && !tab.isPinned) { // Don't close pinned tabs or the selected tab
        this.closeTab(tab.id, true);
        closedCount++;
      }
    }
    return closedCount;
  }

  /**
   * Reopen the most recently closed tab
   */
  reopenClosedTab(): ClosedTabEntry | null {
    if (this.closedTabs.length === 0) return null;

    const closedTab = this.closedTabs.shift()!;
    this.createTab(closedTab.url, closedTab.mode);
    return closedTab;
  }

  /**
   * Get list of recently closed tabs
   */
  getClosedTabs(): ClosedTabEntry[] {
    return [...this.closedTabs];
  }

  /**
   * Check if there are closed tabs available for restoration
   */
  hasClosedTabs(): boolean {
    return this.closedTabs.length > 0;
  }

  // ========== Tab Groups ==========

  /**
   * Create a new tab group
   */
  createGroup(name: string, color: TabGroupColor): string {
    const groupId = uuidv4();
    const group: TabGroup = {
      id: groupId,
      name,
      color,
      tabIds: [],
      collapsed: false,
    };
    this.tabGroups.set(groupId, group);
    return groupId;
  }

  /**
   * Add a tab to a group
   */
  addTabToGroup(tabId: string, groupId: string): boolean {
    const tab = this.tabs.get(tabId);
    const group = this.tabGroups.get(groupId);
    if (!tab || !group || tab.isPinned) return false; // Pinned tabs can't be grouped

    // Remove from current group if any
    if (tab.groupId) {
      this.removeTabFromGroup(tabId);
    }

    tab.groupId = groupId;
    group.tabIds.push(tabId);
    this.tabs.set(tabId, tab);
    this.tabGroups.set(groupId, group);
    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  /**
   * Remove a tab from its group
   */
  removeTabFromGroup(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || !tab.groupId) return false;

    const group = this.tabGroups.get(tab.groupId);
    if (group) {
      group.tabIds = group.tabIds.filter(id => id !== tabId);
      // Delete group if empty
      if (group.tabIds.length === 0) {
        this.tabGroups.delete(tab.groupId);
      } else {
        this.tabGroups.set(tab.groupId, group);
      }
    }

    tab.groupId = undefined;
    this.tabs.set(tabId, tab);
    this.sendToRenderer(IPC_CHANNELS.TAB_UPDATE, this.getTabList());
    return true;
  }

  /**
   * Get all tab groups
   */
  getGroups(): TabGroup[] {
    return Array.from(this.tabGroups.values());
  }

  /**
   * Get a specific group
   */
  getGroup(groupId: string): TabGroup | undefined {
    return this.tabGroups.get(groupId);
  }

  /**
   * Reload a specific tab
   */
  reloadTab(tabId: string): void {
    this.sendToRenderer(IPC_CHANNELS.NAV_RELOAD, { tabId });
  }

  /**
   * Get tab info for move to new window
   */
  getTabInfo(tabId: string): { url: string; mode: BrowserMode; title: string } | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    return {
      url: tab.state.url,
      mode: tab.state.mode,
      title: tab.state.title,
    };
  }
}
