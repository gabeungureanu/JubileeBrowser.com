/**
 * Blacklist Manager
 * Manages website blocking based on compiled blocklists from reputable sources
 *
 * Features:
 * - Loads compiled blocklist from YAML
 * - Supports allowlist for false positive overrides
 * - Logs all block events for debugging
 * - Hot-reloads on file changes
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { app } from 'electron';

interface BlocklistMetadata {
  generated_at: string;
  total_domains: number;
  sources: Array<{
    id: string;
    name: string;
    fetched_at: string;
    domain_count: number;
    status: string;
    error?: string;
  }>;
}

interface BlacklistConfig {
  metadata?: BlocklistMetadata;
  blocked_sites: string[];
  blocked_keywords: string[];
  blocked_urls?: string[];
}

interface AllowlistEntry {
  domain: string;
  reason: string;
  added_by?: string;
  added_at?: string;
}

interface AllowlistConfig {
  allowed_sites: AllowlistEntry[];
}

interface BlockEvent {
  timestamp: string;
  url: string;
  domain: string;
  matchType: 'exact' | 'subdomain' | 'keyword' | 'url';
  matchedPattern: string;
  sourceCategories?: string[];
  browserMode: string;
}

export class BlacklistManager {
  private blockedSites: Set<string> = new Set();
  private blockedKeywords: string[] = [];
  private blockedUrls: Set<string> = new Set();
  private allowedSites: Set<string> = new Set();
  private configPath: string;
  private allowlistPath: string;
  private watchedFiles: fs.FSWatcher[] = [];
  private metadata: BlocklistMetadata | null = null;
  private blockLog: BlockEvent[] = [];
  private maxLogEntries: number = 1000;

  constructor() {
    this.configPath = this.findConfigPath();
    this.allowlistPath = this.findAllowlistPath();
    this.loadBlacklist();
    this.loadAllowlist();
    this.watchConfigFiles();
  }

  private findConfigPath(): string {
    const possiblePaths = [
      // Development: project root
      path.join(process.cwd(), 'blacklist.yaml'),
      // Compiled blocklist location
      path.join(process.cwd(), 'blocklists', 'compiled', 'blacklist.yaml'),
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

    const defaultPath = path.join(app.getPath('userData'), 'blacklist.yaml');
    console.log(`No blacklist config found, will use: ${defaultPath}`);
    return defaultPath;
  }

  private findAllowlistPath(): string {
    const possiblePaths = [
      path.join(process.cwd(), 'blocklists', 'compiled', 'allowlist.yaml'),
      path.join(process.cwd(), 'allowlist.yaml'),
      path.join(app.getPath('userData'), 'allowlist.yaml'),
    ];

    for (const allowlistPath of possiblePaths) {
      if (fs.existsSync(allowlistPath)) {
        console.log(`Allowlist found at: ${allowlistPath}`);
        return allowlistPath;
      }
    }

    return path.join(app.getPath('userData'), 'allowlist.yaml');
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
      this.blockedUrls.clear();
      this.metadata = config.metadata || null;

      if (config.blocked_sites && Array.isArray(config.blocked_sites)) {
        config.blocked_sites.forEach((site) => {
          const normalized = this.normalizeDomain(site);
          if (normalized) {
            this.blockedSites.add(normalized);
          }
        });
      }

      if (config.blocked_keywords && Array.isArray(config.blocked_keywords)) {
        this.blockedKeywords = config.blocked_keywords
          .map((k) => k.toLowerCase().trim())
          .filter((k) => k.length > 0);
      }

      if (config.blocked_urls && Array.isArray(config.blocked_urls)) {
        config.blocked_urls.forEach((url) => {
          this.blockedUrls.add(url.toLowerCase().trim());
        });
      }

      console.log(`Blacklist loaded: ${this.blockedSites.size} sites, ${this.blockedKeywords.length} keywords, ${this.blockedUrls.size} URLs`);

      if (this.metadata) {
        console.log(`Blacklist generated: ${this.metadata.generated_at}`);
        console.log(`Sources: ${this.metadata.sources?.length || 0}`);
      }
    } catch (error) {
      console.error('Error loading blacklist:', error);
    }
  }

  private loadAllowlist(): void {
    try {
      if (!fs.existsSync(this.allowlistPath)) {
        console.log('No allowlist found, skipping...');
        return;
      }

      const fileContent = fs.readFileSync(this.allowlistPath, 'utf8');
      const config = yaml.load(fileContent) as AllowlistConfig;

      this.allowedSites.clear();

      if (config.allowed_sites && Array.isArray(config.allowed_sites)) {
        config.allowed_sites.forEach((entry) => {
          const normalized = this.normalizeDomain(entry.domain);
          if (normalized) {
            this.allowedSites.add(normalized);
            console.log(`Allowlisted: ${normalized} (${entry.reason})`);
          }
        });
      }

      console.log(`Allowlist loaded: ${this.allowedSites.size} sites`);
    } catch (error) {
      console.error('Error loading allowlist:', error);
    }
  }

  private normalizeDomain(domain: string): string | null {
    if (!domain) return null;

    let normalized = domain.toLowerCase().trim();

    // Remove protocol if present
    normalized = normalized.replace(/^https?:\/\//, '');

    // Remove path, query, port
    normalized = normalized.split('/')[0].split('?')[0].split(':')[0];

    // Remove trailing dot
    normalized = normalized.replace(/\.$/, '');

    return normalized || null;
  }

  private createDefaultConfig(): void {
    const defaultConfig = `# Jubilee Browser Blacklist Configuration
# This file is auto-generated. Run 'npm run update-blocklist' to update from sources.
#
# Sites listed here will be blocked from loading in the browser.

blocked_sites: []
blocked_keywords: []
blocked_urls: []
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

  private watchConfigFiles(): void {
    const filesToWatch = [this.configPath, this.allowlistPath];

    for (const filePath of filesToWatch) {
      try {
        if (fs.existsSync(filePath)) {
          const watcher = fs.watch(filePath, (eventType) => {
            if (eventType === 'change') {
              console.log(`Config file changed: ${filePath}`);
              setTimeout(() => {
                if (filePath === this.configPath) {
                  this.loadBlacklist();
                } else {
                  this.loadAllowlist();
                }
              }, 100);
            }
          });
          this.watchedFiles.push(watcher);
        }
      } catch (error) {
        console.error(`Error watching file ${filePath}:`, error);
      }
    }
  }

  /**
   * Check if a URL should be blocked
   */
  isBlocked(url: string, browserMode: string = 'internet'): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      // First check allowlist - if allowed, don't block
      if (this.isAllowed(hostname)) {
        return false;
      }

      // Check exact domain match
      if (this.blockedSites.has(hostname)) {
        this.logBlockEvent(url, hostname, 'exact', hostname, browserMode);
        return true;
      }

      // Check if it's a subdomain of a blocked site
      for (const blockedSite of this.blockedSites) {
        if (hostname.endsWith('.' + blockedSite)) {
          this.logBlockEvent(url, hostname, 'subdomain', blockedSite, browserMode);
          return true;
        }
      }

      // Check URL-level blocks
      for (const blockedUrl of this.blockedUrls) {
        if (fullUrl.includes(blockedUrl)) {
          this.logBlockEvent(url, hostname, 'url', blockedUrl, browserMode);
          return true;
        }
      }

      // Check keyword matches
      for (const keyword of this.blockedKeywords) {
        if (fullUrl.includes(keyword)) {
          this.logBlockEvent(url, hostname, 'keyword', keyword, browserMode);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking blacklist for URL:', url, error);
      return false;
    }
  }

  /**
   * Check if a domain is in the allowlist
   */
  private isAllowed(hostname: string): boolean {
    if (this.allowedSites.has(hostname)) {
      return true;
    }

    // Check parent domains
    const parts = hostname.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (this.allowedSites.has(parentDomain)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Log a block event for debugging
   */
  private logBlockEvent(
    url: string,
    domain: string,
    matchType: 'exact' | 'subdomain' | 'keyword' | 'url',
    matchedPattern: string,
    browserMode: string
  ): void {
    const event: BlockEvent = {
      timestamp: new Date().toISOString(),
      url,
      domain,
      matchType,
      matchedPattern,
      browserMode
    };

    this.blockLog.push(event);

    // Keep log size bounded
    if (this.blockLog.length > this.maxLogEntries) {
      this.blockLog = this.blockLog.slice(-this.maxLogEntries);
    }

    console.log(`[BLOCKED] ${matchType} match: ${domain} (pattern: ${matchedPattern})`);
  }

  /**
   * Get recent block events
   */
  getBlockLog(limit: number = 100): BlockEvent[] {
    return this.blockLog.slice(-limit);
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
      color: #E6AC00;
    }
    p {
      color: #a0a0a0;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .blocked-url {
      background: rgba(230, 172, 0, 0.1);
      border: 1px solid rgba(230, 172, 0, 0.3);
      border-radius: 8px;
      padding: 1rem;
      color: #E6AC00;
      font-family: monospace;
      font-size: 0.9rem;
      word-break: break-all;
      margin-bottom: 1.5rem;
    }
    .info {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 1.5rem;
    }
    .back-btn {
      display: inline-block;
      background: linear-gradient(135deg, #E6AC00, #FFD700);
      color: #1a1a2e;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      cursor: pointer;
      border: none;
      font-size: 1rem;
    }
    .back-btn:hover {
      background: linear-gradient(135deg, #FFD700, #FFF8DC);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🛡️</div>
    <h1>Content Blocked</h1>
    <p>This website has been blocked by Jubilee's Safe Browsing protection.</p>
    <div class="blocked-url">${this.escapeHtml(blockedUrl)}</div>
    <p class="info">This site appears on one or more community-maintained blocklists designed to protect your browsing experience.</p>
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
   * Get blocklist statistics
   */
  getStats(): {
    totalDomains: number;
    totalKeywords: number;
    totalUrls: number;
    allowedSites: number;
    generatedAt: string | null;
    sources: BlocklistMetadata['sources'] | null;
  } {
    return {
      totalDomains: this.blockedSites.size,
      totalKeywords: this.blockedKeywords.length,
      totalUrls: this.blockedUrls.size,
      allowedSites: this.allowedSites.size,
      generatedAt: this.metadata?.generated_at || null,
      sources: this.metadata?.sources || null
    };
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
    for (const watcher of this.watchedFiles) {
      try {
        watcher.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    this.watchedFiles = [];
  }
}
