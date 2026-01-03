-- ============================================================================
-- World Wide Bible Web - Hit Count Analytics Tables
-- ============================================================================
-- This script creates the hit count tracking system for measuring overall
-- platform usage metrics. It tracks daily hit counts and provides views
-- for monthly and yearly aggregation.
--
-- Run this script after 005_resolver_functions.sql
-- ============================================================================

-- ============================================================================
-- Table: HitCount_Daily
-- ============================================================================
-- Stores one record per calendar day with the total number of hits/visits
-- recorded for that day. This is the single source of truth for all hit
-- count analytics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "HitCount_Daily" (
    -- Primary Key: The calendar date (no time component)
    "Date" DATE NOT NULL PRIMARY KEY,

    -- Total number of hits recorded for this day
    -- Uses BIGINT to accommodate very high traffic volumes
    "TotalHits" BIGINT NOT NULL DEFAULT 0,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraint: TotalHits must be non-negative
    CONSTRAINT "CHK_HitCount_Daily_NonNegative"
        CHECK ("TotalHits" >= 0)
);

-- Add table and column comments
COMMENT ON TABLE "HitCount_Daily" IS 'Daily hit count tracking for World Wide Bible Web platform usage metrics';
COMMENT ON COLUMN "HitCount_Daily"."Date" IS 'Calendar date (primary key) - one record per day';
COMMENT ON COLUMN "HitCount_Daily"."TotalHits" IS 'Total number of platform visits/hits recorded for this day';
COMMENT ON COLUMN "HitCount_Daily"."CreatedAt" IS 'Timestamp when this record was first created';
COMMENT ON COLUMN "HitCount_Daily"."UpdatedAt" IS 'Timestamp when this record was last updated';

-- Index on Date for fast date range queries (though Date is PK, explicit index for clarity)
CREATE INDEX IF NOT EXISTS "IX_HitCount_Daily_Date" ON "HitCount_Daily" ("Date" DESC);

-- Trigger to auto-update UpdatedAt timestamp
CREATE TRIGGER update_hitcount_daily_updated_at
    BEFORE UPDATE ON "HitCount_Daily"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- View: HitCount_Monthly
-- ============================================================================
-- Aggregates daily hit counts into monthly summaries.
-- Groups data by year and month for easy monthly reporting.
-- ============================================================================

CREATE OR REPLACE VIEW "HitCount_Monthly" AS
SELECT
    EXTRACT(YEAR FROM "Date")::INTEGER AS "Year",
    EXTRACT(MONTH FROM "Date")::INTEGER AS "Month",
    DATE_TRUNC('month', "Date")::DATE AS "MonthStart",
    SUM("TotalHits") AS "TotalHits",
    COUNT(*) AS "DaysWithData",
    MIN("Date") AS "FirstDate",
    MAX("Date") AS "LastDate"
FROM "HitCount_Daily"
GROUP BY
    EXTRACT(YEAR FROM "Date"),
    EXTRACT(MONTH FROM "Date"),
    DATE_TRUNC('month', "Date")
ORDER BY "Year" DESC, "Month" DESC;

COMMENT ON VIEW "HitCount_Monthly" IS 'Monthly aggregation of daily hit counts for analytics';

-- ============================================================================
-- View: HitCount_Yearly
-- ============================================================================
-- Aggregates daily hit counts into yearly summaries.
-- Groups data by year for annual reporting and trend analysis.
-- ============================================================================

CREATE OR REPLACE VIEW "HitCount_Yearly" AS
SELECT
    EXTRACT(YEAR FROM "Date")::INTEGER AS "Year",
    SUM("TotalHits") AS "TotalHits",
    COUNT(*) AS "DaysWithData",
    MIN("Date") AS "FirstDate",
    MAX("Date") AS "LastDate"
FROM "HitCount_Daily"
GROUP BY EXTRACT(YEAR FROM "Date")
ORDER BY "Year" DESC;

COMMENT ON VIEW "HitCount_Yearly" IS 'Yearly aggregation of daily hit counts for analytics';

-- ============================================================================
-- Function: increment_daily_hitcount
-- ============================================================================
-- Atomically increments the hit count for the current day.
-- Uses UPSERT (INSERT ON CONFLICT) for concurrency safety.
-- This ensures that concurrent requests don't cause race conditions.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_daily_hitcount(
    p_increment INTEGER DEFAULT 1
)
RETURNS TABLE (
    "Date" DATE,
    "TotalHits" BIGINT,
    "WasInserted" BOOLEAN
) AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_new_hits BIGINT;
    v_was_inserted BOOLEAN;
BEGIN
    -- Use INSERT ON CONFLICT for atomic upsert
    -- This is concurrency-safe and avoids race conditions
    INSERT INTO "HitCount_Daily" ("Date", "TotalHits")
    VALUES (v_today, p_increment)
    ON CONFLICT ("Date") DO UPDATE
    SET
        "TotalHits" = "HitCount_Daily"."TotalHits" + p_increment,
        "UpdatedAt" = CURRENT_TIMESTAMP
    RETURNING
        "HitCount_Daily"."Date",
        "HitCount_Daily"."TotalHits",
        (xmax = 0) AS was_inserted  -- xmax = 0 means it was inserted, not updated
    INTO v_today, v_new_hits, v_was_inserted;

    RETURN QUERY SELECT v_today, v_new_hits, v_was_inserted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_daily_hitcount IS 'Atomically increments the hit count for the current day. Concurrency-safe using UPSERT.';

-- ============================================================================
-- Function: get_hitcount_summary
-- ============================================================================
-- Returns a summary of hit counts for various time periods.
-- Useful for dashboards and quick analytics.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hitcount_summary()
RETURNS TABLE (
    "Today" BIGINT,
    "Yesterday" BIGINT,
    "ThisWeek" BIGINT,
    "LastWeek" BIGINT,
    "ThisMonth" BIGINT,
    "LastMonth" BIGINT,
    "ThisYear" BIGINT,
    "AllTime" BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Today
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily" WHERE "Date" = CURRENT_DATE), 0) AS "Today",

        -- Yesterday
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily" WHERE "Date" = CURRENT_DATE - INTERVAL '1 day'), 0) AS "Yesterday",

        -- This Week (Monday to Sunday)
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily"
                  WHERE "Date" >= DATE_TRUNC('week', CURRENT_DATE)), 0) AS "ThisWeek",

        -- Last Week
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily"
                  WHERE "Date" >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week'
                    AND "Date" < DATE_TRUNC('week', CURRENT_DATE)), 0) AS "LastWeek",

        -- This Month
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily"
                  WHERE "Date" >= DATE_TRUNC('month', CURRENT_DATE)), 0) AS "ThisMonth",

        -- Last Month
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily"
                  WHERE "Date" >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                    AND "Date" < DATE_TRUNC('month', CURRENT_DATE)), 0) AS "LastMonth",

        -- This Year
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily"
                  WHERE "Date" >= DATE_TRUNC('year', CURRENT_DATE)), 0) AS "ThisYear",

        -- All Time
        COALESCE((SELECT SUM("TotalHits") FROM "HitCount_Daily"), 0) AS "AllTime";
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_hitcount_summary IS 'Returns hit count summary for today, yesterday, this week, last week, this month, last month, this year, and all time.';

-- ============================================================================
-- Function: get_hitcount_range
-- ============================================================================
-- Returns daily hit counts for a specified date range.
-- Useful for charts and detailed reporting.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hitcount_range(
    p_start_date DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    "Date" DATE,
    "TotalHits" BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        hc."Date",
        hc."TotalHits"
    FROM "HitCount_Daily" hc
    WHERE hc."Date" >= p_start_date
      AND hc."Date" <= p_end_date
    ORDER BY hc."Date" ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_hitcount_range IS 'Returns daily hit counts for a specified date range.';

-- ============================================================================
-- Grant permissions (adjust as needed for your security model)
-- ============================================================================
-- Note: Uncomment and modify these grants based on your database roles

-- GRANT SELECT ON "HitCount_Daily" TO wwbw_readonly;
-- GRANT SELECT ON "HitCount_Monthly" TO wwbw_readonly;
-- GRANT SELECT ON "HitCount_Yearly" TO wwbw_readonly;
-- GRANT SELECT, INSERT, UPDATE ON "HitCount_Daily" TO wwbw_application;
-- GRANT EXECUTE ON FUNCTION increment_daily_hitcount TO wwbw_application;
-- GRANT EXECUTE ON FUNCTION get_hitcount_summary TO wwbw_readonly;
-- GRANT EXECUTE ON FUNCTION get_hitcount_range TO wwbw_readonly;

-- ============================================================================
-- End of Hit Count Analytics Script
-- ============================================================================
