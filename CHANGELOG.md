# Changelog

All notable changes to Jubilee Browser will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [8.0.4] - 2026-01-01

### Fixed
- **Icon Display**: Replaced all icon assets with Jubilee logo (967KB, 1200x1200)
- **Clean Build**: Removed old icon.ico and forced complete rebuild
- **Asset Pipeline**: Ensured Electron Builder uses correct icon for all outputs

### Changed
- **Version Number**: Updated from 8.0.3 to 8.0.4 to reflect clean rebuild
- **Build Process**: Cleaned dist/ and release/ before rebuild to ensure fresh compilation

### Technical
- Removed old `assets/icon.ico` (97KB Electron logo)
- Copied `jubilee-logo.png` to `assets/icon.png`
- Verified TypeScript compilation of homepage settings
- Confirmed update manifest points to v8.0.4

## [8.0.3] - 2026-01-01

### Added
- **Automatic Updates**: Background update system checks for new versions every 4 hours
  - Update server configured: `http://jubileebrowser.com/downloads`
  - Silent installation on next browser restart
  - Update manifest (`latest.yml`) with SHA512 verification
  - Delta updates using blockmap files
- **Version Jump**: Updated from 1.0.2 to 8.0.3 to reflect project maturity

### Changed
- **Unified Homepage**: Both Internet and Jubilee Bible modes now default to `https://www.jubileeverse.com`
  - Previous: Internet Mode → Google, Jubilee Bible Mode → inspire://home.inspire
  - New: Both modes → www.jubileeverse.com
- **Application Icon**: Replaced Electron lightning bolt with Jubilee logo
  - Applies to: Desktop shortcut, taskbar, window, start menu, installer
  - Icon size: 967KB, 1200x1200 pixels
- **JubileeVerse Access**: Whitelisted `jubileeverse.com` and all subdomains in Jubilee Bible Mode
  - Navigation interceptor allows full access to JubileeVerse.com
  - Maintains security restrictions for other external sites

### Technical
- Updated `DEFAULT_SETTINGS` in `src/shared/types.ts`
- Modified `navigationInterceptor.ts` to allow JubileeVerse domain
- Configured `electron-updater` with generic provider
- Replaced `assets/icon.png` with Jubilee branding
- Added IIS MIME types for .yml and .blockmap files via web.config

## [1.0.2] - 2026-01-01

### Added
- **SSL Security Indicators**: Address bar now shows security status
  - HTTPS sites: Display `https://example.com`
  - HTTP sites: Display `Not Secure example.com`
  - Special protocols (inspire://, file://, about://) remain unchanged
- **Security Status Tracking**: Added `isSecure` field to TabState interface

### Changed
- **Address Bar Display**: Created `formatAddressBarDisplay()` method for consistent formatting
- **Navigation Events**: Updated did-navigate and did-navigate-in-page handlers to track SSL status

### Technical
- Modified `src/renderer/renderer.ts` to add security formatting
- Updated `src/shared/types.ts` to include `isSecure?: boolean` in TabState
- All address bar updates now use centralized formatter

## [1.0.1] - 2026-01-01

### Changed
- **Jubilee Bible Mode Homepage**: Changed from `inspire://home.inspire` to `https://www.jubileeverse.com`
- **Navigation Whitelist**: Added JubileeVerse.com to allowed domains in Jubilee Bible Mode

### Technical
- Updated `DEFAULT_SETTINGS.homepage.jubileebibles` in `src/shared/types.ts`
- Modified `navigationInterceptor.ts` to allow jubileeverse.com domain

## [1.0.0] - 2025-12-31

### Initial Release

#### Core Features
- **Dual-Mode Navigation**: Switch between Internet Mode and Jubilee Bible Mode
- **Tab Management**: Chrome-style tabbed interface with pin/mute/group support
- **Session Isolation**: Separate cookies, storage, and cache per mode
- **Blacklist System**: YAML-based content filtering
- **History & Bookmarks**: Full browsing history and bookmark management

#### Security
- **Context Isolation**: Renderer process isolated from Node.js
- **Secure IPC**: Type-safe communication channels
- **Session Partitioning**: `persist:internet` and `persist:jubileebibles` sessions
- **Content Security Policy**: Restricted resource loading
- **Navigation Interception**: Mode-appropriate URL filtering

#### Browser Modes
- **Internet Mode**:
  - Full access to public web (.com, .org, .net, etc.)
  - Blacklist filtering for inappropriate content
  - Standard DNS resolution
  - Default homepage: https://www.google.com

- **Jubilee Bible Mode**:
  - .inspire namespace support
  - Restricted to inspire:// protocol by default
  - Enhanced content filtering
  - Default homepage: inspire://home.inspire

#### User Interface
- **Address Bar**: URL entry with search fallback
- **Navigation Controls**: Back, forward, reload, stop
- **Tab Bar**: Draggable tabs with close buttons
- **Mode Toggle**: Visual indicator and keyboard shortcut (Ctrl+Shift+M)
- **Side Panel**: History and bookmarks access

#### Architecture
- **Main Process**: Electron main (Node.js environment)
  - Window management
  - Tab state coordination
  - Mode switching logic
  - IPC message handling
  - History and bookmark persistence
  - Blacklist enforcement

- **Renderer Process**: Browser UI (Chromium environment)
  - Tab rendering via webview tags
  - User interaction handling
  - Visual updates and animations
  - Context-isolated from Node.js

- **Preload Script**: Secure bridge between main and renderer
  - Exposes limited API via contextBridge
  - Type-safe IPC channels
  - No direct Node.js access

#### Inspire Namespace
- **Core Locations**:
  - `inspire://home.inspire` - Churchnet home
  - `inspire://about.inspire` - About page
  - `inspire://guide.inspire` - Navigation guide
  - `inspire://welcome.inspire` - Welcome experience
- **Shorthand Support**: `home.inspire` → `inspire://home.inspire`
- **Static Content**: Hardcoded HTML served directly

#### Keyboard Shortcuts
- Ctrl+T: New tab
- Ctrl+W: Close tab
- Ctrl+L: Focus address bar
- Ctrl+R / F5: Reload
- Alt+Left: Go back
- Alt+Right: Go forward
- Ctrl+Shift+M: Toggle mode
- Ctrl+H: History
- Ctrl+D: Bookmark

#### Build & Distribution
- **Platform**: Windows 10/11 (64-bit)
- **Installer**: NSIS with custom install script
- **Package Size**: ~75 MB
- **Icon**: Electron default lightning bolt
- **Dependencies**:
  - Electron 28.3.3
  - TypeScript 5.3.2
  - electron-builder 24.9.1
  - electron-updater 6.6.2

#### Configuration
- **User Data**: `%APPDATA%\jubilee\`
- **Settings**: JSON-based preferences
- **Blacklist**: YAML configuration with live reload
- **Session State**: Persisted across restarts

#### Known Limitations
- **Windows Only**: No macOS or Linux builds
- **No Code Signing**: Unsigned installer triggers SmartScreen
- **Update Server**: Placeholder URL (non-functional)
- **Auth Server**: Placeholder URL (non-functional)
- **Limited Inspire Locations**: Only 4 hardcoded pages
- **No Remote Inspire**: No distributed .inspire hosting
- **No Identity System**: Authentication framework incomplete

---

## Version Number Explanation

The jump from 1.0.2 to 8.0.3 reflects the significant maturity of the codebase and features that existed prior to formal version tracking. The 8.x series represents:

- 8+ major architectural components
- Comprehensive security implementation
- Production-ready auto-update system
- Professional branding and user experience
- Extensive feature set beyond initial prototype

## Update Policy

- **Major versions (x.0.0)**: Breaking changes, major new features
- **Minor versions (8.x.0)**: New features, significant enhancements
- **Patch versions (8.0.x)**: Bug fixes, minor improvements

## Semantic Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes

## Download

Current version: **8.0.4**

Download: [http://jubileebrowser.com/downloads/jubilee-Setup-8.0.4.exe](http://jubileebrowser.com/downloads/jubilee-Setup-8.0.4.exe)

Auto-update manifest: [http://jubileebrowser.com/downloads/latest.yml](http://jubileebrowser.com/downloads/latest.yml)
