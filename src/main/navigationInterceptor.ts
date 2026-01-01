/**
 * Navigation Interceptor
 * Intercepts navigation requests and routes them based on current mode
 */

import { BrowserWindow, session, WebContents } from 'electron';
import { ModeManager } from './modeManager';
import { InspireResolver } from './inspireResolver';
import { HistoryManager } from './historyManager';
import { BlacklistManager } from './blacklistManager';
import { BrowserMode } from '../shared/types';

export class NavigationInterceptor {
  private modeManager: ModeManager;
  private inspireResolver: InspireResolver;
  private historyManager: HistoryManager;
  private blacklistManager: BlacklistManager;
  private mainWindow: BrowserWindow | null = null;

  constructor(
    modeManager: ModeManager,
    inspireResolver: InspireResolver,
    historyManager: HistoryManager,
    blacklistManager: BlacklistManager
  ) {
    this.modeManager = modeManager;
    this.inspireResolver = inspireResolver;
    this.historyManager = historyManager;
    this.blacklistManager = blacklistManager;
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Set up request interception for both sessions
    this.setupSessionInterceptor('persist:internet');
    this.setupSessionInterceptor('persist:jubileebibles');
  }

  private setupSessionInterceptor(partition: string): void {
    const ses = session.fromPartition(partition);

    // Intercept before requests are made
    ses.webRequest.onBeforeRequest((details, callback) => {
      const { url, resourceType } = details;
      const currentMode = this.modeManager.getCurrentMode();
      const isJubileebiblesSession = partition === 'persist:jubileebibles';

      // Always allow internal resources
      if (this.isInternalResource(url)) {
        callback({ cancel: false });
        return;
      }

      // Check blacklist for main frame requests (pages)
      if (resourceType === 'mainFrame' && this.blacklistManager.isBlocked(url)) {
        console.log(`Blocked by blacklist: ${url}`);
        // Cancel the request - the renderer will show the blocked page
        callback({ cancel: true });
        // Notify renderer about blocked URL so it can show blocked page
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('url-blocked', {
            url: url,
            content: this.blacklistManager.getBlockedPageContent(url),
          });
        }
        return;
      }

      // Handle based on mode and URL type
      if (isJubileebiblesSession) {
        // In JubileeBibles session, only allow inspire:// and essential resources
        if (this.isInspireUrl(url)) {
          callback({ cancel: false });
        } else if (this.isAllowedInJubileebibles(url, resourceType)) {
          callback({ cancel: false });
        } else {
          // Block external requests in JubileeBibles mode
          console.log(`Blocked in JubileeBibles: ${url}`);
          callback({ cancel: true });
        }
      } else {
        // Internet session - block inspire:// URLs
        if (this.isInspireUrl(url)) {
          console.log(`Blocked inspire:// in Internet mode: ${url}`);
          callback({ cancel: true });
        } else {
          // Check blacklist for all resource types (to prevent loading from blocked domains)
          if (this.blacklistManager.isBlocked(url)) {
            console.log(`Blocked resource by blacklist: ${url}`);
            callback({ cancel: true });
          } else {
            callback({ cancel: false });
          }
        }
      }
    });

    // Log navigation for history
    ses.webRequest.onCompleted((details) => {
      if (details.resourceType === 'mainFrame' && details.statusCode === 200) {
        const mode: BrowserMode = partition === 'persist:jubileebibles' ? 'jubileebibles' : 'internet';
        // History will be added by the tab manager when title is available
      }
    });
  }

  private isInternalResource(url: string): boolean {
    return (
      url.startsWith('file://') ||
      url.startsWith('data:') ||
      url.startsWith('about:') ||
      url.startsWith('devtools:') ||
      url.startsWith('chrome-extension:')
    );
  }

  private isInspireUrl(url: string): boolean {
    return url.startsWith('inspire://') || url.includes('.inspire');
  }

  private isAllowedInJubileebibles(url: string, resourceType: string): boolean {
    // Allow certain resource types for JubileeBibles pages that may load assets
    const allowedResourceTypes = ['stylesheet', 'font', 'image'];

    // Allow data URLs
    if (url.startsWith('data:')) {
      return true;
    }

    // Allow JubileeVerse.com domain and its subdomains
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'jubileeverse.com' || hostname.endsWith('.jubileeverse.com')) {
        return true;
      }
    } catch (e) {
      // Invalid URL, will be rejected
    }

    // For future: allow specific CDNs or asset hosts for JubileeBibles
    // This could be configured per-location

    return false;
  }

  // Process a URL and determine how to handle it
  processNavigation(url: string): {
    shouldNavigate: boolean;
    processedUrl: string;
    mode: BrowserMode;
    error?: string;
  } {
    const currentMode = this.modeManager.getCurrentMode();

    // Normalize the URL
    const normalizedUrl = this.normalizeUrl(url, currentMode);

    if (currentMode === 'jubileebibles') {
      // In JubileeBibles mode, handle .inspire URLs
      if (this.isInspireUrl(normalizedUrl)) {
        const resolution = this.inspireResolver.resolveSync(normalizedUrl);
        if (resolution.success) {
          return {
            shouldNavigate: true,
            processedUrl: normalizedUrl,
            mode: 'jubileebibles',
          };
        } else {
          return {
            shouldNavigate: false,
            processedUrl: normalizedUrl,
            mode: 'jubileebibles',
            error: resolution.errorMessage,
          };
        }
      } else {
        // Non-inspire URL in JubileeBibles mode
        return {
          shouldNavigate: false,
          processedUrl: url,
          mode: 'jubileebibles',
          error: 'Only .inspire locations are accessible in JubileeBibles Mode',
        };
      }
    } else {
      // Internet mode - standard navigation
      if (this.isInspireUrl(normalizedUrl)) {
        return {
          shouldNavigate: false,
          processedUrl: url,
          mode: 'internet',
          error: 'Switch to JubileeBibles Mode to visit .inspire locations',
        };
      }

      return {
        shouldNavigate: true,
        processedUrl: normalizedUrl,
        mode: 'internet',
      };
    }
  }

  private normalizeUrl(url: string, mode: BrowserMode): string {
    const trimmed = url.trim();

    // Handle inspire:// and .inspire
    if (mode === 'jubileebibles') {
      if (trimmed.endsWith('.inspire') && !trimmed.includes('://')) {
        return `inspire://${trimmed}`;
      }
      if (trimmed.startsWith('inspire://')) {
        return trimmed;
      }
      // Assume it's a shorthand inspire address
      if (!trimmed.includes('.') && !trimmed.includes('://')) {
        return `inspire://${trimmed}.inspire`;
      }
    }

    // Handle regular URLs
    if (!trimmed.includes('://')) {
      // Check if it looks like a domain
      if (trimmed.includes('.') && !trimmed.includes(' ')) {
        return `https://${trimmed}`;
      }
      // Treat as search query (for future implementation)
      return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    }

    return trimmed;
  }
}
