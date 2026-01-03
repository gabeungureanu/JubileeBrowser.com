-- ============================================================================
-- World Wide Bible Web - Table Creation Script
-- ============================================================================
-- This script creates the WebSpaceTypes and DNS tables.
-- Run this script after connecting to the WorldWideBibleWeb database.
-- ============================================================================

-- ============================================================================
-- Table: WebSpaceTypes
-- ============================================================================
-- Catalogs the different types of web spaces used in the WWBW network.
-- Examples: .inspire, .church, .prophet, .apostle, .webspace
-- ============================================================================

CREATE TABLE IF NOT EXISTS "WebSpaceTypes" (
    -- Primary Key: Unique identifier for each web space type
    "Type_ID" SERIAL PRIMARY KEY,

    -- Full type name (e.g., 'inspire', 'church', 'prophet', 'apostle', 'webspace')
    -- Uses CITEXT for case-insensitive storage and comparison
    "FullTypeName" CITEXT NOT NULL UNIQUE,

    -- Optional abbreviated form (exactly 4 characters if defined)
    -- Examples: 'insp' for 'inspire', 'apos' for 'apostle'
    "AbbreviatedName" CHAR(4) NULL,

    -- Description of this web space type
    "Description" TEXT NULL,

    -- Whether this type is currently active
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraint: If abbreviated name is provided, it must be exactly 4 characters
    CONSTRAINT "CHK_AbbreviatedName_Length"
        CHECK ("AbbreviatedName" IS NULL OR LENGTH(TRIM("AbbreviatedName")) = 4)
);

-- Add table comment
COMMENT ON TABLE "WebSpaceTypes" IS 'Catalogs the different types of web spaces in the World Wide Bible Web network';
COMMENT ON COLUMN "WebSpaceTypes"."Type_ID" IS 'Unique identifier for each web space type';
COMMENT ON COLUMN "WebSpaceTypes"."FullTypeName" IS 'Full type name (e.g., inspire, church, prophet, apostle)';
COMMENT ON COLUMN "WebSpaceTypes"."AbbreviatedName" IS 'Optional 4-character abbreviation for URL shortening';
COMMENT ON COLUMN "WebSpaceTypes"."Description" IS 'Description of this web space type';
COMMENT ON COLUMN "WebSpaceTypes"."IsActive" IS 'Whether this type is currently active';

-- ============================================================================
-- Table: DNS
-- ============================================================================
-- Tracks all domain and web space entries within the private internet
-- environment of the Jubilee platform. Maps private protocol addresses
-- to public URL equivalents.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "DNS" (
    -- Primary Key: Unique identifier for each DNS record
    "DNS_ID" SERIAL PRIMARY KEY,

    -- Foreign Key: Reference to the web space type
    "Type_ID" INTEGER NOT NULL,

    -- Domain name within the web space (e.g., 'home', 'jubileeverse', 'trumplicated')
    -- Uses CITEXT for case-insensitive storage and comparison
    "DomainName" CITEXT NOT NULL,

    -- Private virtual URL/protocol address
    -- Format: {type}://{domain}.{type}
    -- Example: inspire://home.inspire
    -- Stored as CITEXT for case-insensitive lookups
    "PrivateProtocolURL" CITEXT NOT NULL UNIQUE,

    -- Relative path on the public server
    -- Example: /inspire/home/
    "PublicRelativePath" CITEXT NOT NULL,

    -- Full public internet URL equivalent (required)
    -- Example: https://www.worldwidebibleweb.com/inspire/home/
    "PublicURL" CITEXT NOT NULL,

    -- Optional third-level domain override/mapping
    -- May point to an additional URL hosted under a different domain
    -- Example: https://www.jubileeverse.com/
    "ThirdPartyOverrideURL" CITEXT NULL,

    -- Whether this DNS record is currently active
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- Priority for resolution (lower = higher priority)
    "Priority" INTEGER NOT NULL DEFAULT 100,

    -- Optional description or notes
    "Description" TEXT NULL,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign Key Constraint
    CONSTRAINT "FK_DNS_WebSpaceTypes"
        FOREIGN KEY ("Type_ID")
        REFERENCES "WebSpaceTypes" ("Type_ID")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Unique constraint: Combination of type and domain must be unique
    CONSTRAINT "UQ_DNS_Type_Domain"
        UNIQUE ("Type_ID", "DomainName"),

    -- Unique constraint: Public relative path must be unique
    CONSTRAINT "UQ_DNS_PublicRelativePath"
        UNIQUE ("PublicRelativePath")
);

-- Add table comments
COMMENT ON TABLE "DNS" IS 'DNS resolution table mapping private protocol addresses to public URL equivalents';
COMMENT ON COLUMN "DNS"."DNS_ID" IS 'Unique identifier for each DNS record';
COMMENT ON COLUMN "DNS"."Type_ID" IS 'Reference to the web space type';
COMMENT ON COLUMN "DNS"."DomainName" IS 'Domain name within the web space';
COMMENT ON COLUMN "DNS"."PrivateProtocolURL" IS 'Private virtual URL (e.g., inspire://home.inspire)';
COMMENT ON COLUMN "DNS"."PublicRelativePath" IS 'Relative path on public server (e.g., /inspire/home/)';
COMMENT ON COLUMN "DNS"."PublicURL" IS 'Full public internet URL equivalent';
COMMENT ON COLUMN "DNS"."ThirdPartyOverrideURL" IS 'Optional third-party domain override URL';
COMMENT ON COLUMN "DNS"."IsActive" IS 'Whether this DNS record is active';
COMMENT ON COLUMN "DNS"."Priority" IS 'Resolution priority (lower = higher priority)';

-- ============================================================================
-- Trigger: Auto-update UpdatedAt timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_webspacetypes_updated_at
    BEFORE UPDATE ON "WebSpaceTypes"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dns_updated_at
    BEFORE UPDATE ON "DNS"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Trigger: Auto-generate PrivateProtocolURL
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_private_protocol_url()
RETURNS TRIGGER AS $$
DECLARE
    type_name CITEXT;
BEGIN
    -- Get the type name
    SELECT "FullTypeName" INTO type_name
    FROM "WebSpaceTypes"
    WHERE "Type_ID" = NEW."Type_ID";

    -- Generate the private protocol URL if not provided
    IF NEW."PrivateProtocolURL" IS NULL OR NEW."PrivateProtocolURL" = '' THEN
        NEW."PrivateProtocolURL" = type_name || '://' || NEW."DomainName" || '.' || type_name;
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER generate_dns_private_url
    BEFORE INSERT OR UPDATE ON "DNS"
    FOR EACH ROW
    EXECUTE FUNCTION generate_private_protocol_url();
