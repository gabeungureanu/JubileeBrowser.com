-- ============================================================================
-- World Wide Bible Web - Seed Data Script
-- ============================================================================
-- Populates initial data for WebSpaceTypes and DNS tables.
-- Run this script after creating tables and indexes.
-- ============================================================================

-- ============================================================================
-- Insert WebSpaceTypes
-- ============================================================================

INSERT INTO "WebSpaceTypes" ("FullTypeName", "AbbreviatedName", "Description", "IsActive")
VALUES
    ('inspire', 'insp', 'Inspirational content and spiritual resources', TRUE),
    ('apostle', 'apos', 'Apostolic ministry and leadership content', TRUE),
    ('webspace', 'webs', 'General web spaces and community platforms', TRUE)
ON CONFLICT ("FullTypeName") DO UPDATE SET
    "AbbreviatedName" = EXCLUDED."AbbreviatedName",
    "Description" = EXCLUDED."Description",
    "IsActive" = EXCLUDED."IsActive",
    "UpdatedAt" = CURRENT_TIMESTAMP;

-- ============================================================================
-- Insert DNS Records
-- ============================================================================

-- Insert DNS record for inspire://home.inspire
INSERT INTO "DNS" (
    "Type_ID",
    "DomainName",
    "PrivateProtocolURL",
    "PublicRelativePath",
    "PublicURL",
    "ThirdPartyOverrideURL",
    "IsActive",
    "Priority",
    "Description"
)
SELECT
    wst."Type_ID",
    'home',
    'inspire://home.inspire',
    '/inspire/home/',
    'https://www.worldwidebibleweb.com/inspire/home/',
    'https://www.jubileeverse.com',
    TRUE,
    10,
    'Main inspire home page - primary spiritual resource hub'
FROM "WebSpaceTypes" wst
WHERE wst."FullTypeName" = 'inspire'
ON CONFLICT ("PrivateProtocolURL") DO UPDATE SET
    "PublicRelativePath" = EXCLUDED."PublicRelativePath",
    "PublicURL" = EXCLUDED."PublicURL",
    "ThirdPartyOverrideURL" = EXCLUDED."ThirdPartyOverrideURL",
    "UpdatedAt" = CURRENT_TIMESTAMP;

-- Insert DNS record for webspace://jubileeverse.webspace
INSERT INTO "DNS" (
    "Type_ID",
    "DomainName",
    "PrivateProtocolURL",
    "PublicRelativePath",
    "PublicURL",
    "ThirdPartyOverrideURL",
    "IsActive",
    "Priority",
    "Description"
)
SELECT
    wst."Type_ID",
    'jubileeverse',
    'webspace://jubileeverse.webspace',
    '/webspace/jubileeverse/',
    'https://www.worldwidebibleweb.com/webspace/jubileeverse/',
    'https://www.jubileeverse.com',
    TRUE,
    10,
    'JubileeVerse community web space'
FROM "WebSpaceTypes" wst
WHERE wst."FullTypeName" = 'webspace'
ON CONFLICT ("PrivateProtocolURL") DO UPDATE SET
    "PublicRelativePath" = EXCLUDED."PublicRelativePath",
    "PublicURL" = EXCLUDED."PublicURL",
    "ThirdPartyOverrideURL" = EXCLUDED."ThirdPartyOverrideURL",
    "UpdatedAt" = CURRENT_TIMESTAMP;

-- Insert DNS record for webspace://trumplicated.webspace
INSERT INTO "DNS" (
    "Type_ID",
    "DomainName",
    "PrivateProtocolURL",
    "PublicRelativePath",
    "PublicURL",
    "ThirdPartyOverrideURL",
    "IsActive",
    "Priority",
    "Description"
)
SELECT
    wst."Type_ID",
    'trumplicated',
    'webspace://trumplicated.webspace',
    '/webspace/trumplicated/',
    'https://www.worldwidebibleweb.com/webspace/trumplicated/',
    'https://www.trumplicated.com',
    TRUE,
    10,
    'Trumplicated community web space'
FROM "WebSpaceTypes" wst
WHERE wst."FullTypeName" = 'webspace'
ON CONFLICT ("PrivateProtocolURL") DO UPDATE SET
    "PublicRelativePath" = EXCLUDED."PublicRelativePath",
    "PublicURL" = EXCLUDED."PublicURL",
    "ThirdPartyOverrideURL" = EXCLUDED."ThirdPartyOverrideURL",
    "UpdatedAt" = CURRENT_TIMESTAMP;

-- ============================================================================
-- Verify Data
-- ============================================================================

-- Display WebSpaceTypes
SELECT
    "Type_ID",
    "FullTypeName",
    "AbbreviatedName",
    "Description",
    "IsActive"
FROM "WebSpaceTypes"
ORDER BY "Type_ID";

-- Display DNS records with type information
SELECT
    d."DNS_ID",
    wst."FullTypeName" AS "WebSpaceType",
    d."DomainName",
    d."PrivateProtocolURL",
    d."PublicRelativePath",
    d."PublicURL",
    d."ThirdPartyOverrideURL",
    d."Priority"
FROM "DNS" d
JOIN "WebSpaceTypes" wst ON d."Type_ID" = wst."Type_ID"
ORDER BY wst."FullTypeName", d."DomainName";
