# Jubilee Browser Blocklist Sources

This document describes the blocklist sources used by Jubilee Browser to provide safe browsing protection.

## Overview

Jubilee Browser maintains a compiled blocklist (`blacklist.yaml`) that is generated from multiple reputable, continuously maintained external sources. This approach ensures comprehensive coverage that would be impossible to achieve through manual curation.

The blocklist is embedded in the WPF application and loaded by the `BlacklistManager` service at startup.

## Source Feeds

### 1. StevenBlack Unified Hosts (Adult + Gambling)

- **URL**: `https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-porn/hosts`
- **Format**: Hosts file (0.0.0.0 domain entries)
- **Categories**: Adult content, pornography, gambling
- **Update Frequency**: Daily
- **License**: MIT License
- **Usage Notes**: Extract domains from hosts file format. This is the primary source for adult and gambling content blocking.

### 2. AdGuard DNS Filter

- **URL**: `https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt`
- **Format**: AdBlock filter syntax
- **Categories**: Trackers, malware, ads
- **Update Frequency**: Regularly updated
- **License**: GPL-3.0
- **Usage Notes**: Parse AdBlock syntax to extract domain rules (||domain.com^)

### 3. PhishTank Database

- **URL**: `http://data.phishtank.com/data/online-valid.json`
- **Format**: JSON array of phishing URLs
- **Categories**: Phishing
- **Update Frequency**: Hourly
- **License**: Free for non-commercial use; requires registration for API access
- **Usage Notes**: Extract domains from verified phishing URLs. Full URL paths can be used for more precise blocking.

### 4. URLhaus Malware URLs

- **URL**: `https://urlhaus.abuse.ch/downloads/json_recent/`
- **Format**: JSON
- **Categories**: Malware distribution
- **Update Frequency**: Every 5 minutes
- **License**: CC0 (Public Domain)
- **Usage Notes**: Use the API datasets for blacklisting. Extract both full URLs and domains.

### 5. OISD Big List (Optional - Comprehensive)

- **URL**: `https://big.oisd.nl/domainswild`
- **Format**: Domain list
- **Categories**: Comprehensive (ads, trackers, malware, adult content)
- **Update Frequency**: Daily
- **License**: Free for personal/non-commercial use
- **Usage Notes**: Large comprehensive list. Use selectively to avoid over-blocking.

## Blocklist Format

The blocklist is stored in YAML format at the root of the project:

```yaml
# blacklist.yaml
domains:
  - example-blocked-site.com
  - another-blocked.com

keywords:
  - inappropriate-term
  - blocked-keyword
```

### Structure

- **domains**: List of exact domain matches (automatically includes subdomains)
- **keywords**: List of keywords to block in URLs (partial match)

## Integration with WPF Application

The `BlacklistManager` service in the WPF application:

1. Loads `blacklist.yaml` from the application directory at startup
2. Parses domains and keywords into efficient lookup structures
3. Intercepts navigation requests via WebView2 events
4. Blocks requests to matched domains or URLs containing keywords
5. Displays a blocked page when content is filtered

### Location in Installed Application

```
C:\Program Files\Jubilee Browser\blacklist.yaml
```

## Update Process

### For Releases

1. Download latest source feeds
2. Normalize and parse each feed format
3. De-duplicate entries across sources
4. Compile into `blacklist.yaml`
5. Include in application build

### For Organizations

Organizations can customize the blocklist:

1. Navigate to installation directory
2. Edit `blacklist.yaml` directly
3. Restart browser to apply changes

## Metrics

The compiled blocklist typically contains:
- ~200,000+ adult/gambling domains
- ~50,000+ tracker/ad domains
- ~10,000+ phishing domains
- ~5,000+ malware domains

Total unique domains: 300,000+ (varies based on source updates)

## Legal Compliance

All source feeds are used in compliance with their respective licenses:
- MIT and GPL sources are properly attributed
- CC0 sources are public domain
- Commercial use restrictions are noted where applicable

## False Positives

If a legitimate site is incorrectly blocked:

1. Report the issue via GitHub Issues or support@jubileebrowser.com
2. Add an allowlist entry (feature in development)
3. Manually remove from `blacklist.yaml` as a workaround

## Technical Implementation

The blocking is implemented in [BlacklistManager.cs](../JubileeBrowser.WPF/JubileeBrowser/Services/BlacklistManager.cs):

- Uses `HashSet<string>` for O(1) domain lookups
- Supports wildcard subdomain matching
- Keyword matching uses efficient string search
- Loaded asynchronously to avoid blocking startup
