# Building Jubilee Browser

This guide covers building Jubilee Browser from source, including creating installers for distribution.

**Official Website**: [https://jubileebrowser.com](https://jubileebrowser.com)
**Developer Resources**: [https://jubileebrowser.com/developers](https://jubileebrowser.com/developers)

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Build Commands](#build-commands)
4. [Installer Types](#installer-types)
5. [Build Configuration](#build-configuration)
6. [Code Signing](#code-signing)
7. [CI/CD Integration](#cicd-integration)
8. [Release Process](#release-process)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x or 20.x | Runtime |
| npm | 9.x+ | Package manager |
| Git | 2.x+ | Version control |
| Visual Studio Build Tools | 2019+ | Native compilation |
| Python | 3.x | Node native modules |

### Windows-Specific Requirements

1. **Visual Studio Build Tools**:
   ```batch
   winget install Microsoft.VisualStudio.2022.BuildTools
   ```

   Required components:
   - MSVC v143 (or later) build tools
   - Windows 10/11 SDK

2. **Python** (for node-gyp):
   ```batch
   winget install Python.Python.3.11
   ```

### Verify Installation

```batch
node --version    # Should show v18.x or v20.x
npm --version     # Should show 9.x+
git --version     # Should show 2.x+
python --version  # Should show 3.x
```

---

## Development Setup

### Clone Repository

```batch
git clone https://github.com/jubileebrowser/jubilee.git
cd jubilee
```

**Note**: Source code is also available at [https://jubileebrowser.com/developers/source](https://jubileebrowser.com/developers/source)

### Install Dependencies

```batch
npm install
```

### Development Mode

```batch
# Build TypeScript and start app
npm start

# Or use watch mode for development
npm run dev
```

### Project Structure

```
jubilee/
├── src/
│   ├── main/           # Main process (TypeScript)
│   ├── preload/        # Preload scripts (TypeScript)
│   ├── renderer/       # Renderer (HTML, TS, CSS)
│   └── shared/         # Shared types
├── dist/               # Compiled output
├── release/            # Built installers
├── build/              # Build resources
├── assets/             # Application assets
└── package.json        # Configuration
```

---

## Build Commands

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Build and run in development |
| `npm run build` | Compile TypeScript |
| `npm run package` | Build Windows installer |
| `npm run package:dir` | Build unpacked (for testing) |
| `npm run package:web` | Build web/bootstrap installer |
| `npm run package:offline` | Build offline installer |
| `npm run package:publish` | Build and publish to update server |
| `npm run package:staging` | Build for staging channel |

### Basic Build

```batch
# Compile TypeScript only
npm run build

# Build installer
npm run package
```

### Output Location

Built installers are placed in the `release/` directory:

```
release/
├── Jubilee-Setup-1.0.0.exe           # Offline installer
├── Jubilee-Setup-1.0.0.exe.blockmap  # Differential update map
├── Jubilee-WebSetup-1.0.0.exe        # Web installer
├── latest.yml                         # Update manifest
└── win-unpacked/                      # Unpacked app (with --dir)
```

---

## Installer Types

### Offline Installer (Full Package)

**Command**:
```batch
npm run package:offline
```

**Output**: `Jubilee-Setup-{version}.exe` (~80-100 MB)

**Contains**:
- Complete application files
- All dependencies
- Works without internet

**Use Case**: Air-gapped environments, mass deployment

### Web Installer (Bootstrap)

**Command**:
```batch
npm run package:web
```

**Output**: `Jubilee-WebSetup-{version}.exe` (~2-3 MB)

**Contains**:
- Small bootstrap executable
- Downloads full package during install

**Use Case**: Individual downloads, always-latest install

### Unpacked Build (Testing)

**Command**:
```batch
npm run package:dir
```

**Output**: `release/win-unpacked/` directory

**Use Case**: Quick testing without creating installer

---

## Build Configuration

### package.json Build Section

```json
{
  "build": {
    "appId": "com.jubileebrowser.jubilee",
    "productName": "Jubilee Browser",
    "executableName": "Jubilee",
    "copyright": "Copyright © 2024 Jubilee Software, Inc.",

    "directories": {
      "output": "release",
      "buildResources": "build"
    },

    "win": {
      "target": [
        {"target": "nsis", "arch": ["x64"]},
        {"target": "nsis-web", "arch": ["x64"]}
      ],
      "icon": "assets/icon.ico"
    },

    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowElevation": true,
      "differentialPackage": true,
      "include": "build/installer.nsh"
    },

    "nsisWeb": {
      "appPackageUrl": "https://downloads.jubileebrowser.com/releases/${channel}/${arch}"
    },

    "publish": {
      "provider": "generic",
      "url": "https://updates.jubileebrowser.com/releases/stable"
    }
  }
}
```

### NSIS Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `oneClick` | boolean | One-click install (no options) |
| `perMachine` | boolean | Default to all-users install |
| `allowElevation` | boolean | Allow UAC elevation |
| `allowToChangeInstallationDirectory` | boolean | Let user choose directory |
| `createDesktopShortcut` | boolean | Create desktop shortcut |
| `createStartMenuShortcut` | boolean | Create Start Menu entry |
| `differentialPackage` | boolean | Enable differential updates |
| `deleteAppDataOnUninstall` | boolean | Remove user data on uninstall |
| `include` | string | Path to custom NSIS script |

### Custom NSIS Script

The `build/installer.nsh` file contains custom installation logic:

```nsis
!macro customInit
  ; Pre-installation setup
  ; Logging, version checks, etc.
!macroend

!macro customInstall
  ; Post-installation actions
  ; Registry entries, protocol handlers
!macroend

!macro customUnInstall
  ; Cleanup on uninstall
  ; Remove registry entries
!macroend
```

---

## Code Signing

### Why Code Sign?

1. **Avoid SmartScreen warnings** - Unsigned apps trigger Windows warnings
2. **Verify integrity** - Users can verify the publisher
3. **Enable auto-updates** - electron-updater verifies signatures

### Certificate Types

| Type | Cost | SmartScreen | Recommendation |
|------|------|-------------|----------------|
| Self-signed | Free | No help | Development only |
| Standard Code Signing | ~$200/year | Builds reputation | Small teams |
| EV Code Signing | ~$400/year | Immediate trust | Production releases |

### Configuration

**Environment variables**:
```batch
set CSC_LINK=path/to/certificate.pfx
set CSC_KEY_PASSWORD=your-password
```

**Or in package.json**:
```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "your-password",
      "signAndEditExecutable": true,
      "verifyUpdateCodeSignature": true
    }
  }
}
```

### Signing Process

1. **Acquire certificate** from trusted CA (DigiCert, Sectigo, etc.)

2. **Configure signing**:
   ```batch
   set CSC_LINK=C:\certs\jubilee-code-signing.pfx
   set CSC_KEY_PASSWORD=secretpassword
   ```

3. **Build with signing**:
   ```batch
   npm run package
   ```

4. **Verify signature**:
   ```batch
   signtool verify /pa release\Jubilee-Setup-1.0.0.exe
   ```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build installer
        env:
          CSC_LINK: ${{ secrets.CERTIFICATE_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.CERTIFICATE_PASSWORD }}
        run: npm run package:publish

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: release/*.exe

  publish:
    needs: build-windows
    runs-on: ubuntu-latest

    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4

      - name: Upload to update server
        run: |
          # Upload to your update server
          aws s3 sync ./windows-installer s3://updates.jubileebrowser.com/releases/stable/
```

### Secrets Configuration

Required secrets for CI:

| Secret | Description |
|--------|-------------|
| `CERTIFICATE_BASE64` | Base64-encoded .pfx file |
| `CERTIFICATE_PASSWORD` | Certificate password |
| `AWS_ACCESS_KEY_ID` | For S3 upload (if using) |
| `AWS_SECRET_ACCESS_KEY` | For S3 upload (if using) |

---

## Release Process

### Version Bump

1. **Update version in package.json**:
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. **Commit and tag**:
   ```batch
   git add package.json
   git commit -m "Bump version to 1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

### Build Release

```batch
# Build all installers
npm run package

# Or build and publish directly
npm run package:publish
```

### Upload to Update Server

1. **Files to upload**:
   - `Jubilee-Setup-{version}.exe`
   - `Jubilee-Setup-{version}.exe.blockmap`
   - `latest.yml`

2. **Server structure**:
   ```
   /releases/stable/
   ├── latest.yml
   ├── Jubilee-Setup-1.0.1.exe
   └── Jubilee-Setup-1.0.1.exe.blockmap
   ```

3. **Verify update manifest**:
   ```yaml
   # latest.yml
   version: 1.0.1
   releaseDate: '2024-01-15T10:30:00.000Z'
   path: Jubilee-Setup-1.0.1.exe
   sha512: <base64-hash>
   size: 85234567
   ```

### Testing Updates

1. **Install previous version**
2. **Wait for update check** (or trigger manually in About)
3. **Verify download and installation**
4. **Check session restoration**

### Release Checklist

- [ ] Version bumped in package.json
- [ ] CHANGELOG updated
- [ ] All tests passing
- [ ] Build succeeds locally
- [ ] Installer tested on clean machine
- [ ] Update from previous version tested
- [ ] Code signing verified
- [ ] Files uploaded to update server
- [ ] `latest.yml` verified
- [ ] Git tag created
- [ ] Release notes published

---

## Troubleshooting Builds

### "Cannot find module" errors

```batch
# Clean and reinstall
rmdir /S /Q node_modules
npm cache clean --force
npm install
```

### Native module compilation errors

```batch
# Rebuild native modules
npm rebuild

# Or reinstall with proper tools
npm install --build-from-source
```

### Installer build fails

1. **Check electron-builder version**:
   ```batch
   npm list electron-builder
   ```

2. **Clear builder cache**:
   ```batch
   rmdir /S /Q "%LOCALAPPDATA%\electron-builder\Cache"
   ```

3. **Check for file locks**:
   - Close all instances of Jubilee Browser
   - Close file explorers in release directory

---

## Related Documentation

- [INSTALLATION.md](INSTALLATION.md) - Installation process
- [AUTO_UPDATE.md](AUTO_UPDATE.md) - Update system
- [CODE_SIGNING.md](CODE_SIGNING.md) - Detailed signing guide
- [UPDATE_SERVER.md](UPDATE_SERVER.md) - Server setup

---

## Resources

- **Developer Portal**: [https://jubileebrowser.com/developers](https://jubileebrowser.com/developers)
- **API Documentation**: [https://jubileebrowser.com/docs/api](https://jubileebrowser.com/docs/api)
- **Release Notes**: [https://jubileebrowser.com/releases](https://jubileebrowser.com/releases)
- **Support**: [https://jubileebrowser.com/support](https://jubileebrowser.com/support)
