# Jubilee Browser Installation Guide

This document provides comprehensive documentation of the Jubilee Browser installation process for IT developers.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Download Page**: [https://jubileebrowser.com/download](https://jubileebrowser.com/download)

## Table of Contents

1. [Installation Overview](#installation-overview)
2. [Installer Types](#installer-types)
3. [Installation Flow](#installation-flow)
4. [Directory Structure](#directory-structure)
5. [Registry Entries](#registry-entries)
6. [First-Run Process](#first-run-process)
7. [Installation Modes](#installation-modes)
8. [Command-Line Options](#command-line-options)
9. [Post-Installation](#post-installation)
10. [Uninstallation](#uninstallation)

---

## Installation Overview

Jubilee Browser uses electron-builder with NSIS (Nullsoft Scriptable Install System) to create Windows installers. The installation system supports:

- **Two installer variants**: Web (bootstrap) and Offline (full package)
- **Two installation scopes**: Per-user and Per-machine
- **Silent installation**: For automated deployments
- **Differential updates**: Minimizes download sizes for updates
- **Protocol handler registration**: Registers `inspire://` URL scheme

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    electron-builder                          │
│  (Orchestrates the build and packaging process)             │
├─────────────────────────────────────────────────────────────┤
│                         NSIS                                 │
│  (Creates Windows .exe installer with custom scripts)       │
├─────────────────────────────────────────────────────────────┤
│                    installer.nsh                             │
│  (Custom NSIS macros for registry, logging, protocols)      │
├─────────────────────────────────────────────────────────────┤
│                   FirstRunManager                            │
│  (Post-installation initialization in Electron app)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Installer Types

### Web Installer (Bootstrap)

**File Pattern**: `Jubilee-WebSetup-{version}.exe`
**Size**: ~2-3 MB

The web installer is a small bootstrap executable that:
1. Downloads the main application package during installation
2. Verifies package integrity
3. Extracts and installs the application

**Advantages**:
- Small initial download
- Always installs the latest version
- Good for individual users

**Configuration** (package.json):
```json
{
  "nsisWeb": {
    "appPackageUrl": "https://downloads.jubileebrowser.com/releases/${channel}/${arch}",
    "artifactName": "${name}-WebSetup-${version}.${ext}"
  }
}
```

### Offline Installer (Full Package)

**File Pattern**: `Jubilee-Setup-{version}.exe`
**Size**: ~80-100 MB

The offline installer contains all files needed for installation:
1. Complete application package embedded
2. No internet connection required during install
3. Suitable for air-gapped environments

**Advantages**:
- Works without internet
- Predictable installation
- Good for enterprise deployment

**Build Command**:
```bash
npm run package:offline
```

---

## Installation Flow

### Stage 1: Installer Execution

```
┌─────────────────────────────────────────────────────────────┐
│                    User runs installer                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              NSIS customInit macro executes                  │
│  • Sets up logging ($TEMP\jubilee-install.log)              │
│  • Checks for existing installation                          │
│  • Logs installer version and target directory              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  License Agreement                           │
│  • Displays LICENSE.txt                                      │
│  • User must accept to continue                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Installation Type Selection                     │
│  • Per-user (default, no admin required)                    │
│  • Per-machine (requires admin elevation)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   File Extraction                            │
│  • Extracts app files to INSTDIR                            │
│  • Creates shortcuts (Desktop, Start Menu)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              NSIS customInstall macro executes               │
│  • Creates .first-run flag file                              │
│  • Writes registry entries                                   │
│  • Registers protocol handlers                               │
│  • Copies installation log                                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 Installation Complete                        │
│  • Option to launch application                              │
│  • Installer exits                                           │
└─────────────────────────────────────────────────────────────┘
```

### Stage 2: First Application Launch

```
┌─────────────────────────────────────────────────────────────┐
│                Application starts                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           FirstRunManager.initialize()                       │
│  • Checks for .first-run flag file                          │
│  • Checks for install-info.json                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐
│    First Run        │   │   Existing Install  │
│    Detected         │   │   (Skip setup)      │
└──────────┬──────────┘   └─────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│           performFirstRunSetup()                             │
│  1. Ensure user data directories exist                       │
│  2. Create install-info.json                                 │
│  3. Initialize default settings.json                         │
│  4. Create profile directories                               │
│  5. Remove .first-run flag                                   │
│  6. Mark firstRunCompleted = true                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Normal application startup                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

### Per-User Installation

```
%LOCALAPPDATA%\Programs\JubileeBrowser\    (INSTDIR)
├── Jubilee.exe                             # Main executable
├── resources\                              # Electron resources
│   ├── app.asar                           # Packaged application
│   └── ...
├── locales\                                # Language files
├── .first-run                              # First-run flag (temporary)
├── install.log                             # Installation log
└── Uninstall Jubilee Browser.exe          # Uninstaller

%LOCALAPPDATA%\JubileeBrowser\              (User Data)
├── settings.json                           # User settings
├── install-info.json                       # Installation metadata
├── update-state.json                       # Update manager state
├── update.log                              # Update activity log
├── session-state.json                      # Session restoration data
├── profiles\
│   └── default\
│       ├── bookmarks\                      # Bookmark data
│       ├── history\                        # Browsing history
│       └── sessions\                       # Session data
├── cache\                                  # Application cache
└── logs\                                   # Application logs
```

### Per-Machine Installation

```
C:\Program Files\JubileeBrowser\            (INSTDIR)
├── Jubilee.exe
├── resources\
│   ├── app.asar
│   ├── default-settings.json              # System-wide defaults
│   └── policies.json                       # Enterprise policies
├── locales\
├── install.log
└── Uninstall Jubilee Browser.exe

%LOCALAPPDATA%\JubileeBrowser\              (Per-user data - same as above)
```

---

## Registry Entries

### Per-User Installation (HKCU)

```registry
; Application information
[HKEY_CURRENT_USER\Software\JubileeBrowser]
"InstallPath"="C:\\Users\\{user}\\AppData\\Local\\Programs\\JubileeBrowser"
"Version"="1.0.0"
"InstallDate"="2024-01-15"
"PerMachine"=dword:00000000

; Windows registered application
[HKEY_CURRENT_USER\Software\RegisteredApplications]
"JubileeBrowser"="Software\\JubileeBrowser\\Capabilities"

; Application capabilities
[HKEY_CURRENT_USER\Software\JubileeBrowser\Capabilities]
"ApplicationName"="Jubilee Browser"
"ApplicationDescription"="A dual-mode browser for Internet and Jubilee Bibles"
"ApplicationIcon"="C:\\Users\\{user}\\...\\Jubilee.exe,0"

; URL associations
[HKEY_CURRENT_USER\Software\JubileeBrowser\Capabilities\URLAssociations]
"http"="JubileeBrowserHTML"
"https"="JubileeBrowserHTML"
"inspire"="JubileeBrowserInspire"

; inspire:// protocol handler
[HKEY_CURRENT_USER\Software\Classes\inspire]
@="URL:Inspire Protocol"
"URL Protocol"=""

[HKEY_CURRENT_USER\Software\Classes\inspire\DefaultIcon]
@="C:\\Users\\{user}\\...\\Jubilee.exe,0"

[HKEY_CURRENT_USER\Software\Classes\inspire\shell\open\command]
@="\"C:\\Users\\{user}\\...\\Jubilee.exe\" \"%1\""

; HTML document class
[HKEY_CURRENT_USER\Software\Classes\JubileeBrowserHTML]
@="Jubilee Browser HTML Document"

[HKEY_CURRENT_USER\Software\Classes\JubileeBrowserHTML\shell\open\command]
@="\"C:\\Users\\{user}\\...\\Jubilee.exe\" \"%1\""

; Inspire document class
[HKEY_CURRENT_USER\Software\Classes\JubileeBrowserInspire]
@="Jubilee Browser Inspire Document"

[HKEY_CURRENT_USER\Software\Classes\JubileeBrowserInspire\shell\open\command]
@="\"C:\\Users\\{user}\\...\\Jubilee.exe\" \"%1\""

; Uninstall information
[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\{GUID}]
"DisplayName"="Jubilee Browser"
"DisplayVersion"="1.0.0"
"Publisher"="Jubilee Software, Inc."
"UninstallString"="\"...\\Uninstall Jubilee Browser.exe\""
```

### Per-Machine Installation (HKLM)

Same structure but under `HKEY_LOCAL_MACHINE` instead of `HKEY_CURRENT_USER`.

---

## First-Run Process

The FirstRunManager class handles post-installation initialization.

### Source File
`src/main/firstRunManager.ts`

### Detection Logic

```typescript
private checkFirstRun(): boolean {
  // Check 1: Look for .first-run flag file (set by installer)
  const installFlagPath = path.join(this.installPath, '..', FIRST_RUN_FLAG_FILE);
  const exeFlagPath = path.join(path.dirname(process.execPath), FIRST_RUN_FLAG_FILE);

  // Check 2: Look for install-info.json (indicates previous run)
  const installInfoPath = path.join(this.userDataPath, INSTALL_INFO_FILE);

  // First run if: flag exists OR no install info exists
  const flagExists = fs.existsSync(installFlagPath) || fs.existsSync(exeFlagPath);
  const installInfoExists = fs.existsSync(installInfoPath);

  if (flagExists) {
    // Remove flag files after detection
    // ...
    return true;
  }

  return !installInfoExists;
}
```

### Setup Steps

1. **Ensure User Data Directory**
   ```typescript
   const directories = [
     this.userDataPath,
     path.join(this.userDataPath, 'profiles'),
     path.join(this.userDataPath, 'profiles', 'default'),
     path.join(this.userDataPath, 'cache'),
     path.join(this.userDataPath, 'logs'),
   ];
   ```

2. **Create Install Info**
   ```typescript
   this.installInfo = {
     installedVersion: app.getVersion(),
     installDate: new Date().toISOString(),
     installType: 'fresh',  // 'fresh' | 'upgrade' | 'repair'
     firstRunCompleted: false,
     autoUpdateEnabled: true,
   };
   ```

3. **Initialize Default Settings**
   - Copies DEFAULT_SETTINGS to settings.json

4. **Create Profile Directories**
   ```
   profiles/default/bookmarks/
   profiles/default/history/
   profiles/default/sessions/
   ```

5. **Mark First Run Completed**
   - Sets `firstRunCompleted: true` in install-info.json

### Upgrade Detection

```typescript
if (this.installInfo.installedVersion !== app.getVersion()) {
  console.log(`Upgrade detected: ${this.installInfo.installedVersion} -> ${app.getVersion()}`);
  this.installInfo.previousVersion = this.installInfo.installedVersion;
  this.installInfo.installedVersion = app.getVersion();
  this.installInfo.installType = 'upgrade';
  this.installInfo.installDate = new Date().toISOString();
  this.saveInstallInfo();
}
```

---

## Installation Modes

### Per-User Installation (Default)

- **No admin rights required**
- Installs to: `%LOCALAPPDATA%\Programs\JubileeBrowser`
- Registry entries in: `HKEY_CURRENT_USER`
- Each user gets their own installation
- Recommended for: Personal computers, BYOD

### Per-Machine Installation

- **Requires administrator privileges**
- Installs to: `C:\Program Files\JubileeBrowser`
- Registry entries in: `HKEY_LOCAL_MACHINE`
- Single installation shared by all users
- Recommended for: Managed environments, shared computers

**Triggering per-machine install**:
```batch
JubileeSetup.exe /ALLUSERS
```

---

## Command-Line Options

### Standard Options

| Option | Description |
|--------|-------------|
| `/S` | Silent mode - no user interface |
| `/D=<path>` | Set installation directory (must be last parameter) |
| `/NCRC` | Skip CRC integrity check (not recommended) |

### Custom Options

| Option | Description |
|--------|-------------|
| `/ALLUSERS` | Install for all users (per-machine) |
| `/CURRENTUSER` | Install for current user only (per-user, default) |
| `/LOG=<file>` | Write installation log to specified file |

### Examples

```batch
# Basic silent install (per-user)
JubileeSetup.exe /S

# Silent per-machine install
JubileeSetup.exe /S /ALLUSERS

# Silent install with custom directory
JubileeSetup.exe /S /D=C:\CustomPath\Jubilee

# Silent install with logging
JubileeSetup.exe /S /LOG=C:\Logs\install.log

# Full example for enterprise
JubileeSetup.exe /S /ALLUSERS /LOG=\\server\logs\%COMPUTERNAME%-install.log
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Installation successful |
| 1 | Installation cancelled by user |
| 2 | Installation failed (general error) |
| 3 | Installation directory already exists |
| 5 | Access denied (insufficient permissions) |

---

## Post-Installation

### Verification Steps

1. **Check executable exists**:
   ```batch
   dir "%LOCALAPPDATA%\Programs\JubileeBrowser\Jubilee.exe"
   ```

2. **Check registry entries**:
   ```batch
   reg query "HKCU\Software\JubileeBrowser" /v Version
   ```

3. **Check protocol handler**:
   ```batch
   reg query "HKCU\Software\Classes\inspire\shell\open\command"
   ```

4. **Test application launch**:
   ```batch
   start "" "%LOCALAPPDATA%\Programs\JubileeBrowser\Jubilee.exe"
   ```

5. **Test protocol handler**:
   ```batch
   start inspire://test
   ```

### Installation Log

The installation log is saved to:
- During install: `%TEMP%\jubilee-install.log`
- After install: `{INSTDIR}\install.log`

Log format:
```
[2024-01-15 10:30:45] Jubilee Browser installation started
[2024-01-15 10:30:45] Installer version: 1.0.0
[2024-01-15 10:30:45] Target directory: C:\Users\user\AppData\Local\Programs\JubileeBrowser
[2024-01-15 10:30:52] Installation completed successfully
```

---

## Uninstallation

### Interactive Uninstall

Run the uninstaller from:
- Start Menu: `Jubilee Browser > Uninstall Jubilee Browser`
- Control Panel: `Programs and Features > Jubilee Browser > Uninstall`
- Direct: `{INSTDIR}\Uninstall Jubilee Browser.exe`

### Silent Uninstall

```batch
"C:\Users\{user}\AppData\Local\Programs\JubileeBrowser\Uninstall Jubilee Browser.exe" /S
```

### Complete Removal (Including User Data)

```batch
# Uninstall application
"...\Uninstall Jubilee Browser.exe" /S

# Remove user data (optional)
rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser"
```

### What Gets Removed

**Removed by uninstaller**:
- Application files in INSTDIR
- Desktop shortcut
- Start Menu shortcuts
- Registry entries (Software\JubileeBrowser, protocol handlers, etc.)
- Uninstall registry entry

**Preserved by default** (`deleteAppDataOnUninstall: false`):
- User data in `%LOCALAPPDATA%\JubileeBrowser`
- Settings, bookmarks, history
- This allows reinstallation without data loss

---

## Related Documentation

- [BUILDING.md](BUILDING.md) - How to build installers
- [DEPLOYMENT.md](DEPLOYMENT.md) - Enterprise deployment
- [SILENT_INSTALL.md](SILENT_INSTALL.md) - Detailed silent install guide
- [FIRST_RUN.md](FIRST_RUN.md) - First-run process details
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Installation issues

---

## Support

For additional help with installation:
- **Documentation**: [https://jubileebrowser.com/docs](https://jubileebrowser.com/docs)
- **Support**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
- **Download Latest**: [https://jubileebrowser.com/download](https://jubileebrowser.com/download)
