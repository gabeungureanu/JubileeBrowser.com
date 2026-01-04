@echo off
set PGPASSWORD=askShaddai4e!
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -f "c:\Data\JubileeBrowser.com\database\verify_email.sql"
