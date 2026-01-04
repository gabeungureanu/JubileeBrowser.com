$env:PGPASSWORD = 'askShaddai4e!'
$psqlPath = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$dbName = 'worldwidebibleweb'

# List existing databases
Write-Host "Checking existing databases..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -c "SELECT datname FROM pg_database;"

# Drop if exists and recreate to ensure clean state
Write-Host "`nDropping existing worldwidebibleweb database if exists..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -c "DROP DATABASE IF EXISTS worldwidebibleweb;"

Write-Host "Creating database worldwidebibleweb..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -c "CREATE DATABASE worldwidebibleweb WITH OWNER = postgres ENCODING = 'UTF8' CONNECTION LIMIT = -1;"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -c "COMMENT ON DATABASE worldwidebibleweb IS 'World Wide Bible Web - Private Internet DNS Resolution System for the Jubilee Platform';"

# Connect to the database and create extensions
Write-Host "Setting up extensions..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "CREATE EXTENSION IF NOT EXISTS `"uuid-ossp`";"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "CREATE EXTENSION IF NOT EXISTS citext;"
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

Write-Host "Extensions created successfully"

# Run migration scripts
$dbPath = "c:\Data\JubileeBrowser.com\database"
Set-Location $dbPath

Write-Host "`nRunning migration scripts..."

Write-Host "Step 1: Creating tables..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "002_create_tables.sql"

Write-Host "Step 2: Creating indexes..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "003_create_indexes.sql"

Write-Host "Step 3: Seeding initial data..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "004_seed_data.sql"

Write-Host "Step 4: Creating resolver functions..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "005_resolver_functions.sql"

Write-Host "Step 5: Creating hit count analytics..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "006_hitcount_analytics.sql"

Write-Host "Step 6: Creating SSO identity tables..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "007_sso_identity.sql"

Write-Host "Step 7: Creating SSO authentication functions..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "008_sso_functions.sql"

Write-Host "Step 8: Seeding SSO roles and permissions..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "009_sso_seed_data.sql"

Write-Host "`n=========================================="
Write-Host "Database setup complete!"
Write-Host "=========================================="

# Verify setup
Write-Host "`nVerifying DNS setup..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT * FROM list_dns_by_type();"

Write-Host "`nVerifying SSO roles..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT `"RoleName`", `"DisplayName`", `"HierarchyLevel`" FROM `"UserRoles`" ORDER BY `"HierarchyLevel`";"

Write-Host "`nVerifying admin user..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT `"Username`", `"Email`", `"IsActive`" FROM `"Users`" WHERE `"Username`" = 'admin';"

Write-Host "`nVerifying permissions count..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT `"ResourceCategory`", COUNT(*) as count FROM `"RolePermissions`" GROUP BY `"ResourceCategory`" ORDER BY `"ResourceCategory`";"

Write-Host "`nDone!"
