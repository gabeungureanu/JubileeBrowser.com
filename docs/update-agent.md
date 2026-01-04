# Jubilee Browser Update Agent

The Update Agent is a Windows Service that runs separately from the browser to perform background update checks, secure downloads, and staged installations.

## Overview

The Update Agent (`JubileeBrowser.UpdateAgent`) is a .NET 8 Windows Service that:
- Runs independently of the main browser application
- Checks for updates on a configurable schedule
- Downloads updates securely in the background
- Applies updates when the browser is not running
- Maintains rollback capability for failed updates

## How It Works

1. Checks the update manifest over HTTPS at a fixed interval (default: 4 hours)
2. Compares the installed version to the latest manifest version
3. Downloads the update package (MSI or ZIP) into a staging directory
4. Verifies SHA-256 hash (required) and optional signatures
5. Waits until the browser is not running
6. Applies the update using MSI or file replacement
7. Rolls back from backup if the apply step fails

## File Locations

| Purpose | Location |
|---------|----------|
| Staging | `%ProgramData%\JubileeBrowser\updates\staging` |
| Backups | `%ProgramData%\JubileeBrowser\updates\backup` |
| Pending marker | `%ProgramData%\JubileeBrowser\updates\pending.json` |
| Logs | `%ProgramData%\JubileeBrowser\updates\update-agent.log` |
| Configuration | `%ProgramData%\JubileeBrowser\update-agent.json` |

## Update Manifest Format

The update server exposes JSON manifests at:
- `/stable/releases.json` - Production releases
- `/beta/releases.json` - Beta/preview releases

### Manifest Structure

```json
[
  {
    "version": "8.0.6",
    "releaseNotes": "Bug fixes and improvements.",
    "downloadUrl": "https://updates.jubileebrowser.com/releases/stable/JubileeBrowser-Setup-8.0.6.msi",
    "sha256": "HEX_SHA256_HASH",
    "signature": "BASE64_RSA_SIGNATURE"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Semantic version string |
| `releaseNotes` | No | Human-readable release notes |
| `downloadUrl` | Yes | HTTPS URL to MSI or ZIP package |
| `sha256` | Yes | SHA-256 hash of the package |
| `signature` | No | RSA signature for additional verification |

## Configuration

Create `update-agent.json` in `%ProgramData%\JubileeBrowser`:

```json
{
  "updateEndpoint": "https://updates.jubileebrowser.com/releases",
  "channel": "stable",
  "checkIntervalHours": 4,
  "initialDelaySeconds": 30,
  "applyCheckIntervalMinutes": 5,
  "expectedCertificateThumbprint": "",
  "signaturePublicKeyPem": ""
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `updateEndpoint` | Production URL | Base URL for update manifests |
| `channel` | `stable` | Update channel (`stable` or `beta`) |
| `checkIntervalHours` | `4` | Hours between update checks |
| `initialDelaySeconds` | `30` | Delay before first check after service start |
| `applyCheckIntervalMinutes` | `5` | Minutes between checks if browser is running |
| `expectedCertificateThumbprint` | Empty | Optional TLS certificate pinning |
| `signaturePublicKeyPem` | Empty | Public key for signature verification |

## Service Installation

The Update Agent is installed automatically with the MSI installer. To manage manually:

### Install as Windows Service

```powershell
# Register the service
sc create "JubileeBrowser.UpdateAgent" binPath="C:\Program Files\Jubilee Browser\JubileeBrowser.UpdateAgent.exe" start=auto
sc description "JubileeBrowser.UpdateAgent" "Jubilee Browser automatic update service"
sc start "JubileeBrowser.UpdateAgent"
```

### View Service Status

```powershell
sc query "JubileeBrowser.UpdateAgent"
```

### Stop and Disable (for managed environments)

```powershell
sc stop "JubileeBrowser.UpdateAgent"
sc config "JubileeBrowser.UpdateAgent" start=disabled
```

### Uninstall Service

```powershell
sc stop "JubileeBrowser.UpdateAgent"
sc delete "JubileeBrowser.UpdateAgent"
```

## Logging

Logs are written to `%ProgramData%\JubileeBrowser\updates\update-agent.log`:

```
2024-01-15 10:00:00 [INFO] Update check started
2024-01-15 10:00:01 [INFO] Current version: 8.0.5
2024-01-15 10:00:02 [INFO] Latest version: 8.0.6
2024-01-15 10:00:02 [INFO] Update available, starting download
2024-01-15 10:05:00 [INFO] Download complete, hash verified
2024-01-15 10:05:01 [INFO] Waiting for browser to close
2024-01-15 10:30:00 [INFO] Browser closed, applying update
2024-01-15 10:30:30 [INFO] Update applied successfully
```

### Log Levels

- **INFO**: Normal operations
- **WARN**: Recoverable issues
- **ERROR**: Failed operations (with retry)
- **FATAL**: Service stopping errors

## Update Flow

```
┌─────────────────┐
│  Service Start  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Initial Delay  │◄──────────────────┐
└────────┬────────┘                   │
         │                            │
         ▼                            │
┌─────────────────┐                   │
│  Check Manifest │                   │
└────────┬────────┘                   │
         │                            │
    No Update?────────────────────────┤
         │                            │
         ▼                            │
┌─────────────────┐                   │
│ Download Update │                   │
└────────┬────────┘                   │
         │                            │
         ▼                            │
┌─────────────────┐                   │
│  Verify Hash    │                   │
└────────┬────────┘                   │
         │                            │
         ▼                            │
┌─────────────────┐                   │
│Browser Running? │──Yes──► Wait ─────┤
└────────┬────────┘                   │
         │ No                         │
         ▼                            │
┌─────────────────┐                   │
│  Apply Update   │                   │
└────────┬────────┘                   │
         │                            │
         ▼                            │
┌─────────────────┐                   │
│    Wait 4hrs    │───────────────────┘
└─────────────────┘
```

## Security

### Package Verification

1. **SHA-256 Hash** (Required): Every download is verified against the manifest hash
2. **TLS Certificate** (Optional): Pin to specific certificate thumbprint
3. **RSA Signature** (Optional): Verify package signature with configured public key

### Service Permissions

- Runs as Local System account
- Requires write access to Program Files (for updates)
- Requires write access to ProgramData (for staging/logs)

## Troubleshooting

### Service Won't Start

1. Check Windows Event Viewer > Application logs
2. Verify service executable exists
3. Check for port conflicts or permission issues

### Updates Not Applying

1. Check `update-agent.log` for errors
2. Verify browser is fully closed (check Task Manager)
3. Ensure sufficient disk space in staging directory
4. Verify network connectivity to update server

### Rollback Occurred

1. Check logs for apply failure reason
2. Previous version restored from backup
3. Report issue to support with log files

## Development

The Update Agent is part of the `JubileeBrowser.UpdateAgent` project in the solution:

```
JubileeBrowser.WPF/
├── JubileeBrowser/              # Main browser
├── JubileeBrowser.Installer/    # WiX MSI installer
└── JubileeBrowser.UpdateAgent/  # Update service
```

### Building

```powershell
dotnet build JubileeBrowser.WPF/JubileeBrowser.UpdateAgent/JubileeBrowser.UpdateAgent.csproj -c Release
```

### Testing Locally

```powershell
# Run directly (not as service) for testing
.\JubileeBrowser.UpdateAgent.exe --console
```
