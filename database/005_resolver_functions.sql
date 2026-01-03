-- ============================================================================
-- World Wide Bible Web - DNS Resolver Functions
-- ============================================================================
-- Implements resolver functions and caching views for accelerated lookups
-- between the resolution layers: Private -> Public -> Optional Third-level
-- ============================================================================

-- ============================================================================
-- Materialized View: DNS Resolution Cache
-- ============================================================================
-- This materialized view provides a flattened, optimized view for fast lookups.
-- Refresh this view periodically or after DNS changes.
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS "DNS_ResolutionCache" AS
SELECT
    d."DNS_ID",
    wst."Type_ID",
    wst."FullTypeName" AS "WebSpaceType",
    wst."AbbreviatedName" AS "WebSpaceTypeAbbrev",
    d."DomainName",
    d."PrivateProtocolURL",
    d."PublicRelativePath",
    d."PublicURL",
    d."ThirdPartyOverrideURL",
    d."Priority",
    -- Pre-computed resolution target (prefers third-party if available)
    COALESCE(d."ThirdPartyOverrideURL", d."PublicURL") AS "ResolvedURL",
    -- Computed short form of private URL using abbreviation
    CASE
        WHEN wst."AbbreviatedName" IS NOT NULL THEN
            wst."AbbreviatedName" || '://' || d."DomainName" || '.' || wst."AbbreviatedName"
        ELSE NULL
    END AS "ShortPrivateURL",
    d."IsActive",
    d."CreatedAt",
    d."UpdatedAt"
FROM "DNS" d
JOIN "WebSpaceTypes" wst ON d."Type_ID" = wst."Type_ID"
WHERE d."IsActive" = TRUE AND wst."IsActive" = TRUE
ORDER BY d."Priority" ASC, wst."FullTypeName", d."DomainName";

-- Create indexes on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ResCache_DNS_ID"
    ON "DNS_ResolutionCache" ("DNS_ID");

CREATE INDEX IF NOT EXISTS "IDX_ResCache_PrivateURL"
    ON "DNS_ResolutionCache" ("PrivateProtocolURL");

CREATE INDEX IF NOT EXISTS "IDX_ResCache_ShortPrivateURL"
    ON "DNS_ResolutionCache" ("ShortPrivateURL")
    WHERE "ShortPrivateURL" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IDX_ResCache_PublicPath"
    ON "DNS_ResolutionCache" ("PublicRelativePath");

CREATE INDEX IF NOT EXISTS "IDX_ResCache_ResolvedURL"
    ON "DNS_ResolutionCache" ("ResolvedURL");

CREATE INDEX IF NOT EXISTS "IDX_ResCache_Type_Domain"
    ON "DNS_ResolutionCache" ("WebSpaceType", "DomainName");

COMMENT ON MATERIALIZED VIEW "DNS_ResolutionCache" IS 'Optimized cache view for fast DNS resolution lookups';

-- ============================================================================
-- Function: Refresh DNS Cache
-- ============================================================================
-- Call this function after any DNS or WebSpaceType changes

CREATE OR REPLACE FUNCTION refresh_dns_cache()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY "DNS_ResolutionCache";
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_dns_cache() IS 'Refreshes the DNS resolution cache materialized view';

-- ============================================================================
-- Function: Resolve Private URL to Public URL
-- ============================================================================
-- Primary resolution function: Private -> Public (or Third-Party if available)

CREATE OR REPLACE FUNCTION resolve_private_url(
    p_private_url CITEXT
)
RETURNS TABLE (
    resolved_url CITEXT,
    public_url CITEXT,
    third_party_url CITEXT,
    web_space_type CITEXT,
    domain_name CITEXT,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc."ResolvedURL",
        rc."PublicURL",
        rc."ThirdPartyOverrideURL",
        rc."WebSpaceType",
        rc."DomainName",
        rc."Priority"
    FROM "DNS_ResolutionCache" rc
    WHERE rc."PrivateProtocolURL" = p_private_url
       OR rc."ShortPrivateURL" = p_private_url
    ORDER BY rc."Priority" ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION resolve_private_url(CITEXT) IS 'Resolves a private protocol URL to its public equivalent';

-- ============================================================================
-- Function: Resolve by Type and Domain
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_by_type_domain(
    p_type CITEXT,
    p_domain CITEXT
)
RETURNS TABLE (
    private_url CITEXT,
    resolved_url CITEXT,
    public_url CITEXT,
    third_party_url CITEXT,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc."PrivateProtocolURL",
        rc."ResolvedURL",
        rc."PublicURL",
        rc."ThirdPartyOverrideURL",
        rc."Priority"
    FROM "DNS_ResolutionCache" rc
    WHERE (rc."WebSpaceType" = p_type OR rc."WebSpaceTypeAbbrev" = p_type)
      AND rc."DomainName" = p_domain
    ORDER BY rc."Priority" ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION resolve_by_type_domain(CITEXT, CITEXT) IS 'Resolves DNS by web space type and domain name';

-- ============================================================================
-- Function: Reverse Resolve (Public URL to Private)
-- ============================================================================

CREATE OR REPLACE FUNCTION reverse_resolve_url(
    p_public_url CITEXT
)
RETURNS TABLE (
    private_url CITEXT,
    short_private_url CITEXT,
    web_space_type CITEXT,
    domain_name CITEXT,
    third_party_url CITEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc."PrivateProtocolURL",
        rc."ShortPrivateURL",
        rc."WebSpaceType",
        rc."DomainName",
        rc."ThirdPartyOverrideURL"
    FROM "DNS_ResolutionCache" rc
    WHERE rc."PublicURL" = p_public_url
       OR rc."ThirdPartyOverrideURL" = p_public_url
       OR rc."PublicRelativePath" = p_public_url
    ORDER BY rc."Priority" ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION reverse_resolve_url(CITEXT) IS 'Reverse resolves a public URL to its private protocol equivalent';

-- ============================================================================
-- Function: List All DNS Entries by Type
-- ============================================================================

CREATE OR REPLACE FUNCTION list_dns_by_type(
    p_type CITEXT DEFAULT NULL
)
RETURNS TABLE (
    dns_id INTEGER,
    web_space_type CITEXT,
    domain_name CITEXT,
    private_url CITEXT,
    public_url CITEXT,
    third_party_url CITEXT,
    resolved_url CITEXT,
    priority INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rc."DNS_ID",
        rc."WebSpaceType",
        rc."DomainName",
        rc."PrivateProtocolURL",
        rc."PublicURL",
        rc."ThirdPartyOverrideURL",
        rc."ResolvedURL",
        rc."Priority"
    FROM "DNS_ResolutionCache" rc
    WHERE p_type IS NULL OR rc."WebSpaceType" = p_type OR rc."WebSpaceTypeAbbrev" = p_type
    ORDER BY rc."WebSpaceType", rc."DomainName";
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION list_dns_by_type(CITEXT) IS 'Lists all DNS entries, optionally filtered by web space type';

-- ============================================================================
-- Function: Parse Private URL
-- ============================================================================
-- Parses a private URL and extracts type and domain components

CREATE OR REPLACE FUNCTION parse_private_url(
    p_private_url CITEXT
)
RETURNS TABLE (
    protocol CITEXT,
    domain CITEXT,
    type_suffix CITEXT,
    full_domain CITEXT
) AS $$
DECLARE
    v_protocol CITEXT;
    v_rest CITEXT;
    v_domain_parts CITEXT[];
BEGIN
    -- Extract protocol (everything before ://)
    v_protocol := split_part(p_private_url, '://', 1);
    v_rest := split_part(p_private_url, '://', 2);

    -- Split the domain part by '.'
    v_domain_parts := string_to_array(v_rest, '.');

    RETURN QUERY SELECT
        v_protocol AS protocol,
        v_domain_parts[1] AS domain,
        v_domain_parts[array_length(v_domain_parts, 1)] AS type_suffix,
        v_rest AS full_domain;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION parse_private_url(CITEXT) IS 'Parses a private protocol URL into its component parts';

-- ============================================================================
-- Initial Cache Refresh
-- ============================================================================

-- Refresh the cache after initial data load
SELECT refresh_dns_cache();

-- ============================================================================
-- Example Usage
-- ============================================================================
/*
-- Resolve a private URL
SELECT * FROM resolve_private_url('inspire://home.inspire');

-- Resolve using short form
SELECT * FROM resolve_private_url('insp://home.insp');

-- Resolve by type and domain
SELECT * FROM resolve_by_type_domain('webspace', 'jubileeverse');

-- Reverse resolve
SELECT * FROM reverse_resolve_url('https://www.jubileeverse.com');

-- List all DNS entries
SELECT * FROM list_dns_by_type();

-- List DNS entries by type
SELECT * FROM list_dns_by_type('webspace');

-- Parse a private URL
SELECT * FROM parse_private_url('inspire://home.inspire');
*/
