@echo off
set PGPASSWORD=askShaddai4e!
echo === Cleaning up existing email tables ===
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -f "c:\Data\JubileeBrowser.com\database\010_email_events_cleanup.sql"
echo.
echo === Running email migration ===
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -f "c:\Data\JubileeBrowser.com\database\010_email_events.sql"
echo.
echo === Verifying email tables ===
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'Email%' ORDER BY tablename;"
echo.
echo === Checking row counts ===
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -c "SELECT 'EmailTemplates' as tbl, COUNT(*) as cnt FROM \"EmailTemplates\" UNION ALL SELECT 'EmailDomains', COUNT(*) FROM \"EmailDomains\";"
