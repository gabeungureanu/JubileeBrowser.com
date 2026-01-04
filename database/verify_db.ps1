$env:PGPASSWORD = 'askShaddai4e!'
$psqlPath = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$dbName = 'worldwidebibleweb'

Write-Host "=========================================="
Write-Host "WorldWideBibleWeb Database Verification"
Write-Host "=========================================="
Write-Host ""

Write-Host "1. Testing resolver function with inspire://home.inspire:"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT * FROM resolve_private_url('inspire://home.inspire');"

Write-Host ""
Write-Host "2. Testing resolver function with webspace://jubileeverse.webspace:"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT * FROM resolve_private_url('webspace://jubileeverse.webspace');"

Write-Host ""
Write-Host "3. Listing all DNS entries:"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT * FROM list_dns_by_type();"

Write-Host ""
Write-Host "4. Checking installed extensions:"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT extname, extversion FROM pg_extension;"

Write-Host ""
Write-Host "5. Listing all tables:"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "\dt"

Write-Host ""
Write-Host "6. Listing all functions:"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "\df"

Write-Host ""
Write-Host "=========================================="
Write-Host "Verification Complete!"
Write-Host "=========================================="
