/**
 * Preload Script
 * Secure bridge between renderer and main process
 * Uses contextBridge to expose only specific APIs
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  BrowserMode,
  TabState,
  NavigationEntry,
  BookmarkEntry,
  BrowserSettings,
  InspireResolution,
  UpdateState,
  SessionState,
  ExtendedTabState,
  TabGroup,
  TabGroupColor,
  ClosedTabEntry,
  AuthSession,
  SignInRequest,
  SignInResponse,
  JubileeUserProfile,
  ParticipationFeature,
  PermissionCheckResult,
} from '../shared/types';

// Type definitions for exposed APIs
interface TabAPI {
  create: (url?: string) => Promise<{ tabId: string; tabs: ExtendedTabState[] }>;
  close: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[] }>;
  switch: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[] }>;
  list: () => Promise<ExtendedTabState[]>;
  onUpdate: (callback: (tabs: ExtendedTabState[]) => void) => () => void;
  updateState: (tabId: string, updates: Partial<TabState>) => void;
  // Context menu actions
  duplicate: (tabId: string) => Promise<{ success: boolean; tabId?: string; tabs: ExtendedTabState[] }>;
  pin: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[] }>;
  unpin: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[] }>;
  mute: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[] }>;
  unmute: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[] }>;
  closeOthers: (tabId: string) => Promise<{ success: boolean; closedCount: number; tabs: ExtendedTabState[] }>;
  closeToRight: (tabId: string) => Promise<{ success: boolean; closedCount: number; tabs: ExtendedTabState[] }>;
  reopenClosed: () => Promise<{ success: boolean; closedTab?: ClosedTabEntry; tabs: ExtendedTabState[] }>;
  getClosedTabs: () => Promise<{ closedTabs: ClosedTabEntry[]; hasClosedTabs: boolean }>;
  moveToNewWindow: (tabId: string) => Promise<{ success: boolean; error?: string }>;
  // Group management
  addToGroup: (tabId: string, groupId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[]; groups: TabGroup[] }>;
  removeFromGroup: (tabId: string) => Promise<{ success: boolean; tabs: ExtendedTabState[]; groups: TabGroup[] }>;
  createGroup: (name: string, color: TabGroupColor) => Promise<{ success: boolean; groupId: string; groups: TabGroup[] }>;
  getGroups: () => Promise<{ groups: TabGroup[] }>;
}

interface NavigationAPI {
  go: (url: string) => Promise<{ success: boolean }>;
  back: () => Promise<{ success: boolean }>;
  forward: () => Promise<{ success: boolean }>;
  reload: () => Promise<{ success: boolean }>;
  hardReload: () => Promise<{ success: boolean }>;
  stop: () => Promise<{ success: boolean }>;
  onNavigate: (callback: (data: { tabId: string; url: string }) => void) => () => void;
  onBack: (callback: (data: { tabId: string }) => void) => () => void;
  onForward: (callback: (data: { tabId: string }) => void) => () => void;
  onReload: (callback: (data: { tabId: string }) => void) => () => void;
  onHardReload: (callback: (data: { tabId: string }) => void) => () => void;
  onStop: (callback: (data: { tabId: string }) => void) => () => void;
}

interface ModeAPI {
  switch: (mode: BrowserMode) => Promise<{ success: boolean; mode: BrowserMode }>;
  get: () => Promise<{ mode: BrowserMode }>;
  onChange: (callback: (data: { mode: BrowserMode; previousMode: BrowserMode }) => void) => () => void;
}

interface HistoryAPI {
  get: (mode?: BrowserMode, limit?: number) => Promise<NavigationEntry[]>;
  clear: (mode?: BrowserMode) => Promise<{ success: boolean }>;
  add: (entry: { url: string; title: string; mode: BrowserMode }) => Promise<NavigationEntry>;
}

interface BookmarkAPI {
  add: (data: { url: string; title: string; mode: BrowserMode }) => Promise<BookmarkEntry>;
  remove: (id: string) => Promise<{ success: boolean }>;
  get: (id: string) => Promise<BookmarkEntry | undefined>;
  list: (mode?: BrowserMode) => Promise<BookmarkEntry[]>;
}

interface InspireAPI {
  resolve: (url: string) => Promise<InspireResolution>;
}

interface WindowAPI {
  minimize: () => Promise<{ success: boolean }>;
  maximize: () => Promise<{ success: boolean; isMaximized: boolean }>;
  close: () => Promise<{ success: boolean }>;
  newWindow: () => Promise<{ success: boolean; error?: string }>;
  newJubileeWindow: () => Promise<{ success: boolean; error?: string }>;
  print: () => Promise<{ success: boolean }>;
  getZoom: () => Promise<{ zoom: number }>;
  setZoom: (factor: number) => Promise<{ success: boolean; zoom: number }>;
  onPrint: (callback: () => void) => () => void;
}

interface SettingsAPI {
  get: () => Promise<BrowserSettings>;
  set: (updates: Partial<BrowserSettings>) => Promise<{ success: boolean; settings: BrowserSettings }>;
  reset: () => Promise<{ success: boolean; settings: BrowserSettings }>;
}

interface PrivacyAPI {
  clearBrowsingData: (options?: { history?: boolean; cookies?: boolean; cache?: boolean }) => Promise<{ success: boolean; error?: string }>;
}

interface WebviewAPI {
  ready: (tabId: string, webContentsId: number) => void;
}

interface BlacklistAPI {
  onUrlBlocked: (callback: (data: { url: string; content: string }) => void) => () => void;
}

interface UpdateAPI {
  checkForUpdates: () => Promise<{ success: boolean; state?: UpdateState; error?: string }>;
  getState: () => Promise<UpdateState | null>;
  installUpdate: () => Promise<{ success: boolean; error?: string }>;
  onStateChanged: (callback: (state: UpdateState) => void) => () => void;
  onProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void;
}

interface SessionAPI {
  save: () => Promise<{ success: boolean }>;
  get: () => Promise<SessionState | null>;
}

/**
 * Identity API - Secure authentication interface
 * NOTE: Raw tokens are NEVER exposed - only safe session state
 */
interface IdentityAPI {
  // Get current authentication session state
  getSession: () => Promise<AuthSession>;
  // Sign in with email/password or magic link
  signIn: (request: SignInRequest) => Promise<SignInResponse>;
  // Sign out and clear session
  signOut: () => Promise<{ success: boolean }>;
  // Check if user can access a specific feature
  checkPermission: (feature: ParticipationFeature) => Promise<PermissionCheckResult>;
  // Request sign-in UI to be shown
  showSignIn: (feature?: ParticipationFeature) => Promise<{ success: boolean }>;
  // Get current user profile (null if not signed in)
  getProfile: () => Promise<JubileeUserProfile | null>;
  // Update user profile
  updateProfile: (updates: Partial<JubileeUserProfile>) => Promise<{ success: boolean; error?: any }>;
  // Listen for session changes
  onSessionChanged: (callback: (session: AuthSession) => void) => () => void;
  // Listen for sign-in required events
  onSignInRequired: (callback: (data: { feature?: ParticipationFeature }) => void) => () => void;
}

// Helper to create unsubscribe function for event listeners
function createEventListener<T>(
  channel: string,
  callback: (data: T) => void
): () => void {
  const handler = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Expose secure APIs to renderer
contextBridge.exposeInMainWorld('jubilee', {
  // Tab management
  tabs: {
    create: (url?: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CREATE, url),
    close: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CLOSE, tabId),
    switch: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_SWITCH, tabId),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_LIST),
    onUpdate: (callback: (tabs: ExtendedTabState[]) => void) =>
      createEventListener(IPC_CHANNELS.TAB_UPDATE, callback),
    updateState: (tabId: string, updates: Partial<TabState>) =>
      ipcRenderer.send('tab:state-update', { tabId, updates }),
    // Context menu actions
    duplicate: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_DUPLICATE, tabId),
    pin: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_PIN, tabId),
    unpin: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_UNPIN, tabId),
    mute: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_MUTE, tabId),
    unmute: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_UNMUTE, tabId),
    closeOthers: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CLOSE_OTHERS, tabId),
    closeToRight: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CLOSE_TO_RIGHT, tabId),
    reopenClosed: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_REOPEN_CLOSED),
    getClosedTabs: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_GET_CLOSED),
    moveToNewWindow: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_MOVE_TO_NEW_WINDOW, tabId),
    // Group management
    addToGroup: (tabId: string, groupId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_ADD_TO_GROUP, { tabId, groupId }),
    removeFromGroup: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB_REMOVE_FROM_GROUP, tabId),
    createGroup: (name: string, color: TabGroupColor) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CREATE_GROUP, { name, color }),
    getGroups: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_GET_GROUPS),
  } as TabAPI,

  // Navigation
  navigation: {
    go: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.NAV_GO, url),
    back: () => ipcRenderer.invoke(IPC_CHANNELS.NAV_BACK),
    forward: () => ipcRenderer.invoke(IPC_CHANNELS.NAV_FORWARD),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.NAV_RELOAD),
    hardReload: () => ipcRenderer.invoke(IPC_CHANNELS.NAV_HARD_RELOAD),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.NAV_STOP),
    onNavigate: (callback: (data: { tabId: string; url: string }) => void) =>
      createEventListener(IPC_CHANNELS.NAV_GO, callback),
    onBack: (callback: (data: { tabId: string }) => void) =>
      createEventListener(IPC_CHANNELS.NAV_BACK, callback),
    onForward: (callback: (data: { tabId: string }) => void) =>
      createEventListener(IPC_CHANNELS.NAV_FORWARD, callback),
    onReload: (callback: (data: { tabId: string }) => void) =>
      createEventListener(IPC_CHANNELS.NAV_RELOAD, callback),
    onHardReload: (callback: (data: { tabId: string }) => void) =>
      createEventListener(IPC_CHANNELS.NAV_HARD_RELOAD, callback),
    onStop: (callback: (data: { tabId: string }) => void) =>
      createEventListener(IPC_CHANNELS.NAV_STOP, callback),
  } as NavigationAPI,

  // Mode switching
  mode: {
    switch: (mode: BrowserMode) => ipcRenderer.invoke(IPC_CHANNELS.MODE_SWITCH, mode),
    get: () => ipcRenderer.invoke(IPC_CHANNELS.MODE_GET),
    onChange: (callback: (data: { mode: BrowserMode; previousMode: BrowserMode }) => void) =>
      createEventListener(IPC_CHANNELS.MODE_CHANGED, callback),
  } as ModeAPI,

  // History
  history: {
    get: (mode?: BrowserMode, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET, mode, limit),
    clear: (mode?: BrowserMode) =>
      ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR, mode),
    add: (entry: { url: string; title: string; mode: BrowserMode }) =>
      ipcRenderer.invoke(IPC_CHANNELS.HISTORY_ADD, entry),
  } as HistoryAPI,

  // Bookmarks
  bookmarks: {
    add: (data: { url: string; title: string; mode: BrowserMode }) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKMARK_ADD, data),
    remove: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKMARK_REMOVE, id),
    get: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKMARK_GET, id),
    list: (mode?: BrowserMode) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKMARK_LIST, mode),
  } as BookmarkAPI,

  // Inspire namespace
  inspire: {
    resolve: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.INSPIRE_RESOLVE, url),
  } as InspireAPI,

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => {
      console.log('PRELOAD: Sending window:close via sendSync');
      // Use sendSync to ensure the message is delivered before renderer continues
      ipcRenderer.sendSync('window:close-sync');
      return Promise.resolve({ success: true });
    },
    newWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_NEW),
    newJubileeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_NEW_JUBILEE),
    print: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_PRINT),
    getZoom: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_ZOOM),
    setZoom: (factor: number) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_ZOOM, factor),
    onPrint: (callback: () => void) => createEventListener('menu:print', callback),
  } as WindowAPI,

  // Settings
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (updates: Partial<BrowserSettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, updates),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RESET),
  } as SettingsAPI,

  // Privacy
  privacy: {
    clearBrowsingData: (options?: { history?: boolean; cookies?: boolean; cache?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRIVACY_CLEAR_DATA, options),
  } as PrivacyAPI,

  // Webview management
  webview: {
    ready: (tabId: string, webContentsId: number) =>
      ipcRenderer.send('webview:ready', { tabId, webContentsId }),
  } as WebviewAPI,

  // Blacklist management
  blacklist: {
    onUrlBlocked: (callback: (data: { url: string; content: string }) => void) =>
      createEventListener('url-blocked', callback),
  } as BlacklistAPI,

  // Auto-update
  update: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATE),
    installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    onStateChanged: (callback: (state: UpdateState) => void) =>
      createEventListener(IPC_CHANNELS.UPDATE_STATE_CHANGED, callback),
    onProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) =>
      createEventListener(IPC_CHANNELS.UPDATE_PROGRESS, callback),
  } as UpdateAPI,

  // Session state
  session: {
    save: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_SAVE),
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET),
  } as SessionAPI,

  // Identity and authentication
  // NOTE: This API never exposes raw tokens - only safe session state
  identity: {
    getSession: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_SESSION),
    signIn: (request: SignInRequest) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_IN, request),
    signOut: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_OUT),
    checkPermission: (feature: ParticipationFeature) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_PERMISSION, feature),
    showSignIn: (feature?: ParticipationFeature) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_SHOW_SIGN_IN, feature),
    getProfile: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_PROFILE),
    updateProfile: (updates: Partial<JubileeUserProfile>) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_UPDATE_PROFILE, updates),
    onSessionChanged: (callback: (session: AuthSession) => void) =>
      createEventListener(IPC_CHANNELS.AUTH_SESSION_CHANGED, callback),
    onSignInRequired: (callback: (data: { feature?: ParticipationFeature }) => void) =>
      createEventListener('auth:show-sign-in', callback),
  } as IdentityAPI,
});

// Type declaration for window.jubilee
declare global {
  interface Window {
    jubilee: {
      tabs: TabAPI;
      navigation: NavigationAPI;
      mode: ModeAPI;
      history: HistoryAPI;
      bookmarks: BookmarkAPI;
      inspire: InspireAPI;
      window: WindowAPI;
      settings: SettingsAPI;
      privacy: PrivacyAPI;
      webview: WebviewAPI;
      blacklist: BlacklistAPI;
      update: UpdateAPI;
      session: SessionAPI;
      identity: IdentityAPI;
    };
  }
}
