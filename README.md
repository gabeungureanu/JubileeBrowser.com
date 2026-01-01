# Jubilee Browser

**Version 8.0.4** - A dual-mode Electron browser for navigating both the public Internet and JubileeVerse, a Scripture-centered digital environment.

## Overview

Jubilee Browser is a safe, Scripture-centered browser designed for families, churches, and schools. It provides two distinct browsing modes with seamless switching and automatic updates that keep users protected without requiring technical expertise.

## Key Features

### 🌐 **Dual-Mode Navigation**
- **Internet Mode**: Full access to the public web with built-in content filtering
- **Jubilee Bible Mode**: Access to JubileeVerse.com and approved Scripture-centered content
- **Seamless Switching**: Toggle between modes with Ctrl+Shift+M
- **Unified Homepage**: Both modes start at www.jubileeverse.com

### 🔒 **Security & Protection**
- **SSL Certificate Detection**: Address bar displays "Not Secure" for HTTP sites, "https://" for secure connections
- **Built-in Content Filtering**: Blacklist system blocks inappropriate content by design
- **Session Isolation**: Complete separation of cookies, storage, and cache between modes
- **Context Isolation**: Renderer has no direct Node.js access
- **Secure IPC**: All communication between processes uses typed channels

### 🔄 **Automatic Updates**
- **Background Updates**: Browser automatically checks for updates every 4 hours
- **Silent Installation**: Updates install seamlessly without user intervention
- **No Manual Downloads**: Users never need to reinstall or manually update
- **Update Server**: http://jubileebrowser.com/downloads

### 🎨 **Professional Branding**
- **Jubilee Icon**: Custom branding throughout (taskbar, desktop, window, installer)
- **Chrome-Style Interface**: Familiar tabbed browsing experience
- **Dark Theme**: Professional appearance with Scripture-centered design

## Architecture

```
JubileeBrowser/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts                    # Application entry point
│   │   ├── windowManager.ts           # Window lifecycle management
│   │   ├── tabManager.ts              # Tab state and management
│   │   ├── modeManager.ts             # Internet/Jubilee Bible mode switching
│   │   ├── inspireResolver.ts         # .inspire namespace resolution
│   │   ├── navigationInterceptor.ts   # URL filtering and security
│   │   ├── historyManager.ts          # Browsing history
│   │   ├── bookmarkManager.ts         # Bookmark management
│   │   ├── blacklistManager.ts        # Content filtering
│   │   ├── authenticationManager.ts   # Identity and authentication
│   │   ├── updateManager.ts           # Automatic update system
│   │   ├── settingsManager.ts         # User preferences
│   │   └── ipcHandler.ts              # IPC message routing
│   ├── preload/        # Secure bridge to renderer
│   │   └── preload.ts                 # Context bridge API
│   ├── renderer/       # Browser UI
│   │   ├── index.html                 # Main browser interface
│   │   ├── styles.css                 # Application styling
│   │   └── renderer.ts                # UI logic and state management
│   └── shared/         # Shared types and constants
│       └── types.ts                   # TypeScript definitions
├── assets/             # Application assets (icons, images)
├── dist/               # Compiled JavaScript output
├── release/            # Packaged installers
└── website/            # Public website and download hosting
```

## Browsing Modes

### Internet Mode
- Standard web browsing with full access to public domains
- Built-in blacklist filters inappropriate content
- SSL security indicators in address bar
- Default homepage: https://www.jubileeverse.com

### Jubilee Bible Mode
- Access to JubileeVerse.com and approved Scripture-centered content
- .inspire namespace support for Churchnet locations
- Enhanced content restrictions for family safety
- Same homepage: https://www.jubileeverse.com

## Security Features

### Address Bar Security Indicators
- **HTTPS sites**: Display `https://example.com` (secure)
- **HTTP sites**: Display `Not Secure example.com` (warning)
- **Special protocols**: inspire://, file://, about:// (unchanged)

### Content Filtering
- **Blacklist System**: YAML-based configuration blocks harmful sites
- **Mode-Specific Rules**: Different filtering for each mode
- **JubileeVerse Access**: Whitelisted in Jubilee Bible Mode
- **Live Updates**: Blacklist can be updated without reinstalling

### Session Security
- **Separate Sessions**: Internet and Jubilee Bible modes use isolated sessions
- **Cookie Isolation**: No data sharing between modes
- **Secure Storage**: OS-level encryption for tokens and credentials
- **Permission Control**: Fine-grained permission system per mode

## Installation

### System Requirements
- **OS**: Windows 10 (64-bit) or Windows 11
- **Processor**: 1 GHz or faster x64 processor
- **Memory**: 4 GB RAM minimum, 8 GB recommended
- **Storage**: 200 MB available space

### Download
Visit [http://jubileebrowser.com](http://jubileebrowser.com) to download the latest version.

### Installation Steps
1. Download `jubilee-Setup-8.0.4.exe` (~75 MB)
2. Run the installer
3. Follow the installation wizard
4. Launch Jubilee Browser from desktop or start menu

### First-Time Setup
On first launch, the browser will:
- Create user profile in `%APPDATA%\jubilee`
- Initialize default settings
- Register for automatic updates
- Load homepage: www.jubileeverse.com

## Development

### Prerequisites
- **Node.js** 18+
- **npm** or yarn
- **Windows** (for building Windows installers)

### Setup
```bash
# Clone repository
git clone https://github.com/yourorg/jubileebrowser.git
cd jubileebrowser

# Install dependencies
npm install
```

### Development Workflow
```bash
# Build TypeScript and run
npm start

# Watch mode for development (auto-rebuild on changes)
npm run dev

# Build TypeScript only
npm run build

# Copy assets to dist folder
npm run copy-assets
```

### Building for Distribution
```bash
# Package for Windows (creates NSIS installer)
npm run package

# Build without packaging
npm run build

# Package to directory (no installer)
npm run package:dir
```

### Build Outputs
- **Installer**: `release/jubilee-Setup-8.0.4.exe`
- **Portable**: `release/win-unpacked/`
- **Update Manifest**: `release/stable.yml` → `latest.yml`
- **Blockmap**: `release/jubilee-Setup-8.0.4.exe.blockmap`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+T** | New tab |
| **Ctrl+W** | Close current tab |
| **Ctrl+Tab** | Switch to next tab |
| **Ctrl+Shift+Tab** | Switch to previous tab |
| **Ctrl+L** | Focus address bar |
| **Ctrl+R** / **F5** | Reload current page |
| **Ctrl+Shift+R** | Hard reload (ignore cache) |
| **Alt+Left** | Go back |
| **Alt+Right** | Go forward |
| **Ctrl+Shift+M** | Toggle between Internet and Jubilee Bible modes |
| **Ctrl+H** | Open history |
| **Ctrl+D** | Bookmark current page |

## Automatic Updates

### How It Works
1. **Check for Updates**: Every 4 hours, browser checks `http://jubileebrowser.com/downloads/latest.yml`
2. **Download in Background**: If update available, download starts automatically
3. **Install on Quit**: Update installs when user closes the browser
4. **Next Launch**: Browser runs the new version

### Update Configuration
```javascript
// package.json
"publish": {
  "provider": "generic",
  "url": "http://jubileebrowser.com/downloads",
  "channel": "stable"
}
```

### Update Files
- **Manifest**: `latest.yml` (version info, SHA512 hash)
- **Installer**: `jubilee-Setup-[version].exe`
- **Blockmap**: `jubilee-Setup-[version].exe.blockmap` (delta updates)

### For Users
- **No action required**: Updates happen automatically
- **No reinstalls**: Browser updates itself seamlessly
- **No downtime**: Updates install on restart
- **Always current**: Users stay on the latest version

## .inspire Namespace

The .inspire namespace provides human-readable addresses for Churchnet locations:

### Core Locations
- `inspire://home.inspire` - Churchnet home
- `inspire://about.inspire` - About Churchnet
- `inspire://guide.inspire` - Navigation guide
- `inspire://welcome.inspire` - Welcome experience

### Shorthand Support
In Jubilee Bible Mode, you can use shorthand addresses:
- `home.inspire` → `inspire://home.inspire`
- `home` → `inspire://home.inspire`

### Future Expansion
- Distributed .inspire hosting
- Community-created inspire locations
- Scripture and immersive experiences
- Identity-based access control

## Configuration Files

### User Data Location
`%APPDATA%\jubilee\` (Windows)

### Settings
- **Preferences**: `settings.json`
- **History**: `history.json`
- **Bookmarks**: `bookmarks.json`
- **Session State**: Restored on launch

### Blacklist Configuration
`blacklist.yaml` - Contains domains and keywords to block

```yaml
domains:
  - badsite.com
  - example.harmful.com

keywords:
  - inappropriate
  - blocked-term
```

## Deployment

### For Churches and Schools

**Silent Installation**:
```bash
jubilee-Setup-8.0.4.exe /S
```

**Network Deployment**:
- Deploy via Group Policy
- Use SCCM or similar tools
- Automatic updates ensure consistency
- No ongoing maintenance required

**Configuration**:
- Custom blacklist files
- Pre-configured settings
- Centralized update management

### For Families
- Download and install from website
- Automatic updates keep everyone current
- No technical expertise required
- Built-in protection by design

## Troubleshooting

### Updates Not Working
1. Check internet connection
2. Verify update server is accessible: http://jubileebrowser.com/downloads/latest.yml
3. Check Windows firewall settings
4. Review update logs in `%APPDATA%\jubilee\logs\`

### Homepage Not Changing
- Delete user data: `%APPDATA%\jubilee\`
- Reinstall browser
- Settings from old installation may persist

### Icon Not Updating
- Restart Windows to clear icon cache
- Check desktop shortcut properties
- Reinstall if issue persists

## Version History

- **8.0.4** - Clean rebuild with Jubilee branding and unified homepage
- **8.0.3** - Unified homepage, auto-updates, Jubilee icon
- **1.0.2** - SSL security indicators in address bar
- **1.0.1** - JubileeVerse.com integration
- **1.0.0** - Initial release

## Contributing

This project is maintained by Jubilee Software, Inc. For bug reports and feature requests, please contact support@jubileebrowser.com.

## License

MIT License

Copyright (c) 2024 Jubilee Software, Inc.

## Support

- **Website**: http://jubileebrowser.com
- **Email**: support@jubileebrowser.com
- **Documentation**: http://jubileebrowser.com/docs
- **Downloads**: http://jubileebrowser.com/download.html

---

**Technology that honors Scripture, protects families, and serves the Church.**
