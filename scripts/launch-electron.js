/**
 * Launch script that removes ELECTRON_RUN_AS_NODE before starting Electron
 * This is needed because VS Code sets this env var which prevents Electron from running properly
 */

const { spawn } = require('child_process');
const path = require('path');

// Get the electron executable path
const electronPath = require('electron');

// Remove the problematic env var
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Get the app directory (one level up from scripts)
const appDir = path.dirname(__dirname);

console.log('Starting JubileeBrowser...');
console.log('Electron path:', electronPath);
console.log('App directory:', appDir);

// Build Electron arguments - include app user model id for Windows taskbar identity
const electronArgs = [appDir];

// On Windows, set the App User Model ID for proper taskbar grouping and identity
if (process.platform === 'win32') {
  electronArgs.unshift('--app-user-model-id=com.jubileebrowser.jubilee');
}

// Spawn electron with separate stdio to avoid EPIPE errors
const child = spawn(electronPath, electronArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: env,
  windowsHide: false,
  detached: false
});

// Handle stdout/stderr safely
if (child.stdout) {
  child.stdout.on('data', (data) => {
    try {
      process.stdout.write(data);
    } catch (e) {
      // Ignore write errors (broken pipe)
    }
  });
}

if (child.stderr) {
  child.stderr.on('data', (data) => {
    try {
      process.stderr.write('[stderr] ' + data);
    } catch (e) {
      // Ignore write errors (broken pipe)
    }
  });
}

child.on('error', (err) => {
  console.error('Failed to start Electron:', err);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});

// Handle parent process termination gracefully
process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
