# Jubilee Browser System Architecture

This document provides a comprehensive overview of the Jubilee Browser architecture for IT developers.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Developer Documentation**: [https://jubileebrowser.com/docs/dev](https://jubileebrowser.com/docs/dev)

## Table of Contents

1. [System Overview](#system-overview)
2. [Process Model](#process-model)
3. [Module Structure](#module-structure)
4. [Data Flow](#data-flow)
5. [IPC Communication](#ipc-communication)
6. [State Management](#state-management)
7. [Security Model](#security-model)
8. [File Structure](#file-structure)

---

## System Overview

Jubilee Browser is an Electron-based dual-mode browser that allows users to browse both the public internet and the Jubilee Bibles network (via `inspire://` protocol).

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Jubilee Browser                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                        Main Process                                 │    │
│  │  (Node.js + Electron APIs)                                         │    │
│  │                                                                     │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │    │
│  │  │ WindowMgr   │ │ TabManager  │ │ ModeManager │ │ HistoryMgr  │  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │    │
│  │  │ BookmarkMgr │ │ SettingsMgr │ │ BlacklistMgr│ │InspireResolv│  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │    │
│  │  │ UpdateMgr   │ │ SessionMgr  │ │ FirstRunMgr │ │ IPCHandler  │  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │    │
│  │  ┌─────────────┐                                                   │    │
│  │  │ NavIntercept│                                                   │    │
│  │  └─────────────┘                                                   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                          IPC (contextBridge)                                 │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Preload Script                                 │    │
│  │  (Secure bridge - exposes window.jubilee API)                      │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Renderer Process                               │    │
│  │  (Chromium + DOM + renderer.ts)                                    │    │
│  │                                                                     │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │    │
│  │  │  Tab UI     │ │ Navigation  │ │ Address Bar │ │ Side Panels │  │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │    │
│  │  │ About Modal │ │ Update UI   │ │ Mode Toggle │                   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘                   │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │                    Webview Elements                          │  │    │
│  │  │  (Sandboxed browsing contexts for each tab)                  │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Process Model

### Main Process

**Entry Point**: `src/main/main.ts` → compiled to `dist/main/main.js`

**Responsibilities**:
- Application lifecycle management
- Window creation and management
- IPC message handling
- System integration (protocols, registry)
- Auto-update coordination
- Data persistence (history, bookmarks, settings)

**Key Class**: `JubileeBrowser`
```typescript
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

  async initialize(): Promise<void> {
    await app.whenReady();

    // Initialize first-run manager
    this.firstRunManager = new FirstRunManager();
    await this.firstRunManager.initialize();

    // Initialize all managers...
    // Configure security...
    // Create window...
    // Set up IPC handlers...
  }
}
```

### Preload Script

**Entry Point**: `src/preload/preload.ts` → compiled to `dist/preload/preload.js`

**Responsibilities**:
- Bridge between main and renderer processes
- Expose safe APIs via `contextBridge`
- Filter and sanitize IPC messages

**Exposed API** (`window.jubilee`):
```typescript
window.jubilee = {
  tabs: TabAPI,
  navigation: NavigationAPI,
  mode: ModeAPI,
  history: HistoryAPI,
  bookmarks: BookmarkAPI,
  inspire: InspireAPI,
  window: WindowAPI,
  settings: SettingsAPI,
  webview: WebviewAPI,
  blacklist: BlacklistAPI,
  update: UpdateAPI,
  session: SessionAPI,
};
```

### Renderer Process

**Entry Point**: `src/renderer/renderer.ts` → compiled to `dist/renderer/renderer.js`

**Responsibilities**:
- UI rendering and interaction
- Tab display management
- User input handling
- Webview coordination

---

## Module Structure

### Main Process Modules

| Module | File | Purpose |
|--------|------|---------|
| WindowManager | `windowManager.ts` | Window creation, state persistence |
| TabManager | `tabManager.ts` | Tab lifecycle, webview management |
| ModeManager | `modeManager.ts` | Internet/JubileeBibles mode switching |
| InspireResolver | `inspireResolver.ts` | `inspire://` URL resolution |
| HistoryManager | `historyManager.ts` | Browsing history storage |
| BookmarkManager | `bookmarkManager.ts` | Bookmark CRUD operations |
| NavigationInterceptor | `navigationInterceptor.ts` | URL filtering, blacklist enforcement |
| IPCHandler | `ipcHandler.ts` | IPC channel registration |
| SettingsManager | `settingsManager.ts` | User preferences |
| BlacklistManager | `blacklistManager.ts` | Site blocking |
| UpdateManager | `updateManager.ts` | Auto-update coordination |
| SessionStateManager | `sessionStateManager.ts` | State preservation across updates |
| FirstRunManager | `firstRunManager.ts` | Post-installation setup |

### Module Dependencies

```
                    ┌─────────────────────┐
                    │    JubileeBrowser   │
                    │      (main.ts)      │
                    └─────────┬───────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ FirstRunMgr   │    │ WindowManager │    │ IPCHandler    │
└───────────────┘    └───────┬───────┘    └───────┬───────┘
                             │                    │
                             │          ┌─────────┴─────────┐
                             │          │                   │
                             ▼          ▼                   ▼
                    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
                    │ TabManager    │  │ ModeManager   │  │ UpdateManager │
                    └───────┬───────┘  └───────┬───────┘  └───────────────┘
                            │                  │
              ┌─────────────┴──────┐           │
              │                    │           │
              ▼                    ▼           ▼
    ┌───────────────┐    ┌───────────────┐  ┌───────────────┐
    │InspireResolver│    │SettingsManager│  │HistoryManager │
    └───────────────┘    └───────────────┘  └───────────────┘
```

---

## Data Flow

### Navigation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        User enters URL in address bar                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Renderer: renderer.ts handleNavigate()                    │
│  • Parse URL                                                                 │
│  • Determine if inspire:// or http(s)://                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IPC: window.jubilee.navigation.go(url)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Main: IPCHandler NAV_GO handler                           │
│  • Check blacklist                                                           │
│  • Resolve inspire:// if needed                                             │
│  • Update tab state                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐               ┌─────────────────┐
          │  Blocked URL    │               │  Allowed URL    │
          │  Show error     │               │  Load in webview│
          └─────────────────┘               └─────────────────┘
                                                    │
                                                    ▼
                                      ┌─────────────────────────────┐
                                      │  NavigationInterceptor      │
                                      │  • Monitor navigation       │
                                      │  • Add to history           │
                                      │  • Update tab title         │
                                      └─────────────────────────────┘
```

### Mode Switching Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    User toggles Internet/JubileeBibles switch                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Renderer: modeToggle change event                         │
│  • window.jubilee.mode.switch(newMode)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Main: ModeManager.switchMode()                            │
│  1. Store previous mode                                                      │
│  2. Update current mode                                                      │
│  3. Notify TabManager to update session partitions                          │
│  4. Emit MODE_CHANGED event                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Renderer: MODE_CHANGED listener                           │
│  • Update UI indicators                                                      │
│  • Update address bar icon                                                   │
│  • Filter tabs by mode                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## IPC Communication

### Channel Definitions

Defined in `src/shared/types.ts`:

```typescript
export const IPC_CHANNELS = {
  // Tab management
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_SWITCH: 'tab:switch',
  TAB_LIST: 'tab:list',
  TAB_UPDATE: 'tab:update',

  // Navigation
  NAV_GO: 'nav:go',
  NAV_BACK: 'nav:back',
  NAV_FORWARD: 'nav:forward',
  NAV_RELOAD: 'nav:reload',
  NAV_STOP: 'nav:stop',

  // Mode switching
  MODE_SWITCH: 'mode:switch',
  MODE_GET: 'mode:get',
  MODE_CHANGED: 'mode:changed',

  // History
  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_ADD: 'history:add',

  // Bookmarks
  BOOKMARK_ADD: 'bookmark:add',
  BOOKMARK_REMOVE: 'bookmark:remove',
  BOOKMARK_GET: 'bookmark:get',
  BOOKMARK_LIST: 'bookmark:list',

  // Inspire protocol
  INSPIRE_RESOLVE: 'inspire:resolve',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Auto-update
  UPDATE_CHECK: 'update:check',
  UPDATE_GET_STATE: 'update:getState',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATE_CHANGED: 'update:stateChanged',
  UPDATE_PROGRESS: 'update:progress',

  // Session
  SESSION_SAVE: 'session:save',
  SESSION_GET: 'session:get',
};
```

### Communication Patterns

**Invoke/Handle** (Request-Response):
```typescript
// Renderer
const result = await window.jubilee.tabs.create(url);

// Main (IPCHandler)
ipcMain.handle(IPC_CHANNELS.TAB_CREATE, async (_, url) => {
  const tab = await this.tabManager.createTab(url);
  return { tabId: tab.id, tabs: this.tabManager.getTabList() };
});
```

**Send/On** (One-way, events):
```typescript
// Main
this.mainWindow.webContents.send(IPC_CHANNELS.TAB_UPDATE, tabs);

// Renderer
window.jubilee.tabs.onUpdate((tabs) => {
  renderTabs(tabs);
});
```

---

## State Management

### Persistent State Files

| File | Location | Purpose |
|------|----------|---------|
| `settings.json` | `%LOCALAPPDATA%\JubileeBrowser\` | User preferences |
| `install-info.json` | `%LOCALAPPDATA%\JubileeBrowser\` | Installation metadata |
| `update-state.json` | `%LOCALAPPDATA%\JubileeBrowser\` | Update manager state |
| `session-state.json` | `%LOCALAPPDATA%\JubileeBrowser\` | Tab/window state |
| `window-state.json` | `%LOCALAPPDATA%\JubileeBrowser\` | Window position/size |

### State Persistence Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Application Running                                  │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Settings    │  │ Tabs State  │  │ Window Pos  │  │ Update State│        │
│  │ (in memory) │  │ (in memory) │  │ (in memory) │  │ (in memory) │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                 │
└─────────┼────────────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │                │
          │   ┌────────────┴────────────────┴────────────┐   │
          │   │              on 'before-quit'            │   │
          │   └────────────────────┬─────────────────────┘   │
          │                        │                         │
          ▼                        ▼                         ▼
┌─────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐
│ settings.json   │  │    session-state.json   │  │update-state.json│
│ (saved on change│  │ (saved on quit/update)  │  │ (saved on quit) │
│  and on quit)   │  │                         │  │                 │
└─────────────────┘  └─────────────────────────┘  └─────────────────┘
```

### Session State Structure

```typescript
interface SessionState {
  timestamp: number;
  windowState: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };
  mode: BrowserMode;
  tabs: Array<{
    id: string;
    url: string;
    title: string;
    mode: BrowserMode;
    isActive: boolean;
  }>;
  activeTabId?: string;
  pendingUpdate?: boolean;
}
```

---

## Security Model

### Process Isolation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Main Process                                    │
│  • Full Node.js access                                                       │
│  • File system access                                                        │
│  • System APIs                                                               │
│  • ISOLATED from renderer                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                         contextBridge (filtered)
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Renderer Process                                  │
│  • Limited API access via window.jubilee                                    │
│  • No direct Node.js access                                                  │
│  • No file system access                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                              webview (sandboxed)
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Web Content                                       │
│  • Fully sandboxed                                                           │
│  • No access to parent renderer                                              │
│  • Standard web security model                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Session Partitions

```typescript
// Internet mode session - isolated storage
const internetSession = session.fromPartition('persist:internet');

// JubileeBibles mode session - separate isolated storage
const jubileebiblesSession = session.fromPartition('persist:jubileebibles');
```

This ensures:
- Cookies don't leak between modes
- LocalStorage is separate
- Cache is isolated
- History is mode-specific

### Content Security Policy

Defined in `src/renderer/index.html`:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self' https: data:;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https:;
  frame-src 'self' https: http: data: inspire:;
">
```

### Navigation Security

```typescript
// Prevent unexpected protocols
contents.on('will-navigate', (event, navigationUrl) => {
  const parsedUrl = new URL(navigationUrl);
  const allowedProtocols = ['http:', 'https:', 'inspire:', 'file:'];

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    event.preventDefault();
  }
});

// Prevent new windows (use tabs instead)
contents.setWindowOpenHandler(({ url }) => {
  this.tabManager.createTab(url);
  return { action: 'deny' };
});
```

---

## File Structure

```
JubileeBrowser/
├── src/
│   ├── main/                          # Main process code
│   │   ├── main.ts                    # Entry point, JubileeBrowser class
│   │   ├── windowManager.ts           # Window lifecycle
│   │   ├── tabManager.ts              # Tab management
│   │   ├── modeManager.ts             # Mode switching
│   │   ├── inspireResolver.ts         # inspire:// handling
│   │   ├── historyManager.ts          # Browsing history
│   │   ├── bookmarkManager.ts         # Bookmarks
│   │   ├── navigationInterceptor.ts   # URL filtering
│   │   ├── ipcHandler.ts              # IPC registration
│   │   ├── settingsManager.ts         # User settings
│   │   ├── blacklistManager.ts        # Site blocking
│   │   ├── updateManager.ts           # Auto-updates
│   │   ├── sessionStateManager.ts     # State persistence
│   │   └── firstRunManager.ts         # First-run setup
│   │
│   ├── preload/                       # Preload scripts
│   │   └── preload.ts                 # Context bridge
│   │
│   ├── renderer/                      # Renderer process code
│   │   ├── index.html                 # Main HTML
│   │   ├── renderer.ts                # UI logic
│   │   └── styles.css                 # Styling
│   │
│   └── shared/                        # Shared code
│       └── types.ts                   # Type definitions, IPC channels
│
├── build/                             # Build resources
│   ├── installer.nsh                  # Custom NSIS script
│   ├── installerHeader.bmp           # Installer header image
│   └── installerSidebar.bmp          # Installer sidebar image
│
├── assets/                            # Application assets
│   ├── icon.ico                       # Windows icon
│   └── jubilee.png                    # Application logo
│
├── resources/                         # Bundled resources
│   └── README.txt                     # Resource documentation
│
├── help/                              # Documentation
│   ├── README.md                      # Documentation index
│   ├── INSTALLATION.md               # Installation guide
│   ├── AUTO_UPDATE.md                # Update system guide
│   ├── ARCHITECTURE.md               # This file
│   └── ...                            # Other documentation
│
├── docs/                              # Additional documentation
│   └── DEPLOYMENT.md                  # Enterprise deployment
│
├── dist/                              # Compiled output (generated)
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/
│
├── release/                           # Built installers (generated)
│
├── package.json                       # Project configuration
├── tsconfig.json                      # TypeScript configuration
├── LICENSE.txt                        # License file
└── blacklist.yaml                     # Default blacklist
```

---

## Related Documentation

- [INSTALLATION.md](INSTALLATION.md) - Installation process
- [AUTO_UPDATE.md](AUTO_UPDATE.md) - Update system
- [FIRST_RUN.md](FIRST_RUN.md) - First-run process
- [BUILDING.md](BUILDING.md) - Building from source
