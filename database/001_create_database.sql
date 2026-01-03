-- ============================================================================
-- World Wide Bible Web - Database Creation Script
-- ============================================================================
-- This script creates the WorldWideBibleWeb database.
-- Run this script as a PostgreSQL superuser (e.g., postgres).
-- ============================================================================

-- Create the database
CREATE DATABASE "WorldWideBibleWeb"
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Add database comment
COMMENT ON DATABASE "WorldWideBibleWeb" IS 'World Wide Bible Web - Private Internet DNS Resolution System for the Jubilee Platform';

-- Connect to the new database
\c WorldWideBibleWeb

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "citext";         -- For case-insensitive text fields
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- For trigram-based similarity searches
