-- ============================================================================
-- World Wide Bible Web - Master Installation Script
-- ============================================================================
-- This script runs all database setup scripts in the correct order.
--
-- USAGE:
--   1. First run 001_create_database.sql as PostgreSQL superuser to create the DB
--   2. Then connect to WorldWideBibleWeb database and run this script:
--      psql -U postgres -d WorldWideBibleWeb -f 000_run_all.sql
--
-- Or run each script individually in order:
--   psql -U postgres -f 001_create_database.sql
--   psql -U postgres -d WorldWideBibleWeb -f 002_create_tables.sql
--   psql -U postgres -d WorldWideBibleWeb -f 003_create_indexes.sql
--   psql -U postgres -d WorldWideBibleWeb -f 004_seed_data.sql
--   psql -U postgres -d WorldWideBibleWeb -f 005_resolver_functions.sql
-- ============================================================================

\echo '=============================================='
\echo 'World Wide Bible Web Database Installation'
\echo '=============================================='
\echo ''

\echo 'Step 1: Creating tables...'
\i 002_create_tables.sql
\echo 'Tables created successfully.'
\echo ''

\echo 'Step 2: Creating indexes...'
\i 003_create_indexes.sql
\echo 'Indexes created successfully.'
\echo ''

\echo 'Step 3: Seeding initial data...'
\i 004_seed_data.sql
\echo 'Initial data seeded successfully.'
\echo ''

\echo 'Step 4: Creating resolver functions and cache...'
\i 005_resolver_functions.sql
\echo 'Resolver functions created successfully.'
\echo ''

\echo 'Step 5: Creating hit count analytics tables...'
\i 006_hitcount_analytics.sql
\echo 'Hit count analytics created successfully.'
\echo ''

\echo '=============================================='
\echo 'Installation Complete!'
\echo '=============================================='
\echo ''
\echo 'Testing resolution functions...'
\echo ''

-- Test the resolver
\echo 'Test 1: Resolve inspire://home.inspire'
SELECT * FROM resolve_private_url('inspire://home.inspire');

\echo ''
\echo 'Test 2: Resolve webspace://jubileeverse.webspace'
SELECT * FROM resolve_private_url('webspace://jubileeverse.webspace');

\echo ''
\echo 'Test 3: List all DNS entries'
SELECT * FROM list_dns_by_type();

\echo ''
\echo 'All tests completed successfully!'
