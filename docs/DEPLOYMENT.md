# Jubilee Browser Deployment Guide

This guide covers deploying Jubilee Browser in organizational environments such as churches, schools, and enterprises.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Enterprise Portal**: [https://jubileebrowser.com/enterprise](https://jubileebrowser.com/enterprise)
**Download Page**: [https://jubileebrowser.com/download](https://jubileebrowser.com/download)

## Table of Contents

1. [Installer Overview](#installer-overview)
2. [Silent Installation](#silent-installation)
3. [Group Policy Deployment](#group-policy-deployment)
4. [SCCM/Intune Deployment](#sccmintune-deployment)
5. [Configuration Management](#configuration-management)
6. [Update Management](#update-management)
7. [Troubleshooting](#troubleshooting)

---

## Installer Overview

Jubilee Browser is distributed as a Windows Installer (MSI) package, built with .NET 8 and WPF using Microsoft Edge WebView2.

### MSI Installer
- **File**: `JubileeBrowser-Setup-{version}.msi`
- **Size**: ~60 MB
- **Runtime**: Self-contained (.NET 8 runtime included)
- **Architecture**: 64-bit (x64) only
- **Prerequisite**: Microsoft Edge WebView2 Runtime (pre-installed on Windows 11, auto-installed on most Windows 10 systems)

### Key Features
- Standard Windows Installer format (MSI)
- Per-machine installation to Program Files
- Desktop and Start Menu shortcuts
- Group Policy compatible
- Silent installation support
- Automatic upgrade handling

---

## Silent Installation

### Basic Silent Install

```cmd
msiexec /i JubileeBrowser-Setup-8.0.6.msi /quiet
```

### Silent Install with Logging

```cmd
msiexec /i JubileeBrowser-Setup-8.0.6.msi /quiet /log install.log
```

### Silent Install with Custom Directory

```cmd
msiexec /i JubileeBrowser-Setup-8.0.6.msi /quiet INSTALLFOLDER="C:\Program Files\JubileeBrowser"
```

### Full Command-Line Options

| Option | Description |
|--------|-------------|
| `/i` | Install |
| `/x` | Uninstall |
| `/quiet` | Silent mode (no UI) |
| `/passive` | Unattended mode (progress bar only) |
| `/log <file>` | Write log to file |
| `INSTALLFOLDER=path` | Custom installation directory |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1602 | User cancelled installation |
| 1603 | Fatal error during installation |
| 1618 | Another installation is in progress |
| 1619 | Installation package could not be opened |
| 3010 | Restart required |

### Example: Enterprise Deployment Script

```batch
@echo off
REM Jubilee Browser Enterprise Deployment Script
REM Run as Administrator

set INSTALLER=\\fileserver\software\JubileeBrowser-Setup-8.0.6.msi
set LOG_DIR=C:\Logs\JubileeBrowser

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Installing Jubilee Browser...
msiexec /i "%INSTALLER%" /quiet /log "%LOG_DIR%\install.log"

if %ERRORLEVEL% EQU 0 (
    echo Installation successful >> "%LOG_DIR%\status.log"
) else if %ERRORLEVEL% EQU 3010 (
    echo Installation successful - restart required >> "%LOG_DIR%\status.log"
) else (
    echo Installation failed with code %ERRORLEVEL% >> "%LOG_DIR%\status.log"
)
```

---

## Group Policy Deployment

MSI packages integrate natively with Group Policy Software Installation.

### Prerequisites
- Active Directory domain
- Group Policy Management Console (GPMC)
- Network share accessible by target computers

### Step 1: Prepare the Distribution Share

```
\\domain.local\NETLOGON\Software\JubileeBrowser\
    JubileeBrowser-Setup-8.0.6.msi
```

Ensure the share has Read permissions for Domain Computers.

### Step 2: Create GPO for Software Installation

1. Open Group Policy Management Console
2. Create a new GPO: "Deploy Jubilee Browser"
3. Navigate to: **Computer Configuration > Policies > Software Settings > Software Installation**
4. Right-click > New > Package
5. Browse to the MSI file using the UNC path (e.g., `\\domain.local\NETLOGON\Software\JubileeBrowser\JubileeBrowser-Setup-8.0.6.msi`)
6. Select "Assigned" deployment method

### Step 3: Link and Apply

1. Link GPO to appropriate OUs (e.g., Workstations, Lab Computers)
2. Configure security filtering if needed
3. Installation occurs at next computer restart

### Upgrading via GPO

To deploy a new version:
1. Add the new MSI to the same GPO
2. Right-click the new package > Properties > Upgrades
3. Add the previous version package
4. Select "Uninstall the existing package, then install the upgrade package"

---

## SCCM/Intune Deployment

### Microsoft Endpoint Configuration Manager (SCCM)

1. Create a new Application in Software Library
2. Deployment Type: Windows Installer (MSI)
3. Installation program: `msiexec /i JubileeBrowser-Setup-8.0.6.msi /quiet`
4. Uninstall program: `msiexec /x {A1B2C3D4-E5F6-7890-ABCD-EF1234567890} /quiet`
5. Detection Method: MSI product code or file existence check

### Microsoft Intune

1. Add app: Line-of-business app (MSI)
2. Upload the MSI file
3. Configure app information
4. Assign to device groups
5. MSI command-line arguments: `/quiet`

---

## Configuration Management

### Default Settings Location

```
Per-Machine: C:\Program Files\Jubilee Browser\appsettings.json
Per-User:    %LOCALAPPDATA%\JubileeBrowser\settings.json
```

### Pre-configuring Settings

Create a `settings.json` file with your organization's defaults:

```json
{
  "homepage": "https://jubileeverse.com",
  "defaultMode": "jubilee",
  "autoUpdate": true,
  "theme": "dark"
}
```

### Blocklist Location

The content filter blocklist is stored at:
```
C:\Program Files\Jubilee Browser\blacklist.yaml
```

Organizations can customize this file to add or remove blocked domains.

---

## Update Management

### Automatic Updates

The Jubilee Browser Update Agent runs as a Windows Service and:
- Checks for updates every 4 hours
- Downloads updates in the background
- Applies updates when the browser is closed
- Maintains rollback capability

### Disabling Automatic Updates

For managed environments where updates are controlled centrally, disable the Update Agent service:

```cmd
sc stop "JubileeBrowser.UpdateAgent"
sc config "JubileeBrowser.UpdateAgent" start= disabled
```

### Manual Update Deployment

1. Download new MSI from [https://jubileebrowser.com/download](https://jubileebrowser.com/download)
2. Deploy using same method as initial installation
3. The MSI handles upgrading existing installations automatically

---

## Troubleshooting

### Installation Logs

Enable MSI logging for troubleshooting:
```cmd
msiexec /i JubileeBrowser-Setup-8.0.6.msi /l*v install-verbose.log
```

### Common Issues

#### WebView2 Runtime Not Found

**Symptom**: Browser fails to start with WebView2 error
**Solution**: Install the Microsoft Edge WebView2 Runtime from:
https://developer.microsoft.com/microsoft-edge/webview2/

```cmd
REM Download and install WebView2 Evergreen Bootstrapper
MicrosoftEdgeWebview2Setup.exe /silent /install
```

#### Installation Fails with 1603

**Cause**: Various - check verbose log
**Common fixes**:
- Ensure running as Administrator
- Check available disk space
- Verify no previous installation is corrupted
- Restart Windows Installer service: `net stop msiserver && net start msiserver`

#### Cannot Connect to Update Server

**Cause**: Firewall blocking outbound HTTPS
**Solution**: Allow outbound connections to:
- `updates.jubileebrowser.com` (port 443)
- `jubileebrowser.com` (port 443)

### Uninstallation

#### Silent Uninstall by Product Code

```cmd
msiexec /x {A1B2C3D4-E5F6-7890-ABCD-EF1234567890} /quiet
```

#### Silent Uninstall by MSI File

```cmd
msiexec /x JubileeBrowser-Setup-8.0.6.msi /quiet
```

#### Complete Removal (Including User Data)

```cmd
msiexec /x {A1B2C3D4-E5F6-7890-ABCD-EF1234567890} /quiet
rmdir /S /Q "%LOCALAPPDATA%\JubileeBrowser"
rmdir /S /Q "%ProgramData%\JubileeBrowser"
```

### Registry Keys

Installation creates the following registry entries:

```
HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{ProductCode}
HKLM\Software\JubileeBrowser
```

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Windows 10 (64-bit) | Windows 10/11 (64-bit) |
| **Processor** | 1 GHz dual-core | 2 GHz quad-core |
| **Memory** | 4 GB RAM | 8 GB RAM |
| **Disk Space** | 200 MB | 500 MB |
| **Runtime** | WebView2 Runtime | (Included with Windows 11) |

---

## Support

- **Main Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
- **Documentation**: [https://jubileebrowser.com/docs](https://jubileebrowser.com/docs)
- **Enterprise Portal**: [https://jubileebrowser.com/enterprise](https://jubileebrowser.com/enterprise)
- **Support Portal**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
- **Email**: support@jubileebrowser.com

---

*Last updated: 2024*
*© 2024 Jubilee Software, Inc. - [https://jubileebrowser.com](https://jubileebrowser.com)*
