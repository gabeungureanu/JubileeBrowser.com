-- ============================================================================
-- World Wide Bible Web - Index Creation Script
-- ============================================================================
-- Creates optimized indexes for case-insensitive lookups and fast resolution.
-- Run this script after creating the tables.
-- ============================================================================

-- ============================================================================
-- Indexes for WebSpaceTypes Table
-- ============================================================================

-- Index on FullTypeName for fast type lookups (CITEXT already case-insensitive)
CREATE INDEX IF NOT EXISTS "IDX_WebSpaceTypes_FullTypeName"
    ON "WebSpaceTypes" ("FullTypeName");

-- Index on AbbreviatedName for abbreviated lookups
CREATE INDEX IF NOT EXISTS "IDX_WebSpaceTypes_AbbreviatedName"
    ON "WebSpaceTypes" ("AbbreviatedName")
    WHERE "AbbreviatedName" IS NOT NULL;

-- Index on IsActive for filtering active types
CREATE INDEX IF NOT EXISTS "IDX_WebSpaceTypes_IsActive"
    ON "WebSpaceTypes" ("IsActive")
    WHERE "IsActive" = TRUE;

-- ============================================================================
-- Indexes for DNS Table
-- ============================================================================

-- Primary lookup index: Private Protocol URL (most common resolution path)
CREATE INDEX IF NOT EXISTS "IDX_DNS_PrivateProtocolURL"
    ON "DNS" ("PrivateProtocolURL");

-- Trigram index for partial/fuzzy matching on private URLs
CREATE INDEX IF NOT EXISTS "IDX_DNS_PrivateProtocolURL_Trgm"
    ON "DNS" USING gin ("PrivateProtocolURL" gin_trgm_ops);

-- Index on Public Relative Path for reverse lookups
CREATE INDEX IF NOT EXISTS "IDX_DNS_PublicRelativePath"
    ON "DNS" ("PublicRelativePath");

-- Index on Public URL for reverse resolution
CREATE INDEX IF NOT EXISTS "IDX_DNS_PublicURL"
    ON "DNS" ("PublicURL");

-- Index on Third Party Override URL for external domain lookups
CREATE INDEX IF NOT EXISTS "IDX_DNS_ThirdPartyOverrideURL"
    ON "DNS" ("ThirdPartyOverrideURL")
    WHERE "ThirdPartyOverrideURL" IS NOT NULL;

-- Composite index for Type + Domain lookups
CREATE INDEX IF NOT EXISTS "IDX_DNS_Type_Domain"
    ON "DNS" ("Type_ID", "DomainName");

-- Index on DomainName for domain-only searches
CREATE INDEX IF NOT EXISTS "IDX_DNS_DomainName"
    ON "DNS" ("DomainName");

-- Trigram index for partial matching on domain names
CREATE INDEX IF NOT EXISTS "IDX_DNS_DomainName_Trgm"
    ON "DNS" USING gin ("DomainName" gin_trgm_ops);

-- Index for active records with priority ordering
CREATE INDEX IF NOT EXISTS "IDX_DNS_Active_Priority"
    ON "DNS" ("IsActive", "Priority")
    WHERE "IsActive" = TRUE;

-- Composite index for the resolution chain: Private -> Public -> ThirdParty
CREATE INDEX IF NOT EXISTS "IDX_DNS_Resolution_Chain"
    ON "DNS" ("PrivateProtocolURL", "PublicURL", "ThirdPartyOverrideURL")
    WHERE "IsActive" = TRUE;

-- ============================================================================
-- Comments on Indexes
-- ============================================================================

COMMENT ON INDEX "IDX_DNS_PrivateProtocolURL" IS 'Primary lookup index for private protocol URL resolution';
COMMENT ON INDEX "IDX_DNS_PrivateProtocolURL_Trgm" IS 'Trigram index for fuzzy matching on private URLs';
COMMENT ON INDEX "IDX_DNS_PublicRelativePath" IS 'Index for reverse lookups by public path';
COMMENT ON INDEX "IDX_DNS_Resolution_Chain" IS 'Composite index for the full resolution chain';
