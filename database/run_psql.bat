@echo off
set PGPASSWORD=askShaddai4e!
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -p 5432 %*
