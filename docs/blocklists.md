# Jubilee Browser Blocklist Sources

This document describes the external blocklist sources used by Jubilee Browser to provide safe browsing protection.

## Overview

Jubilee Browser maintains a compiled blocklist (`blocklists/compiled/blacklist.yaml`) that is generated from multiple reputable, continuously maintained external sources. This approach ensures comprehensive coverage that would be impossible to achieve through manual curation.

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

## Pipeline Process

1. **Fetch**: Download raw lists from each source
2. **Normalize**:
   - Strip comments and metadata
   - Decode hosts file and AdBlock formats
   - Extract clean domains (lowercase, no www prefix inconsistencies)
   - Parse URLs to extract domains where applicable
3. **De-duplicate**: Remove duplicate entries across sources
4. **Compile**: Generate sorted YAML with metadata
5. **Validate**: Ensure output is valid and non-empty

## Generated Files

- `blocklists/raw/<source-name>/` - Raw downloaded files (not committed)
- `blocklists/compiled/blacklist.yaml` - Compiled blocklist (committed)
- `blocklists/compiled/allowlist.yaml` - False positive overrides (committed)

## Update Schedule

The blocklist is updated:
- **Development**: On-demand via `npm run update-blocklist`
- **CI/CD**: Nightly automated updates with PR creation for changes
- **Release**: Fresh compilation before each release

## Legal Compliance

All source feeds are used in compliance with their respective licenses:
- MIT and GPL sources are properly attributed
- CC0 sources are public domain
- Commercial use restrictions are noted where applicable

## False Positives

If a legitimate site is incorrectly blocked:
1. Report the issue via GitHub Issues
2. Add to `blocklists/compiled/allowlist.yaml` with justification
3. The allowlist takes precedence over the blacklist

## Metrics

The compiled blocklist typically contains:
- ~200,000+ adult/gambling domains
- ~50,000+ tracker/ad domains
- ~10,000+ phishing domains
- ~5,000+ malware domains

Total unique domains: varies based on source updates
