# JubileeBrowser

A dual-mode Electron browser for navigating both the public Internet and Churchnet - a parallel network of intentional digital spaces.

## Features

- **Dual-Mode Navigation**: Seamlessly switch between Internet Mode and Churchnet Mode
- **Chrome-Style Interface**: Familiar tabbed browsing experience with navigation controls
- **Session Isolation**: Complete separation of cookies, storage, and cache between modes
- **Inspire Namespace**: Custom .inspire address resolution for Churchnet locations
- **Secure Architecture**: Context-isolated preload scripts, sandboxed rendering

## Architecture

```
JubileeBrowser/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts            # Application entry point
│   │   ├── windowManager.ts   # Window creation and management
│   │   ├── tabManager.ts      # Tab state management
│   │   ├── modeManager.ts     # Internet/Churchnet mode switching
│   │   ├── inspireResolver.ts # .inspire namespace resolution
│   │   ├── navigationInterceptor.ts # Request interception
│   │   ├── historyManager.ts  # Browsing history
│   │   ├── bookmarkManager.ts # Bookmarks
│   │   ├── settingsManager.ts # Application settings
│   │   └── ipcHandler.ts      # IPC communication
│   ├── preload/        # Secure bridge to renderer
│   │   └── preload.ts         # Context bridge API
│   ├── renderer/       # Browser UI
│   │   ├── index.html         # Main HTML
│   │   ├── styles.css         # Styling
│   │   └── renderer.ts        # UI logic
│   └── shared/         # Shared types and constants
│       └── types.ts           # TypeScript definitions
├── assets/             # Application assets
├── dist/               # Compiled output
└── release/            # Packaged application
```

## Modes

### Internet Mode
Standard web browsing with full access to public domains (.com, .org, .net, etc.). Uses standard DNS resolution and HTTPS protocols.

### Churchnet Mode
Access to .inspire namespace locations. These are consecrated digital spaces that:
- Exist only within JubileeBrowser
- May require identity for participation
- Are governed by stewardship principles
- Do not resolve standard Internet domains

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
npm install
```

### Development
```bash
# Build TypeScript and run
npm start

# Watch mode for development
npm run dev
```

### Build for Distribution
```bash
# Package for Windows
npm run package
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+L | Focus address bar |
| Ctrl+R / F5 | Reload |
| Alt+Left | Go back |
| Alt+Right | Go forward |
| Ctrl+Shift+M | Toggle mode |

## .inspire Namespace

The .inspire namespace is the human-readable address space for Churchnet locations:

- `inspire://home.inspire` - Churchnet home
- `inspire://about.inspire` - About Churchnet
- `inspire://guide.inspire` - Navigation guide
- `inspire://welcome.inspire` - Welcome experience

Shorthand addresses also work: `home.inspire` or just `home` in Churchnet Mode.

## Security

- **Context Isolation**: Renderer has no direct Node.js access
- **Preload Scripts**: Secure IPC bridge with typed channels
- **Session Partitioning**: Separate sessions for each mode
- **Content Security Policy**: Restricted resource loading
- **Navigation Interception**: Mode-appropriate URL filtering

## Future Development

This is foundational infrastructure designed for extensibility:
- Visual navigation layers (Night Sky interface)
- Identity and stewardship systems
- Distributed .inspire hosting
- Scripture and immersive experiences
- Inspire Family persona environments

## License

MIT
