# World Wide Bible Web - Database Schema

This directory contains the PostgreSQL database schema for the World Wide Bible Web (WWBW) DNS resolution system.

## Overview

The WWBW database implements a dual-layered DNS resolution system that:
- Maps internal private protocol addresses to public URL equivalents
- Supports flexible expansion across additional domains
- Enables the World Wide Bible Web to function as both a closed covenant network and an externally accessible platform

## Database: WorldWideBibleWeb

### Tables

#### 1. WebSpaceTypes
Catalogs the different types of web spaces in the WWBW network.

| Column | Type | Description |
|--------|------|-------------|
| Type_ID | SERIAL (PK) | Unique identifier |
| FullTypeName | CITEXT | Full type name (e.g., 'inspire', 'church', 'apostle') |
| AbbreviatedName | CHAR(4) | Optional 4-character abbreviation (e.g., 'insp') |
| Description | TEXT | Description of the web space type |
| IsActive | BOOLEAN | Whether this type is active |
| CreatedAt | TIMESTAMP | Record creation time |
| UpdatedAt | TIMESTAMP | Last update time |

#### 2. DNS
Tracks all domain and web space entries, mapping private addresses to public equivalents.

| Column | Type | Description |
|--------|------|-------------|
| DNS_ID | SERIAL (PK) | Unique identifier |
| Type_ID | INTEGER (FK) | Reference to WebSpaceTypes |
| DomainName | CITEXT | Domain name within the web space |
| PrivateProtocolURL | CITEXT | Private URL (e.g., 'inspire://home.inspire') |
| PublicRelativePath | CITEXT | Relative path (e.g., '/inspire/home/') |
| PublicURL | CITEXT | Full public URL equivalent |
| ThirdPartyOverrideURL | CITEXT | Optional third-party domain override |
| IsActive | BOOLEAN | Whether this record is active |
| Priority | INTEGER | Resolution priority (lower = higher) |
| Description | TEXT | Optional description |
| CreatedAt | TIMESTAMP | Record creation time |
| UpdatedAt | TIMESTAMP | Last update time |

### Resolution Flow

```
Private Protocol URL          Public URL                              Third-Party Override
─────────────────────────────────────────────────────────────────────────────────────────
inspire://home.inspire    →   https://www.worldwidebibleweb.com/...  →  https://www.jubileeverse.com
webspace://jubileeverse   →   https://www.worldwidebibleweb.com/...  →  https://www.jubileeverse.com
webspace://trumplicated   →   https://www.worldwidebibleweb.com/...  →  https://www.trumplicated.com
```

## Installation

### Prerequisites
- PostgreSQL 12 or higher
- Extensions: `uuid-ossp`, `citext`, `pg_trgm`

### Installation Steps

1. **Create the database** (as PostgreSQL superuser):
   ```bash
   psql -U postgres -f 001_create_database.sql
   ```

2. **Run all setup scripts** (connects to WorldWideBibleWeb):
   ```bash
   psql -U postgres -d WorldWideBibleWeb -f 000_run_all.sql
   ```

   Or run each script individually:
   ```bash
   psql -U postgres -d WorldWideBibleWeb -f 002_create_tables.sql
   psql -U postgres -d WorldWideBibleWeb -f 003_create_indexes.sql
   psql -U postgres -d WorldWideBibleWeb -f 004_seed_data.sql
   psql -U postgres -d WorldWideBibleWeb -f 005_resolver_functions.sql
   ```

## SQL Scripts

| Script | Purpose |
|--------|---------|
| 000_run_all.sql | Master script that runs all other scripts |
| 001_create_database.sql | Creates the WorldWideBibleWeb database |
| 002_create_tables.sql | Creates WebSpaceTypes and DNS tables |
| 003_create_indexes.sql | Creates optimized indexes for lookups |
| 004_seed_data.sql | Seeds initial WebSpaceTypes and DNS data |
| 005_resolver_functions.sql | Creates resolver functions and cache |

## Resolver Functions

### resolve_private_url(private_url)
Resolves a private protocol URL to its public equivalent.

```sql
SELECT * FROM resolve_private_url('inspire://home.inspire');
-- Returns: resolved_url, public_url, third_party_url, web_space_type, domain_name, priority
```

### resolve_by_type_domain(type, domain)
Resolves DNS by web space type and domain name.

```sql
SELECT * FROM resolve_by_type_domain('webspace', 'jubileeverse');
```

### reverse_resolve_url(public_url)
Reverse resolves a public URL to its private protocol equivalent.

```sql
SELECT * FROM reverse_resolve_url('https://www.jubileeverse.com');
```

### list_dns_by_type(type)
Lists all DNS entries, optionally filtered by type.

```sql
SELECT * FROM list_dns_by_type();          -- All entries
SELECT * FROM list_dns_by_type('webspace'); -- Filtered by type
```

### parse_private_url(private_url)
Parses a private URL into its component parts.

```sql
SELECT * FROM parse_private_url('inspire://home.inspire');
-- Returns: protocol, domain, type_suffix, full_domain
```

### refresh_dns_cache()
Refreshes the materialized view cache. Call after DNS changes.

```sql
SELECT refresh_dns_cache();
```

## Initial Data

### WebSpaceTypes

| FullTypeName | AbbreviatedName | Description |
|--------------|-----------------|-------------|
| inspire | insp | Inspirational content and spiritual resources |
| apostle | apos | Apostolic ministry and leadership content |
| webspace | webs | General web spaces and community platforms |

### DNS Entries

| Type | Domain | Private URL | Third-Party Override |
|------|--------|-------------|---------------------|
| inspire | home | inspire://home.inspire | https://www.jubileeverse.com |
| webspace | jubileeverse | webspace://jubileeverse.webspace | https://www.jubileeverse.com |
| webspace | trumplicated | webspace://trumplicated.webspace | https://www.trumplicated.com |

## Performance Optimization

### Case-Insensitive Storage
All URL and name fields use PostgreSQL's `CITEXT` type for case-insensitive storage and comparison.

### Materialized View Cache
The `DNS_ResolutionCache` materialized view provides pre-computed resolution data for fast lookups:
- Flattened join between DNS and WebSpaceTypes
- Pre-computed `ResolvedURL` (prefers third-party if available)
- Pre-computed `ShortPrivateURL` using abbreviations
- Indexed on all lookup columns

### Trigram Indexes
Trigram indexes (`pg_trgm`) are created on URL fields to support partial/fuzzy matching for autocomplete and search features.

## Adding New Entries

### Add a new WebSpaceType
```sql
INSERT INTO "WebSpaceTypes" ("FullTypeName", "AbbreviatedName", "Description")
VALUES ('church', 'chur', 'Church and congregation web spaces');
```

### Add a new DNS entry
```sql
INSERT INTO "DNS" ("Type_ID", "DomainName", "PublicRelativePath", "PublicURL", "ThirdPartyOverrideURL")
SELECT wst."Type_ID", 'mychurch', '/church/mychurch/',
       'https://www.worldwidebibleweb.com/church/mychurch/',
       'https://www.mychurch.org'
FROM "WebSpaceTypes" wst WHERE wst."FullTypeName" = 'church';

-- Refresh cache after changes
SELECT refresh_dns_cache();
```

## Schema Diagram

```
┌────────────────────────┐       ┌─────────────────────────────────────┐
│    WebSpaceTypes       │       │              DNS                    │
├────────────────────────┤       ├─────────────────────────────────────┤
│ Type_ID (PK)           │───────│ DNS_ID (PK)                         │
│ FullTypeName           │       │ Type_ID (FK)                        │
│ AbbreviatedName        │       │ DomainName                          │
│ Description            │       │ PrivateProtocolURL                  │
│ IsActive               │       │ PublicRelativePath                  │
│ CreatedAt              │       │ PublicURL                           │
│ UpdatedAt              │       │ ThirdPartyOverrideURL               │
└────────────────────────┘       │ IsActive                            │
                                 │ Priority                            │
                                 │ Description                         │
                                 │ CreatedAt                           │
                                 │ UpdatedAt                           │
                                 └─────────────────────────────────────┘
                                                │
                                                ▼
                                 ┌─────────────────────────────────────┐
                                 │      DNS_ResolutionCache            │
                                 │      (Materialized View)            │
                                 ├─────────────────────────────────────┤
                                 │ Pre-computed joins and lookups      │
                                 │ Indexed for fast resolution         │
                                 └─────────────────────────────────────┘
```

## License

Part of the Jubilee Platform - World Wide Bible Web
