/**
 * Inspire Namespace Resolver
 * Resolves .inspire addresses to content within JubileeBibles
 */

import { InspireResolution, InspireMetadata } from '../shared/types';

interface InspireLocation {
  publicAddress: string;      // e.g., "home.inspire"
  internalAddress: string;    // e.g., "home.ins"
  metadata: InspireMetadata;
  content?: string;           // Local/static content
  remoteUrl?: string;         // For hosted content
}

export class InspireResolver {
  private registry: Map<string, InspireLocation> = new Map();

  constructor() {
    this.initializeDefaultLocations();
  }

  private initializeDefaultLocations(): void {
    // Register core JubileeBibles locations

    // Home - the starting point
    this.registerLocation({
      publicAddress: 'home.inspire',
      internalAddress: 'home.ins',
      metadata: {
        name: 'Jubilee Bibles Home',
        description: 'Welcome to Jubilee Bibles - a space for intentional digital gathering',
        consecrated: true,
        requiresIdentity: false,
      },
      content: this.getHomeContent(),
    });

    // About - information about JubileeBibles
    this.registerLocation({
      publicAddress: 'about.inspire',
      internalAddress: 'about.ins',
      metadata: {
        name: 'About Jubilee Bibles',
        description: 'Learn about the Jubilee Bibles network and its purpose',
        consecrated: true,
        requiresIdentity: false,
      },
      content: this.getAboutContent(),
    });

    // Guide - how to navigate JubileeBibles
    this.registerLocation({
      publicAddress: 'guide.inspire',
      internalAddress: 'guide.ins',
      metadata: {
        name: 'Jubilee Bibles Guide',
        description: 'How to navigate and participate in Jubilee Bibles spaces',
        consecrated: true,
        requiresIdentity: false,
      },
      content: this.getGuideContent(),
    });

    // Welcome - first-time visitor experience
    this.registerLocation({
      publicAddress: 'welcome.inspire',
      internalAddress: 'welcome.ins',
      metadata: {
        name: 'Welcome to Jubilee Bibles',
        description: 'Your first steps into intentional digital spaces',
        consecrated: true,
        requiresIdentity: false,
      },
      content: this.getWelcomeContent(),
    });
  }

  registerLocation(location: InspireLocation): void {
    this.registry.set(location.publicAddress.toLowerCase(), location);
    // Also register by internal address for reverse lookups
    this.registry.set(location.internalAddress.toLowerCase(), location);
  }

  resolve(url: string): Promise<InspireResolution> {
    return Promise.resolve(this.resolveSync(url));
  }

  resolveSync(url: string): InspireResolution {
    try {
      // Parse the inspire:// URL
      const parsed = this.parseInspireUrl(url);
      if (!parsed) {
        return {
          success: false,
          contentType: 'error',
          errorMessage: 'Invalid inspire:// URL format',
        };
      }

      // Look up the location
      const location = this.registry.get(parsed.host.toLowerCase());
      if (!location) {
        return {
          success: false,
          contentType: 'error',
          errorMessage: `Location not found: ${parsed.host}`,
        };
      }

      // Return the resolved content
      if (location.content) {
        return {
          success: true,
          internalUrl: `ins://${location.internalAddress}${parsed.path}`,
          contentType: 'local',
          content: location.content,
          metadata: location.metadata,
        };
      }

      if (location.remoteUrl) {
        return {
          success: true,
          internalUrl: location.remoteUrl,
          contentType: 'hosted',
          metadata: location.metadata,
        };
      }

      return {
        success: false,
        contentType: 'error',
        errorMessage: 'Location has no content source configured',
      };
    } catch (error) {
      return {
        success: false,
        contentType: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseInspireUrl(url: string): { host: string; path: string; query: string } | null {
    // Handle both inspire:// and plain address formats
    let normalized = url;

    if (url.startsWith('inspire://')) {
      normalized = url.substring('inspire://'.length);
    } else if (url.endsWith('.inspire')) {
      normalized = url;
    } else if (!url.includes('.inspire') && !url.includes('.ins')) {
      // Assume it's a shorthand - append .inspire
      normalized = `${url}.inspire`;
    }

    // Parse host, path, query
    const pathStart = normalized.indexOf('/');
    const queryStart = normalized.indexOf('?');

    let host: string;
    let path = '/';
    let query = '';

    if (pathStart > -1) {
      host = normalized.substring(0, pathStart);
      const pathEnd = queryStart > -1 ? queryStart : normalized.length;
      path = normalized.substring(pathStart, pathEnd);
    } else if (queryStart > -1) {
      host = normalized.substring(0, queryStart);
      query = normalized.substring(queryStart);
    } else {
      host = normalized;
    }

    if (!host) return null;

    return { host, path, query };
  }

  getErrorPage(message: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Location Not Found - Jubilee Bibles</title>
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
    .error-message {
      background: rgba(255, 100, 100, 0.1);
      border: 1px solid rgba(255, 100, 100, 0.3);
      border-radius: 8px;
      padding: 1rem;
      color: #ff9999;
      font-family: monospace;
      margin-bottom: 1.5rem;
    }
    a {
      color: #7dd3fc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Location Not Found</h1>
    <p>The Jubilee Bibles location you're looking for could not be found.</p>
    <div class="error-message">${this.escapeHtml(message)}</div>
    <p><a href="inspire://home.inspire">Return to Jubilee Bibles Home</a></p>
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

  private getHomeContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jubilee Bibles Home</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #e8e8e8;
      min-height: 100vh;
    }
    .hero {
      padding: 4rem 2rem;
      text-align: center;
      max-width: 800px;
      margin: 0 auto;
    }
    .logo {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #E6AC00, #ff8c00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .tagline {
      color: #7dd3fc;
      font-size: 1.2rem;
      margin-bottom: 2rem;
    }
    .description {
      color: #a0a0a0;
      line-height: 1.8;
      margin-bottom: 3rem;
    }
    .locations {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    .location-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1.5rem;
      text-decoration: none;
      transition: all 0.3s ease;
    }
    .location-card:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: #E6AC00;
      transform: translateY(-2px);
    }
    .location-card h3 {
      color: #E6AC00;
      margin-bottom: 0.5rem;
    }
    .location-card p {
      color: #888;
      font-size: 0.9rem;
    }
    .footer {
      text-align: center;
      padding: 2rem;
      color: #666;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="hero">
    <h1 class="logo">Jubilee Bibles</h1>
    <p class="tagline">Intentional Digital Spaces</p>
    <p class="description">
      Welcome to Jubilee Bibles, a network of consecrated digital locations
      designed for meaningful gathering, reflection, and community.
      Unlike the open Internet, Jubilee Bibles spaces operate with purpose,
      identity, and stewardship at their core.
    </p>
  </div>

  <div class="locations">
    <a href="inspire://welcome.inspire" class="location-card">
      <h3>Welcome</h3>
      <p>Begin your journey into Jubilee Bibles</p>
    </a>
    <a href="inspire://about.inspire" class="location-card">
      <h3>About</h3>
      <p>Learn about the Jubilee Bibles vision</p>
    </a>
    <a href="inspire://guide.inspire" class="location-card">
      <h3>Guide</h3>
      <p>How to navigate Jubilee Bibles spaces</p>
    </a>
  </div>

  <div class="footer">
    <p>Jubilee Bibles &middot; A space set apart</p>
  </div>
</body>
</html>`;
  }

  private getAboutContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>About Jubilee Bibles</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e8e8e8;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 700px;
      margin: 0 auto;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1.5rem;
      background: linear-gradient(135deg, #E6AC00, #ff8c00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    h2 {
      color: #7dd3fc;
      margin: 2rem 0 1rem;
    }
    p {
      color: #c0c0c0;
      line-height: 1.8;
      margin-bottom: 1rem;
    }
    .nav {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    a {
      color: #E6AC00;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>About Jubilee Bibles</h1>

    <p>
      Jubilee Bibles is a parallel network space designed for intentional digital
      gathering. It exists alongside the public Internet but operates by
      different principles.
    </p>

    <h2>What Makes Jubilee Bibles Different</h2>
    <p>
      On the public Internet, content is generally accessible to anyone,
      interaction is often anonymous, and spaces are designed for maximum
      engagement. Jubilee Bibles takes a different approach.
    </p>
    <p>
      Jubilee Bibles locations (.inspire addresses) are consecrated spaces—meaning
      they exist with explicit purpose and stewardship. They are not open to
      anonymous drive-by access by default. Participation in Jubilee Bibles spaces
      may require identity and invitation.
    </p>

    <h2>The .inspire Namespace</h2>
    <p>
      Just as the Internet uses domain extensions like .com or .org, Jubilee Bibles
      uses .inspire as its primary namespace. These addresses represent
      locations within the Jubilee Bibles network, accessible through Jubilee.
    </p>

    <h2>Vision</h2>
    <p>
      Jubilee Bibles is infrastructure for a new kind of digital presence—one that
      prioritizes depth over breadth, meaning over metrics, and community over
      crowds. It is a foundation upon which intentional digital experiences
      can be built.
    </p>

    <div class="nav">
      <a href="inspire://home.inspire">← Return Home</a>
    </div>
  </div>
</body>
</html>`;
  }

  private getGuideContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jubilee Bibles Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e8e8e8;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 700px;
      margin: 0 auto;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1.5rem;
      background: linear-gradient(135deg, #E6AC00, #ff8c00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    h2 {
      color: #7dd3fc;
      margin: 2rem 0 1rem;
    }
    p, li {
      color: #c0c0c0;
      line-height: 1.8;
      margin-bottom: 1rem;
    }
    ul {
      padding-left: 1.5rem;
    }
    code {
      background: rgba(255,255,255,0.1);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
      color: #E6AC00;
    }
    .nav {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    a {
      color: #E6AC00;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Navigating Jubilee Bibles</h1>

    <h2>Switching Modes</h2>
    <p>
      Jubilee operates in two modes: Internet Mode and Jubilee Bibles Mode.
      Use the mode toggle in the browser toolbar to switch between them.
    </p>
    <ul>
      <li><strong>Internet Mode:</strong> Browse the public web normally</li>
      <li><strong>Jubilee Bibles Mode:</strong> Access .inspire locations</li>
    </ul>

    <h2>Visiting .inspire Locations</h2>
    <p>
      In Jubilee Bibles Mode, enter .inspire addresses in the address bar:
    </p>
    <ul>
      <li><code>inspire://home.inspire</code> - Jubilee Bibles home</li>
      <li><code>inspire://about.inspire</code> - About Jubilee Bibles</li>
      <li><code>home.inspire</code> - Shorthand also works</li>
    </ul>

    <h2>Session Isolation</h2>
    <p>
      Internet Mode and Jubilee Bibles Mode maintain separate sessions. Your
      browsing history, cookies, and stored data do not cross between modes.
      This ensures privacy and contextual separation.
    </p>

    <h2>Identity in Jubilee Bibles</h2>
    <p>
      Some Jubilee Bibles locations may require you to establish identity before
      participating. This is by design—Jubilee Bibles prioritizes meaningful
      presence over anonymous access.
    </p>

    <div class="nav">
      <a href="inspire://home.inspire">← Return Home</a>
    </div>
  </div>
</body>
</html>`;
  }

  private getWelcomeContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Jubilee Bibles</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 50%, #16213e 100%);
      color: #e8e8e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 3rem;
      max-width: 600px;
    }
    .welcome-icon {
      font-size: 4rem;
      margin-bottom: 1.5rem;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #E6AC00, #ff8c00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      color: #7dd3fc;
      font-size: 1.2rem;
      margin-bottom: 2rem;
    }
    p {
      color: #a0a0a0;
      line-height: 1.8;
      margin-bottom: 1.5rem;
    }
    .cta {
      display: inline-block;
      background: linear-gradient(135deg, #E6AC00, #ff8c00);
      color: #1a1a2e;
      padding: 1rem 2rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 1rem;
      transition: transform 0.2s;
    }
    .cta:hover {
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="welcome-icon">✦</div>
    <h1>Welcome</h1>
    <p class="subtitle">You've arrived at Jubilee Bibles</p>
    <p>
      This is a space set apart from the ordinary Internet—a network
      designed for intentional gathering, meaningful presence, and
      purposeful connection.
    </p>
    <p>
      Here, you won't find the noise and distraction of the public web.
      Instead, you'll discover consecrated digital spaces where every
      location exists with purpose.
    </p>
    <a href="inspire://home.inspire" class="cta">Explore Jubilee Bibles</a>
  </div>
</body>
</html>`;
  }
}
