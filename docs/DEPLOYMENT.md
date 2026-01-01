# Jubilee Browser Deployment Guide

This guide covers deploying Jubilee Browser in organizational environments such as churches, schools, and enterprises.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Enterprise Portal**: [https://jubileebrowser.com/enterprise](https://jubileebrowser.com/enterprise)
**Download Page**: [https://jubileebrowser.com/download](https://jubileebrowser.com/download)

## Table of Contents

1. [Installer Types](#installer-types)
2. [Silent Installation](#silent-installation)
3. [Group Policy Deployment](#group-policy-deployment)
4. [Configuration Management](#configuration-management)
5. [Update Management](#update-management)
6. [Troubleshooting](#troubleshooting)

---

## Installer Types

Jubilee Browser provides two installer variants:

### Web Installer (Recommended)
- **File**: `Jubilee-WebSetup-{version}.exe`
- **Size**: ~2 MB
- Downloads the full package during installation
- Ideal for: Individual installations with internet access

### Offline Installer
- **File**: `Jubilee-Setup-{version}.exe`
- **Size**: ~80 MB
- Contains all files needed for installation
- Ideal for: Air-gapped networks, mass deployment, slow connections

---

## Silent Installation

### Basic Silent Install (Per-User)

```batch
Jubilee-Setup-{version}.exe /S
```

### Silent Install (Per-Machine, All Users)

```batch
Jubilee-Setup-{version}.exe /S /D=C:\Program Files\JubileeBrowser
```

**Note**: Per-machine installation requires administrator privileges.

### Full Command-Line Options

| Option | Description |
|--------|-------------|
| `/S` | Silent mode (no UI) |
| `/D=path` | Installation directory |
| `/NCRC` | Skip CRC check (not recommended) |
| `/AllUsers` | Install for all users (per-machine) |
| `/CurrentUser` | Install for current user only (default) |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Installation cancelled by user |
| 2 | Installation failed |
| 3 | Installation directory already exists |

### Example: Enterprise Deployment Script

```batch
@echo off
REM Jubilee Browser Enterprise Deployment Script
REM Run as Administrator

set INSTALLER=\\fileserver\software\Jubilee-Setup-1.0.0.exe
set LOG_DIR=C:\Logs\JubileeBrowser

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Installing Jubilee Browser...
"%INSTALLER%" /S /AllUsers

if %ERRORLEVEL% EQU 0 (
    echo Installation successful >> "%LOG_DIR%\install.log"
) else (
    echo Installation failed with code %ERRORLEVEL% >> "%LOG_DIR%\install.log"
)
```

---

## Group Policy Deployment

### Prerequisites
- Active Directory domain
- Group Policy Management Console (GPMC)
- Software distribution share

### Step 1: Prepare the Distribution Share

```
\\domain.local\NETLOGON\Software\JubileeBrowser\
    Jubilee-Setup-1.0.0.exe
    install.bat
    config\
        settings.json
```

### Step 2: Create Installation Script

Create `install.bat`:

```batch
@echo off
REM Check if already installed
if exist "C:\Program Files\JubileeBrowser\Jubilee.exe" (
    exit /b 0
)

REM Install silently for all users
"\\domain.local\NETLOGON\Software\JubileeBrowser\Jubilee-Setup-1.0.0.exe" /S /AllUsers

REM Copy preconfigured settings if needed
if exist "\\domain.local\NETLOGON\Software\JubileeBrowser\config\settings.json" (
    xcopy /Y "\\domain.local\NETLOGON\Software\JubileeBrowser\config\settings.json" "%LOCALAPPDATA%\JubileeBrowser\"
)
```

### Step 3: Create GPO

1. Open Group Policy Management Console
2. Create a new GPO: "Deploy Jubilee Browser"
3. Navigate to: Computer Configuration > Policies > Windows Settings > Scripts > Startup
4. Add the installation script

### Step 4: Link and Filter

1. Link GPO to appropriate OUs
2. Configure security filtering if needed
3. Force update: `gpupdate /force`

---

## Configuration Management

### Default Settings Location

```
Per-User:    %LOCALAPPDATA%\JubileeBrowser\settings.json
Per-Machine: C:\Program Files\JubileeBrowser\resources\default-settings.json
```

### Pre-configuring Settings

Create a `settings.json` file with your organization's defaults:

```json
{
  "homepage": "https://intranet.yourorg.com",
  "searchEngine": "duckduckgo",
  "defaultMode": "internet",
  "autoUpdate": true,
  "theme": "system",
  "telemetryEnabled": false
}
```

### Locking Settings (Enterprise)

To prevent users from changing certain settings, create a `policies.json`:

```json
{
  "homepage": {
    "value": "https://intranet.yourorg.com",
    "locked": true
  },
  "autoUpdate": {
    "value": true,
    "locked": true
  }
}
```

Place in: `C:\Program Files\JubileeBrowser\resources\policies.json`

---

## Update Management

### Automatic Updates

By default, Jubilee Browser checks for updates every 4 hours and downloads them in the background. Updates are applied on next restart.

### Disabling Automatic Updates

For managed environments where updates are controlled centrally:

1. **Via Settings**: Settings > Updates > Disable automatic updates
2. **Via Policy**:
```json
{
  "autoUpdate": {
    "value": false,
    "locked": true
  }
}
```

### Manual Update Deployment

1. Download new installer from [https://jubileebrowser.com/download](https://jubileebrowser.com/download)
2. Deploy using same method as initial installation
3. The installer handles upgrading existing installations

### Update Channels

| Channel | Description |
|---------|-------------|
| `stable` | Production releases (default) |
| `beta` | Pre-release testing |

To switch channels, modify `%LOCALAPPDATA%\JubileeBrowser\update-state.json`:

```json
{
  "channel": "beta"
}
```

---

## Troubleshooting

### Installation Logs

Installer logs are written to:
```
%TEMP%\JubileeBrowser-install.log
```

Enable verbose logging:
```batch
Jubilee-Setup-{version}.exe /S /LOG=%TEMP%\jubilee-install-verbose.log
```

### Common Issues

#### Installation fails silently

**Cause**: Insufficient permissions
**Solution**: Run as Administrator or use per-user installation

#### Cannot connect to update server

**Cause**: Firewall blocking outbound HTTPS
**Solution**: Allow outbound connections to:
- `updates.jubileebrowser.com` (port 443)
- `downloads.jubileebrowser.com` (port 443)

#### Installation directory access denied

**Cause**: Per-machine install without admin rights
**Solution**: Use per-user install or run installer elevated

### Uninstallation

#### Silent Uninstall

```batch
"C:\Program Files\JubileeBrowser\Uninstall Jubilee Browser.exe" /S
```

#### Complete Removal (Including User Data)

```batch
"C:\Program Files\JubileeBrowser\Uninstall Jubilee Browser.exe" /S
rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser"
```

### Registry Keys

Installation creates the following registry entries:

**Per-User Installation:**
```
HKCU\Software\JubileeBrowser
HKCU\Software\Classes\inspire (protocol handler)
```

**Per-Machine Installation:**
```
HKLM\Software\JubileeBrowser
HKLM\Software\Classes\inspire (protocol handler)
HKLM\Software\RegisteredApplications\JubileeBrowser
```

---

## Support

- **Main Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
- **Documentation**: [https://jubileebrowser.com/docs](https://jubileebrowser.com/docs)
- **Enterprise Portal**: [https://jubileebrowser.com/enterprise](https://jubileebrowser.com/enterprise)
- **Support Portal**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
- **Email**: support@jubileebrowser.com
- **Issue Tracker**: [https://github.com/jubileebrowser/jubilee/issues](https://github.com/jubileebrowser/jubilee/issues)

---

*Last updated: 2024*
*© 2024 Jubilee Software, Inc. - [https://jubileebrowser.com](https://jubileebrowser.com)*
