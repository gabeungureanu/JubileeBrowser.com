#!/usr/bin/env node
/**
 * Blocklist Update Pipeline
 *
 * Fetches, normalizes, and compiles blocklists from reputable external sources.
 * Run with: node scripts/update-blocklist.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Configuration
const CONFIG = {
  outputDir: path.join(__dirname, '..', 'blocklists', 'compiled'),
  rawDir: path.join(__dirname, '..', 'blocklists', 'raw'),
  outputFile: 'blacklist.yaml',

  // Source feeds with metadata
  sources: [
    {
      id: 'stevenblack-gambling-porn',
      name: 'StevenBlack Unified Hosts (Gambling + Porn)',
      url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-porn/hosts',
      format: 'hosts',
      categories: ['adult', 'gambling'],
      license: 'MIT',
      enabled: true
    },
    {
      id: 'stevenblack-fakenews',
      name: 'StevenBlack Unified Hosts (Fakenews)',
      url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews/hosts',
      format: 'hosts',
      categories: ['disinformation'],
      license: 'MIT',
      enabled: true
    },
    {
      id: 'urlhaus-domains',
      name: 'URLhaus Malware Domains',
      url: 'https://urlhaus.abuse.ch/downloads/hostfile/',
      format: 'hosts',
      categories: ['malware'],
      license: 'CC0',
      enabled: true
    },
    {
      id: 'phishing-army',
      name: 'Phishing Army Blocklist',
      url: 'https://phishing.army/download/phishing_army_blocklist.txt',
      format: 'domains',
      categories: ['phishing'],
      license: 'CC BY-NC 4.0',
      enabled: true
    },
    {
      id: 'someonewhocares',
      name: 'SomeoneWhoCares Hosts',
      url: 'https://someonewhocares.org/hosts/zero/hosts',
      format: 'hosts',
      categories: ['ads', 'trackers', 'malware'],
      license: 'Non-commercial',
      enabled: true
    }
  ]
};

// Ensure directories exist
function ensureDirectories() {
  [CONFIG.outputDir, CONFIG.rawDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  CONFIG.sources.forEach(source => {
    const sourceDir = path.join(CONFIG.rawDir, source.id);
    if (!fs.existsSync(sourceDir)) {
      fs.mkdirSync(sourceDir, { recursive: true });
    }
  });
}

// Fetch URL with redirect handling
function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'JubileeBrowser-BlocklistUpdater/1.0',
        'Accept-Encoding': 'gzip, deflate'
      }
    }, response => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        let redirectUrl = response.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsedUrl = new URL(url);
          redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
        }
        fetchUrl(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const chunks = [];
      const encoding = response.headers['content-encoding'];

      let stream = response;
      if (encoding === 'gzip') {
        stream = response.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = response.pipe(zlib.createInflate());
      }

      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Parse hosts file format (0.0.0.0 domain or 127.0.0.1 domain)
function parseHostsFile(content) {
  const domains = new Set();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse hosts file format: IP domain
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const ip = parts[0];
      const domain = parts[1].toLowerCase();

      // Only process blocking entries (0.0.0.0 or 127.0.0.1)
      if ((ip === '0.0.0.0' || ip === '127.0.0.1') && domain !== 'localhost') {
        // Normalize domain
        const normalized = normalizeDomain(domain);
        if (normalized && isValidDomain(normalized)) {
          domains.add(normalized);
        }
      }
    }
  }

  return domains;
}

// Parse simple domain list
function parseDomainList(content) {
  const domains = new Set();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;

    const normalized = normalizeDomain(trimmed);
    if (normalized && isValidDomain(normalized)) {
      domains.add(normalized);
    }
  }

  return domains;
}

// Normalize domain
function normalizeDomain(domain) {
  if (!domain) return null;

  let normalized = domain.toLowerCase().trim();

  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove path, query, port
  normalized = normalized.split('/')[0].split('?')[0].split(':')[0];

  // Remove trailing dot (FQDN format)
  normalized = normalized.replace(/\.$/, '');

  // Remove www. prefix for consistency (we'll match both with and without)
  // Actually, keep www. as some lists specifically block www. versions

  return normalized;
}

// Validate domain format
function isValidDomain(domain) {
  if (!domain || domain.length < 3) return false;
  if (domain.length > 253) return false;

  // Must contain at least one dot
  if (!domain.includes('.')) return false;

  // Basic domain character validation
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return false;
  }

  // Skip localhost variations
  if (domain === 'localhost' || domain.endsWith('.localhost')) return false;

  // Skip local network domains
  if (domain.endsWith('.local') || domain.endsWith('.lan')) return false;

  return true;
}

// Fetch and parse a source
async function processSource(source) {
  console.log(`\n[${source.id}] Fetching ${source.name}...`);

  try {
    const startTime = Date.now();
    const content = await fetchUrl(source.url);
    const fetchTime = Date.now() - startTime;

    // Save raw content
    const rawPath = path.join(CONFIG.rawDir, source.id, 'raw.txt');
    fs.writeFileSync(rawPath, content);

    // Parse based on format
    let domains;
    switch (source.format) {
      case 'hosts':
        domains = parseHostsFile(content);
        break;
      case 'domains':
        domains = parseDomainList(content);
        break;
      default:
        throw new Error(`Unknown format: ${source.format}`);
    }

    console.log(`[${source.id}] Fetched in ${fetchTime}ms, parsed ${domains.size} domains`);

    return {
      id: source.id,
      name: source.name,
      categories: source.categories,
      license: source.license,
      fetchedAt: new Date().toISOString(),
      domainCount: domains.size,
      domains: domains
    };
  } catch (error) {
    console.error(`[${source.id}] Error: ${error.message}`);
    return {
      id: source.id,
      name: source.name,
      error: error.message,
      domains: new Set()
    };
  }
}

// Compile all sources into final blocklist
function compileBlocklist(results) {
  console.log('\n--- Compiling blocklist ---');

  // Merge all domains with category tracking
  const domainCategories = new Map(); // domain -> Set of categories

  for (const result of results) {
    if (result.error) continue;

    for (const domain of result.domains) {
      if (!domainCategories.has(domain)) {
        domainCategories.set(domain, new Set());
      }
      result.categories.forEach(cat => domainCategories.get(domain).add(cat));
    }
  }

  // Sort domains
  const sortedDomains = Array.from(domainCategories.keys()).sort();

  console.log(`Total unique domains: ${sortedDomains.length}`);

  // Count by category
  const categoryCounts = {};
  for (const [domain, categories] of domainCategories) {
    for (const cat of categories) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }
  console.log('Domains by category:', categoryCounts);

  // Generate YAML content
  const generatedAt = new Date().toISOString();

  let yaml = `# Jubilee Browser Compiled Blocklist
# Generated: ${generatedAt}
# Total domains: ${sortedDomains.length}
#
# This file is auto-generated by scripts/update-blocklist.js
# Do not edit manually - changes will be overwritten
#
# Sources:
`;

  for (const result of results) {
    if (result.error) {
      yaml += `#   - ${result.name}: ERROR - ${result.error}\n`;
    } else {
      yaml += `#   - ${result.name}: ${result.domainCount} domains (${result.categories.join(', ')})\n`;
    }
  }

  yaml += `
metadata:
  generated_at: "${generatedAt}"
  total_domains: ${sortedDomains.length}
  sources:
`;

  for (const result of results) {
    yaml += `    - id: "${result.id}"
      name: "${result.name}"
      fetched_at: "${result.fetchedAt || 'N/A'}"
      domain_count: ${result.domainCount || 0}
      status: "${result.error ? 'error' : 'success'}"
`;
    if (result.error) {
      yaml += `      error: "${result.error}"\n`;
    }
  }

  yaml += `
# Blocked domains (auto-generated from sources above)
blocked_sites:
`;

  for (const domain of sortedDomains) {
    yaml += `  - ${domain}\n`;
  }

  yaml += `
# Keywords for URL matching (manually curated)
blocked_keywords: []

# URL-level blocks (for precise phishing/malware URLs)
blocked_urls: []
`;

  return yaml;
}

// Main execution
async function main() {
  console.log('=== Jubilee Browser Blocklist Updater ===\n');
  console.log(`Output: ${path.join(CONFIG.outputDir, CONFIG.outputFile)}`);

  ensureDirectories();

  // Process all enabled sources
  const enabledSources = CONFIG.sources.filter(s => s.enabled);
  console.log(`\nProcessing ${enabledSources.length} sources...`);

  const results = [];
  for (const source of enabledSources) {
    const result = await processSource(source);
    results.push(result);
  }

  // Compile final blocklist
  const yaml = compileBlocklist(results);

  // Write output
  const outputPath = path.join(CONFIG.outputDir, CONFIG.outputFile);
  fs.writeFileSync(outputPath, yaml);
  console.log(`\nBlocklist written to: ${outputPath}`);

  // Also copy to the main blacklist.yaml location for immediate use
  const mainBlacklistPath = path.join(__dirname, '..', 'blacklist.yaml');
  fs.writeFileSync(mainBlacklistPath, yaml);
  console.log(`Also updated: ${mainBlacklistPath}`);

  // Summary
  console.log('\n=== Summary ===');
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  console.log(`Sources: ${successCount} succeeded, ${errorCount} failed`);

  const totalDomains = results.reduce((sum, r) => sum + (r.domains?.size || 0), 0);
  console.log(`Total domains before dedup: ${totalDomains}`);

  // Parse the output to get actual unique count
  const uniqueCount = yaml.match(/blocked_sites:/)[0] ?
    (yaml.split('blocked_sites:')[1].match(/  - /g) || []).length : 0;
  console.log(`Total unique domains: ${uniqueCount}`);

  console.log('\nDone!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
