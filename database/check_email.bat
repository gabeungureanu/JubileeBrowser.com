@echo off
set PGPASSWORD=askShaddai4e!
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'Email%%' ORDER BY table_name;"
