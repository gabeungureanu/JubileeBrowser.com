# Jubilee Browser Auto-Update System

This document provides comprehensive documentation of the Jubilee Browser automatic update system for IT developers.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Release Notes**: [https://jubileebrowser.com/releases](https://jubileebrowser.com/releases)

## Table of Contents

1. [Update System Overview](#update-system-overview)
2. [Architecture](#architecture)
3. [Update Flow](#update-flow)
4. [UpdateManager Implementation](#updatemanager-implementation)
5. [Update Server Requirements](#update-server-requirements)
6. [Update Channels](#update-channels)
7. [Differential Updates](#differential-updates)
8. [Security Considerations](#security-considerations)
9. [User Interface](#user-interface)
10. [Configuration Options](#configuration-options)
11. [Troubleshooting](#troubleshooting)

---

## Update System Overview

Jubilee Browser uses `electron-updater` to provide seamless automatic updates. The system is designed to:

- **Check automatically**: Background checks every 4 hours
- **Download silently**: Updates download without interrupting the user
- **Install on quit**: Updates apply when the user closes the browser
- **Support manual checks**: Users can trigger checks from the About dialog
- **Preserve state**: Sessions are saved and restored across updates

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| UpdateManager | `src/main/updateManager.ts` | Core update logic |
| SessionStateManager | `src/main/sessionStateManager.ts` | Preserves state across updates |
| FirstRunManager | `src/main/firstRunManager.ts` | Handles post-update initialization |
| IPC Handlers | `src/main/ipcHandler.ts` | Bridge between main/renderer |
| Update UI | `src/renderer/index.html` | About dialog, notifications |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Update Server                                   │
│                 https://updates.jubileebrowser.com                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ latest.yml  │  │ 1.0.1.exe   │  │ 1.0.1.nupkg │  │ RELEASES    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Jubilee Browser                                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Main Process                                  │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │    │
│  │  │  UpdateManager  │  │ SessionState    │  │ FirstRun       │  │    │
│  │  │                 │  │ Manager         │  │ Manager        │  │    │
│  │  │ • Check updates │  │ • Save state    │  │ • Detect       │  │    │
│  │  │ • Download      │  │ • Restore tabs  │  │   upgrade      │  │    │
│  │  │ • Install       │  │ • Window pos    │  │ • Migrate      │  │    │
│  │  └────────┬────────┘  └────────┬────────┘  └────────────────┘  │    │
│  │           │                    │                                 │    │
│  │           │    IPC Channels    │                                 │    │
│  │           ▼                    ▼                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │                    IPC Handler                           │   │    │
│  │  │  • UPDATE_CHECK    • UPDATE_INSTALL                      │   │    │
│  │  │  • UPDATE_STATE    • SESSION_SAVE                        │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                         contextBridge                                    │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                   Renderer Process                              │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │    │
│  │  │  About Dialog   │  │ Update Badge    │  │ Progress UI    │  │    │
│  │  │  • Check btn    │  │ • "Update ready"│  │ • Download %   │  │    │
│  │  │  • Install btn  │  │ • Restart btn   │  │                │  │    │
│  │  └─────────────────┘  └─────────────────┘  └────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Update Flow

### Automatic Update Check

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Application Start                                     │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              UpdateManager.initialize(mainWindow)                        │
│  • Set mainWindow reference                                              │
│  • Start update schedule                                                 │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Wait 30 seconds (INITIAL_CHECK_DELAY_MS)                    │
│  • Allows app to fully initialize                                        │
│  • User can start working immediately                                    │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    checkForUpdates()                                     │
│  • autoUpdater.checkForUpdates()                                         │
│  • State: 'checking'                                                     │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   update-not-available   │  │    update-available      │
│   • State: 'not-available'│  │   • State: 'available'   │
│   • Schedule next check  │  │   • Auto-download starts │
└──────────────────────────┘  └────────────┬─────────────┘
                                           │
                                           ▼
                              ┌──────────────────────────┐
                              │    download-progress     │
                              │   • State: 'downloading' │
                              │   • Send progress to UI  │
                              └────────────┬─────────────┘
                                           │
                                           ▼
                              ┌──────────────────────────┐
                              │    update-downloaded     │
                              │   • State: 'downloaded'  │
                              │   • Show notification    │
                              │   • Save state           │
                              └──────────────────────────┘
```

### Update Installation

```
┌─────────────────────────────────────────────────────────────────────────┐
│            User clicks "Restart to Update"                               │
│            OR App is about to quit with pending update                   │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              SessionStateManager.prepareForUpdate()                      │
│  • Save current window position/size                                     │
│  • Save all open tabs (URLs, titles, modes)                             │
│  • Save active tab ID                                                    │
│  • Set pendingUpdate: true                                               │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              UpdateManager.installUpdate()                               │
│  • Notify renderer: status = 'installing'                               │
│  • Wait 500ms for state to save                                          │
│  • Call autoUpdater.quitAndInstall(false, true)                         │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Application Closes                                          │
│  • Installer runs in background                                          │
│  • New version is installed                                              │
│  • Application restarts automatically                                    │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              New Version Starts                                          │
│  • FirstRunManager detects upgrade                                       │
│  • SessionStateManager restores state                                    │
│  • Tabs reopened at previous URLs                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## UpdateManager Implementation

### Source File
`src/main/updateManager.ts`

### Key Constants

```typescript
// Timing constants
const INITIAL_CHECK_DELAY_MS = 30 * 1000;      // 30 seconds after launch
const NORMAL_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;  // 4 hours
const MIN_CHECK_INTERVAL_MS = 60 * 1000;       // 1 minute minimum
const MAX_BACKOFF_INTERVAL_MS = 24 * 60 * 60 * 1000;  // 24 hours max

// Default configuration
const UPDATE_CONFIG = {
  allowDowngrade: false,
  allowPrerelease: false,
  autoDownload: true,
  autoInstallOnAppQuit: true,
};
```

### State Interface

```typescript
interface UpdateState {
  status: UpdateStatus;           // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  channel: UpdateChannel;         // 'stable' | 'beta'
  currentVersion: string;         // e.g., "1.0.0"
  availableVersion?: string;      // e.g., "1.0.1"
  downloadProgress?: number;      // 0-100
  lastCheckTime?: number;         // Unix timestamp
  lastError?: string;             // User-friendly error message
  releaseNotes?: string;          // Markdown release notes
}
```

### Event Handlers

```typescript
// Checking for updates
autoUpdater.on('checking-for-update', () => {
  this.updateState({ status: 'checking' });
});

// Update available - starts download automatically
autoUpdater.on('update-available', (info: UpdateInfo) => {
  this.updateState({
    status: 'available',
    availableVersion: info.version,
    releaseNotes: /* parsed from info */,
  });
});

// Download progress
autoUpdater.on('download-progress', (progress: ProgressInfo) => {
  this.updateState({
    status: 'downloading',
    downloadProgress: progress.percent,
  });
  // Send detailed progress to renderer
  this.sendToRenderer(IPC_CHANNELS.UPDATE_PROGRESS, {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

// Update downloaded and ready
autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
  this.updateState({
    status: 'downloaded',
    availableVersion: info.version,
    downloadProgress: 100,
  });
});

// Error handling with exponential backoff
autoUpdater.on('error', (error: Error) => {
  this.consecutiveFailures++;
  this.updateState({
    status: 'error',
    lastError: this.getUserFriendlyError(error),
  });
  this.rescheduleAfterFailure();
});
```

### Exponential Backoff

```typescript
private rescheduleAfterFailure(): void {
  // Max 6 doublings: 4h → 8h → 16h → 24h (capped)
  const backoffMultiplier = Math.min(this.consecutiveFailures, 6);
  const backoffInterval = Math.min(
    NORMAL_CHECK_INTERVAL_MS * Math.pow(2, backoffMultiplier),
    MAX_BACKOFF_INTERVAL_MS
  );
  this.scheduleNextCheck(backoffInterval);
}
```

### Logging

```typescript
private log(message: string, level: 'info' | 'error' = 'info'): void {
  // Console output
  console.log(`[UpdateManager] ${message}`);

  // File logging
  fs.appendFileSync(this.updateLogPath, `[${timestamp}] ${message}\n`);

  // Log rotation (max 1MB)
  if (stats.size > 1024 * 1024) {
    fs.renameSync(this.updateLogPath, `${this.updateLogPath}.old`);
  }
}
```

---

## Update Server Requirements

### Directory Structure

```
https://updates.jubileebrowser.com/
└── releases/
    ├── stable/
    │   ├── latest.yml                    # Update manifest
    │   ├── Jubilee-Setup-1.0.1.exe      # Full installer
    │   ├── Jubilee-Setup-1.0.1.exe.blockmap  # Differential update map
    │   └── RELEASES                      # Squirrel compatibility
    └── beta/
        ├── latest.yml
        ├── Jubilee-Setup-1.1.0-beta.1.exe
        └── Jubilee-Setup-1.1.0-beta.1.exe.blockmap
```

### latest.yml Format

```yaml
version: 1.0.1
releaseDate: '2024-01-15T10:30:00.000Z'
path: Jubilee-Setup-1.0.1.exe
sha512: base64EncodedSHA512Hash==
size: 85234567
releaseNotes: |
  ## What's New in 1.0.1

  ### Bug Fixes
  - Fixed crash on startup with certain configurations
  - Improved memory usage

  ### Improvements
  - Faster page loading
  - Better tab management
```

### Server Configuration

**Required headers**:
```
Content-Type: application/octet-stream (for .exe files)
Content-Type: text/yaml (for .yml files)
```

**CORS headers** (if serving from different domain):
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
```

**HTTPS required**: electron-updater requires HTTPS for security.

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name updates.jubileebrowser.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /releases/ {
        root /var/www/jubilee-updates;
        autoindex off;

        # Cache control
        add_header Cache-Control "public, max-age=300";

        # CORS
        add_header Access-Control-Allow-Origin *;
    }
}
```

---

## Update Channels

### Available Channels

| Channel | Description | Use Case |
|---------|-------------|----------|
| `stable` | Production releases | Default for all users |
| `beta` | Pre-release testing | Early adopters, QA |

### Configuration

**package.json**:
```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://updates.jubileebrowser.com/releases/stable",
      "channel": "stable"
    },
    "generateUpdatesFilesForAllChannels": true
  }
}
```

**UpdateManager configuration**:
```typescript
autoUpdater.setFeedURL({
  provider: 'generic',
  url: `https://updates.jubileebrowser.com/releases/${this.state.channel}`,
  channel: this.state.channel,
});
```

### Switching Channels

Users can switch channels by modifying `update-state.json`:

```json
{
  "channel": "beta",
  "lastCheckTime": 1705312245000
}
```

Or programmatically:
```typescript
// In future settings UI
updateManager.setChannel('beta');
```

---

## Differential Updates

Jubilee Browser uses electron-builder's differential update feature to minimize download sizes.

### How It Works

1. **Blockmap generation**: During build, a `.blockmap` file is created
2. **Delta calculation**: electron-updater compares blockmaps
3. **Partial download**: Only changed blocks are downloaded

### Configuration

```json
{
  "nsis": {
    "differentialPackage": true
  }
}
```

### Size Comparison

| Update Type | Typical Size |
|-------------|-------------|
| Full installer | 80-100 MB |
| Differential update | 5-20 MB |

### Requirements

- Both old and new versions must have `.blockmap` files
- Server must support HTTP Range requests

---

## Security Considerations

### Code Signing

**Windows code signing is critical for**:
- Avoiding Windows SmartScreen warnings
- Ensuring update integrity
- Building user trust

**Configuration**:
```json
{
  "win": {
    "signAndEditExecutable": true,
    "verifyUpdateCodeSignature": true
  }
}
```

### Signature Verification

electron-updater automatically verifies:
1. Download integrity (SHA512 hash from latest.yml)
2. Code signature (if `verifyUpdateCodeSignature: true`)

### HTTPS Enforcement

Updates are only served over HTTPS to prevent:
- Man-in-the-middle attacks
- Download tampering
- URL spoofing

### Update Server Security

Recommendations:
- Use strong TLS (1.2+)
- Enable HTTP Strict Transport Security (HSTS)
- Restrict upload access to CI/CD systems only
- Monitor for unauthorized file changes
- Keep access logs for auditing

---

## User Interface

### About Dialog

Located in `src/renderer/index.html`:

```html
<div class="about-update-section" id="aboutUpdateSection">
  <div class="update-status" id="updateStatus">
    <span class="update-status-text" id="updateStatusText">
      Checking for updates...
    </span>
  </div>
  <div class="update-actions" id="updateActions">
    <button class="update-btn check-update-btn" id="checkUpdateBtn">
      Check for Updates
    </button>
    <button class="update-btn install-update-btn hidden" id="installUpdateBtn">
      Restart to Update
    </button>
  </div>
  <div class="update-details" id="updateDetails">
    <p class="update-channel" id="updateChannel">Channel: Stable</p>
    <p class="last-check-time" id="lastCheckTime">Last checked: Never</p>
  </div>
</div>
```

### Update Notification Badge

```html
<div class="update-notification hidden" id="updateNotification">
  <span class="update-notification-text">Update ready</span>
  <button class="update-notification-btn" id="updateNotificationBtn">
    Restart
  </button>
  <button class="update-notification-dismiss" id="updateNotificationDismiss">
    ✕
  </button>
</div>
```

### Status Messages

| Status | User Message |
|--------|-------------|
| `idle` | "" |
| `checking` | "Checking for updates..." |
| `not-available` | "Jubilee Browser is up to date" |
| `available` | "Update available: {version}" |
| `downloading` | "Downloading update... {percent}%" |
| `downloaded` | "Update ready to install" |
| `error` | "{user-friendly error message}" |

---

## Configuration Options

### Disabling Auto-Updates

**For users** (settings.json):
```json
{
  "autoUpdate": false
}
```

**For enterprise** (policies.json):
```json
{
  "autoUpdate": {
    "value": false,
    "locked": true
  }
}
```

### Changing Check Interval

Modify constants in `updateManager.ts`:
```typescript
const NORMAL_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily instead of 4 hours
```

### Custom Update Server

```typescript
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://your-custom-server.com/updates',
});
```

---

## Troubleshooting

### Common Issues

#### Updates not checking

**Symptoms**: No update checks in logs
**Causes**:
- App not packaged (dev mode)
- Network connectivity issues

**Solution**:
Check `update.log`:
```
%LOCALAPPDATA%\JubileeBrowser\update.log
```

Look for:
```
Skip checkForUpdates because application is not packed
```

This is normal in development. Updates only work in packaged builds.

#### Download fails repeatedly

**Symptoms**: Error status, backoff increasing
**Causes**:
- Server unreachable
- Firewall blocking
- Corrupt download

**Solution**:
1. Check network connectivity to update server
2. Verify firewall allows HTTPS to updates.jubileebrowser.com
3. Check server-side logs

#### Update stuck at "downloaded"

**Symptoms**: Update downloaded but won't install
**Causes**:
- File locked by antivirus
- Insufficient permissions

**Solution**:
1. Temporarily disable antivirus
2. Run as administrator
3. Manually run installer from temp directory

#### Session not restored after update

**Symptoms**: Tabs lost after update
**Causes**:
- Session state file corrupt
- Crash during save

**Solution**:
Check session-state.json:
```
%LOCALAPPDATA%\JubileeBrowser\session-state.json
```

### Debug Logging

Enable verbose logging:
```typescript
// In updateManager.ts
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "debug";
```

### Firewall Allowlist

Required endpoints:
| Endpoint | Port | Purpose |
|----------|------|---------|
| updates.jubileebrowser.com | 443 | Update manifest and packages |
| downloads.jubileebrowser.com | 443 | Web installer packages |

---

## Related Documentation

- [INSTALLATION.md](INSTALLATION.md) - Installation process
- [UPDATE_SERVER.md](UPDATE_SERVER.md) - Setting up update server
- [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) - State persistence
- [BUILDING.md](BUILDING.md) - Building releases
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues

---

## Support

For additional help with updates:
- **Release Notes**: [https://jubileebrowser.com/releases](https://jubileebrowser.com/releases)
- **Manual Download**: [https://jubileebrowser.com/download](https://jubileebrowser.com/download)
- **Support**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
