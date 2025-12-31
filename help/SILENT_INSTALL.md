# Silent Installation Guide

This document provides detailed information about silent/unattended installation of Jubilee Browser for enterprise deployments.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Enterprise Downloads**: [https://jubileebrowser.com/enterprise](https://jubileebrowser.com/enterprise)

## Table of Contents

1. [Overview](#overview)
2. [Command-Line Options](#command-line-options)
3. [Installation Examples](#installation-examples)
4. [Exit Codes](#exit-codes)
5. [Deployment Scripts](#deployment-scripts)
6. [Configuration Files](#configuration-files)
7. [Group Policy Deployment](#group-policy-deployment)
8. [SCCM/Intune Deployment](#sccmintune-deployment)
9. [Verification](#verification)

---

## Overview

Silent installation allows Jubilee Browser to be installed without user interaction, making it ideal for:

- Mass deployment across an organization
- Automated provisioning
- System imaging
- CI/CD pipelines

### Key Features

- **No user prompts**: Installation completes without dialogs
- **Logging support**: Full installation logging available
- **Configurable scope**: Per-user or per-machine installation
- **Pre-configuration**: Deploy with custom settings

---

## Command-Line Options

### Standard NSIS Options

| Option | Description |
|--------|-------------|
| `/S` | **Silent mode** - Required for unattended install |
| `/D=<path>` | Set installation directory (must be last parameter) |
| `/NCRC` | Skip CRC integrity check (not recommended) |

### Jubilee-Specific Options

| Option | Description |
|--------|-------------|
| `/ALLUSERS` | Install for all users (per-machine, requires admin) |
| `/CURRENTUSER` | Install for current user only (default) |
| `/LOG=<file>` | Write detailed log to specified file |

### Option Details

#### `/S` - Silent Mode

Required for all unattended installations. Suppresses all UI dialogs.

```batch
JubileeSetup.exe /S
```

#### `/D=<path>` - Installation Directory

Specifies a custom installation path. **Must be the last parameter**.

```batch
# Correct
JubileeSetup.exe /S /D=C:\Apps\Jubilee

# Incorrect (D= not last)
JubileeSetup.exe /D=C:\Apps\Jubilee /S
```

#### `/ALLUSERS` - Per-Machine Installation

Installs to `C:\Program Files\JubileeBrowser` and registers for all users.

**Requirements**:
- Administrator privileges required
- UAC elevation will be requested if not already elevated

```batch
JubileeSetup.exe /S /ALLUSERS
```

#### `/CURRENTUSER` - Per-User Installation

Installs to `%LOCALAPPDATA%\Programs\JubileeBrowser` for the current user only.

**Advantages**:
- No admin rights required
- Each user has independent installation

```batch
JubileeSetup.exe /S /CURRENTUSER
```

#### `/LOG=<file>` - Installation Logging

Writes detailed installation log to the specified file.

```batch
JubileeSetup.exe /S /LOG=C:\Logs\jubilee-install.log
```

**Log contents**:
- Timestamp of each action
- Files extracted
- Registry keys written
- Success/failure status

---

## Installation Examples

### Basic Silent Install

```batch
JubileeSetup.exe /S
```
- Installs for current user
- Uses default directory
- No logging

### Silent Per-Machine Install

```batch
# Must run as administrator
JubileeSetup.exe /S /ALLUSERS
```

### Silent Install with Logging

```batch
JubileeSetup.exe /S /LOG=C:\Logs\install-%COMPUTERNAME%.log
```

### Silent Install to Custom Directory

```batch
JubileeSetup.exe /S /D=D:\Applications\JubileeBrowser
```

### Full Enterprise Install

```batch
JubileeSetup.exe /S /ALLUSERS /LOG=\\server\logs\%COMPUTERNAME%-%DATE%.log
```

### Web Installer Silent Install

The web/bootstrap installer supports the same options:

```batch
JubileeWebSetup.exe /S /ALLUSERS
```

---

## Exit Codes

The installer returns these exit codes:

| Code | Meaning | Description |
|------|---------|-------------|
| 0 | Success | Installation completed successfully |
| 1 | Cancelled | Installation was cancelled |
| 2 | Error | General installation error |
| 3 | Already exists | Installation directory already exists |
| 5 | Access denied | Insufficient permissions |
| 1603 | Fatal error | Windows Installer fatal error |

### Checking Exit Code

**Batch script**:
```batch
@echo off
JubileeSetup.exe /S
if %ERRORLEVEL% EQU 0 (
    echo Installation successful
) else (
    echo Installation failed with code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)
```

**PowerShell**:
```powershell
$process = Start-Process -FilePath "JubileeSetup.exe" -ArgumentList "/S" -Wait -PassThru
if ($process.ExitCode -eq 0) {
    Write-Host "Installation successful"
} else {
    Write-Error "Installation failed with code $($process.ExitCode)"
    exit $process.ExitCode
}
```

---

## Deployment Scripts

### Basic Batch Script

```batch
@echo off
setlocal

set INSTALLER=\\fileserver\software\JubileeSetup.exe
set LOGDIR=C:\Logs\JubileeBrowser

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%DATE% %TIME%] Starting installation... >> "%LOGDIR%\deploy.log"

"%INSTALLER%" /S /ALLUSERS /LOG="%LOGDIR%\install-%COMPUTERNAME%.log"
set EXITCODE=%ERRORLEVEL%

if %EXITCODE% EQU 0 (
    echo [%DATE% %TIME%] Installation successful >> "%LOGDIR%\deploy.log"
) else (
    echo [%DATE% %TIME%] Installation failed: %EXITCODE% >> "%LOGDIR%\deploy.log"
)

exit /b %EXITCODE%
```

### PowerShell Deployment Script

```powershell
#Requires -RunAsAdministrator

param(
    [string]$InstallerPath = "\\fileserver\software\JubileeSetup.exe",
    [string]$LogPath = "C:\Logs\JubileeBrowser",
    [switch]$PerUser
)

# Create log directory
if (-not (Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
}

$logFile = Join-Path $LogPath "install-$env:COMPUTERNAME-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$deployLog = Join-Path $LogPath "deploy.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Tee-Object -FilePath $deployLog -Append
}

Write-Log "Starting Jubilee Browser installation"
Write-Log "Installer: $InstallerPath"
Write-Log "Log file: $logFile"

# Check if already installed
$installPath = if ($PerUser) {
    "$env:LOCALAPPDATA\Programs\JubileeBrowser\Jubilee.exe"
} else {
    "$env:ProgramFiles\JubileeBrowser\Jubilee.exe"
}

if (Test-Path $installPath) {
    Write-Log "Jubilee Browser already installed at $installPath"
    # Optionally upgrade or exit
    # exit 0
}

# Build arguments
$arguments = "/S"
if (-not $PerUser) {
    $arguments += " /ALLUSERS"
}
$arguments += " /LOG=`"$logFile`""

Write-Log "Running: $InstallerPath $arguments"

# Run installer
$process = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -Wait -PassThru

# Check result
if ($process.ExitCode -eq 0) {
    Write-Log "Installation completed successfully"

    # Verify installation
    if (Test-Path $installPath) {
        $version = (Get-Item $installPath).VersionInfo.FileVersion
        Write-Log "Verified: Jubilee Browser $version installed"
    }
} else {
    Write-Log "Installation failed with exit code $($process.ExitCode)"
    Write-Log "Check log file for details: $logFile"
}

exit $process.ExitCode
```

### Pre-Configuration Script

Deploy with custom settings:

```powershell
#Requires -RunAsAdministrator

param(
    [string]$InstallerPath,
    [string]$ConfigPath = "\\fileserver\config\jubilee"
)

# Install Jubilee Browser
& $InstallerPath /S /ALLUSERS

if ($LASTEXITCODE -ne 0) {
    Write-Error "Installation failed"
    exit $LASTEXITCODE
}

# Apply pre-configured settings
$userDataPath = "$env:ProgramData\JubileeBrowser"
if (-not (Test-Path $userDataPath)) {
    New-Item -ItemType Directory -Path $userDataPath -Force | Out-Null
}

# Copy settings
if (Test-Path "$ConfigPath\settings.json") {
    Copy-Item "$ConfigPath\settings.json" "$userDataPath\" -Force
}

# Copy policies (for locked settings)
if (Test-Path "$ConfigPath\policies.json") {
    Copy-Item "$ConfigPath\policies.json" "$env:ProgramFiles\JubileeBrowser\resources\" -Force
}

# Copy blacklist
if (Test-Path "$ConfigPath\blacklist.yaml") {
    Copy-Item "$ConfigPath\blacklist.yaml" "$env:ProgramFiles\JubileeBrowser\" -Force
}

Write-Host "Jubilee Browser installed and configured successfully"
```

---

## Configuration Files

### Pre-Deployment Settings

Create `settings.json` for deployment:

```json
{
  "homepage": "https://intranet.yourcompany.com",
  "searchEngine": "duckduckgo",
  "defaultMode": "internet",
  "autoUpdate": false,
  "telemetryEnabled": false,
  "theme": "system"
}
```

### Enterprise Policies

Create `policies.json` to lock settings:

```json
{
  "homepage": {
    "value": "https://intranet.yourcompany.com",
    "locked": true
  },
  "autoUpdate": {
    "value": false,
    "locked": true
  },
  "blacklistEnabled": {
    "value": true,
    "locked": true
  }
}
```

### Custom Blacklist

Create `blacklist.yaml`:

```yaml
sites:
  - facebook.com
  - twitter.com
  - tiktok.com
  - instagram.com

keywords:
  - gambling
  - casino
```

---

## Group Policy Deployment

### Step 1: Prepare Network Share

```
\\domain.local\NETLOGON\Software\JubileeBrowser\
├── JubileeSetup.exe
├── install.bat
└── config\
    ├── settings.json
    ├── policies.json
    └── blacklist.yaml
```

### Step 2: Create Installation Script

`install.bat`:
```batch
@echo off
setlocal

set SOURCE=\\domain.local\NETLOGON\Software\JubileeBrowser
set LOGDIR=%TEMP%\JubileeInstall

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

REM Check if already installed
if exist "%ProgramFiles%\JubileeBrowser\Jubilee.exe" (
    echo Already installed >> "%LOGDIR%\skip.log"
    exit /b 0
)

REM Install silently
"%SOURCE%\JubileeSetup.exe" /S /ALLUSERS /LOG="%LOGDIR%\install.log"

REM Copy configuration
if exist "%SOURCE%\config\policies.json" (
    copy /Y "%SOURCE%\config\policies.json" "%ProgramFiles%\JubileeBrowser\resources\"
)

if exist "%SOURCE%\config\blacklist.yaml" (
    copy /Y "%SOURCE%\config\blacklist.yaml" "%ProgramFiles%\JubileeBrowser\"
)

exit /b %ERRORLEVEL%
```

### Step 3: Create GPO

1. Open **Group Policy Management Console**
2. Create new GPO: "Deploy Jubilee Browser"
3. Edit GPO:
   - Computer Configuration
   - Policies
   - Windows Settings
   - Scripts (Startup/Shutdown)
   - Startup
4. Add script: `\\domain.local\NETLOGON\Software\JubileeBrowser\install.bat`
5. Link GPO to target OUs
6. Configure security filtering as needed

### Step 4: Deploy

```batch
gpupdate /force /target:computer
```

---

## SCCM/Intune Deployment

### SCCM Application

**Detection Method**:
```powershell
# File exists detection
$path = "$env:ProgramFiles\JubileeBrowser\Jubilee.exe"
if (Test-Path $path) {
    Write-Host "Installed"
}
```

**Install Command**:
```
JubileeSetup.exe /S /ALLUSERS /LOG=%TEMP%\jubilee-install.log
```

**Uninstall Command**:
```
"%ProgramFiles%\JubileeBrowser\Uninstall Jubilee Browser.exe" /S
```

**User Experience**:
- Installation behavior: Install for system
- Logon requirement: Whether or not a user is logged on
- Installation visibility: Hidden

### Microsoft Intune

**Win32 App Package**:

1. Convert to .intunewin:
   ```
   IntuneWinAppUtil.exe -c <source_folder> -s JubileeSetup.exe -o <output_folder>
   ```

2. Upload to Intune

3. Configure:
   - **Install command**: `JubileeSetup.exe /S /ALLUSERS`
   - **Uninstall command**: `"%ProgramFiles%\JubileeBrowser\Uninstall Jubilee Browser.exe" /S`
   - **Detection rule**: File exists `%ProgramFiles%\JubileeBrowser\Jubilee.exe`

---

## Verification

### Post-Installation Checks

**Batch script**:
```batch
@echo off

echo Checking Jubilee Browser installation...

REM Check executable
if exist "%ProgramFiles%\JubileeBrowser\Jubilee.exe" (
    echo [OK] Executable found
) else if exist "%LocalAppData%\Programs\JubileeBrowser\Jubilee.exe" (
    echo [OK] Executable found (per-user)
) else (
    echo [FAIL] Executable not found
    exit /b 1
)

REM Check registry
reg query "HKLM\Software\JubileeBrowser" /v Version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Registry entries found (per-machine)
) else (
    reg query "HKCU\Software\JubileeBrowser" /v Version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Registry entries found (per-user)
    ) else (
        echo [WARN] Registry entries not found
    )
)

REM Check protocol handler
reg query "HKCR\inspire\shell\open\command" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Protocol handler registered
) else (
    echo [WARN] Protocol handler not registered
)

echo.
echo Installation verification complete
```

**PowerShell script**:
```powershell
function Test-JubileeInstallation {
    $results = @{
        Installed = $false
        Version = $null
        ProtocolHandler = $false
        InstallType = $null
    }

    # Check per-machine installation
    $machineExe = "$env:ProgramFiles\JubileeBrowser\Jubilee.exe"
    if (Test-Path $machineExe) {
        $results.Installed = $true
        $results.InstallType = "PerMachine"
        $results.Version = (Get-Item $machineExe).VersionInfo.FileVersion
    }

    # Check per-user installation
    $userExe = "$env:LocalAppData\Programs\JubileeBrowser\Jubilee.exe"
    if (Test-Path $userExe) {
        $results.Installed = $true
        $results.InstallType = "PerUser"
        $results.Version = (Get-Item $userExe).VersionInfo.FileVersion
    }

    # Check protocol handler
    $protocolKey = Get-ItemProperty -Path "Registry::HKEY_CLASSES_ROOT\inspire\shell\open\command" -ErrorAction SilentlyContinue
    if ($protocolKey) {
        $results.ProtocolHandler = $true
    }

    return [PSCustomObject]$results
}

$result = Test-JubileeInstallation
$result | Format-List
```

---

## Related Documentation

- [INSTALLATION.md](INSTALLATION.md) - Installation process details
- [DEPLOYMENT.md](DEPLOYMENT.md) - Enterprise deployment overview
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [BUILDING.md](BUILDING.md) - Building installers

---

## Resources

- **Enterprise Portal**: [https://jubileebrowser.com/enterprise](https://jubileebrowser.com/enterprise)
- **Deployment Guides**: [https://jubileebrowser.com/docs/deployment](https://jubileebrowser.com/docs/deployment)
- **Download Installers**: [https://jubileebrowser.com/download](https://jubileebrowser.com/download)
- **Support**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
