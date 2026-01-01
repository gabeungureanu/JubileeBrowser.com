/**
 * Blacklist Manager
 * Manages website blocking based on a YAML configuration file
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { app } from 'electron';

interface BlacklistConfig {
  blocked_sites: string[];
  blocked_keywords: string[];
}

export class BlacklistManager {
  private blockedSites: Set<string> = new Set();
  private blockedKeywords: string[] = [];
  private configPath: string;
  private watchedFile: fs.FSWatcher | null = null;

  constructor() {
    // Look for blacklist.yaml in the app directory (next to executable or in dev folder)
    this.configPath = this.findConfigPath();
    this.loadBlacklist();
    this.watchConfigFile();
  }

  private findConfigPath(): string {
    // Try multiple locations
    const possiblePaths = [
      // Development: project root
      path.join(process.cwd(), 'blacklist.yaml'),
      // Production: next to the executable
      path.join(path.dirname(app.getPath('exe')), 'blacklist.yaml'),
      // Production: in resources folder
      path.join(process.resourcesPath || '', 'blacklist.yaml'),
      // User data directory
      path.join(app.getPath('userData'), 'blacklist.yaml'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        console.log(`Blacklist config found at: ${configPath}`);
        return configPath;
      }
    }

    // Default to user data directory if no config found
    const defaultPath = path.join(app.getPath('userData'), 'blacklist.yaml');
    console.log(`No blacklist config found, will use: ${defaultPath}`);
    return defaultPath;
  }

  private loadBlacklist(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.log('Blacklist file not found, creating default...');
        this.createDefaultConfig();
        return;
      }

      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(fileContent) as BlacklistConfig;

      this.blockedSites.clear();
      this.blockedKeywords = [];

      if (config.blocked_sites && Array.isArray(config.blocked_sites)) {
        config.blocked_sites.forEach((site) => {
          // Normalize the domain (lowercase, no trailing slash)
          const normalized = site.toLowerCase().trim().replace(/\/$/, '');
          this.blockedSites.add(normalized);
        });
      }

      if (config.blocked_keywords && Array.isArray(config.blocked_keywords)) {
        this.blockedKeywords = config.blocked_keywords.map((k) => k.toLowerCase().trim());
      }

      console.log(`Blacklist loaded: ${this.blockedSites.size} sites, ${this.blockedKeywords.length} keywords`);
      console.log('Blocked sites:', Array.from(this.blockedSites));
    } catch (error) {
      console.error('Error loading blacklist:', error);
    }
  }

  private createDefaultConfig(): void {
    const defaultConfig = `# Jubilee Browser Blacklist Configuration
# Sites listed here will be blocked from loading in the browser.
# Add domains (without protocol) to block them.

# Blocked websites - add domains here to block them
blocked_sites: []

# You can also block by keyword in URL (partial matches)
blocked_keywords: []
`;

    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, defaultConfig, 'utf8');
      console.log(`Created default blacklist config at: ${this.configPath}`);
    } catch (error) {
      console.error('Error creating default blacklist config:', error);
    }
  }

  private watchConfigFile(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        this.watchedFile = fs.watch(this.configPath, (eventType) => {
          if (eventType === 'change') {
            console.log('Blacklist config changed, reloading...');
            setTimeout(() => this.loadBlacklist(), 100); // Small delay to ensure file is fully written
          }
        });
      }
    } catch (error) {
      console.error('Error watching blacklist file:', error);
    }
  }

  /**
   * Check if a URL should be blocked
   */
  isBlocked(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      // Check exact domain match
      if (this.blockedSites.has(hostname)) {
        console.log(`Blocked (exact match): ${hostname}`);
        return true;
      }

      // Check if it's a subdomain of a blocked site
      for (const blockedSite of this.blockedSites) {
        if (hostname === blockedSite || hostname.endsWith('.' + blockedSite)) {
          console.log(`Blocked (subdomain match): ${hostname} matches ${blockedSite}`);
          return true;
        }
      }

      // Check keyword matches
      for (const keyword of this.blockedKeywords) {
        if (fullUrl.includes(keyword)) {
          console.log(`Blocked (keyword match): ${url} contains ${keyword}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      // If URL parsing fails, don't block
      console.error('Error checking blacklist for URL:', url, error);
      return false;
    }
  }

  /**
   * Get the blocked page HTML content
   */
  getBlockedPageContent(blockedUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Blocked - Jubilee</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e8e8e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 3rem;
      max-width: 500px;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1.5rem;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #ff5555;
    }
    p {
      color: #a0a0a0;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .blocked-url {
      background: rgba(255, 100, 100, 0.1);
      border: 1px solid rgba(255, 100, 100, 0.3);
      border-radius: 8px;
      padding: 1rem;
      color: #ff9999;
      font-family: monospace;
      font-size: 0.9rem;
      word-break: break-all;
      margin-bottom: 1.5rem;
    }
    .back-btn {
      display: inline-block;
      background: linear-gradient(135deg, #4a9eff, #6bb3ff);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      cursor: pointer;
      border: none;
      font-size: 1rem;
    }
    .back-btn:hover {
      background: linear-gradient(135deg, #6bb3ff, #8bc5ff);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🚫</div>
    <h1>Website Blocked</h1>
    <p>This website has been blocked by Jubilee's content filter.</p>
    <div class="blocked-url">${this.escapeHtml(blockedUrl)}</div>
    <p>If you believe this is a mistake, please contact your administrator.</p>
    <button class="back-btn" onclick="history.back()">Go Back</button>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Get list of blocked sites (for debugging/UI)
   */
  getBlockedSites(): string[] {
    return Array.from(this.blockedSites);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.watchedFile) {
      this.watchedFile.close();
      this.watchedFile = null;
    }
  }
}
