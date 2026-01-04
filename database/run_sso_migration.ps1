$env:PGPASSWORD = 'askShaddai4e!'
$psqlPath = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$dbName = 'worldwidebibleweb'
$dbPath = "c:\Data\JubileeBrowser.com\database"

Set-Location $dbPath

Write-Host "=========================================="
Write-Host "SSO Identity System Migration"
Write-Host "=========================================="
Write-Host ""

# Ensure pgcrypto extension exists
Write-Host "Ensuring pgcrypto extension..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

Write-Host "Step 1: Creating SSO identity tables..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "007_sso_identity.sql"

Write-Host "Step 2: Creating SSO authentication functions..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "008_sso_functions.sql"

Write-Host "Step 3: Seeding SSO roles and permissions..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -f "009_sso_seed_data.sql"

Write-Host ""
Write-Host "=========================================="
Write-Host "SSO Migration Complete!"
Write-Host "=========================================="

# Verify setup
Write-Host ""
Write-Host "Verifying SSO tables..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%User%' OR table_name LIKE '%Role%' OR table_name LIKE '%Token%' OR table_name LIKE '%OAuth%' OR table_name LIKE '%Audit%' ORDER BY table_name;"

Write-Host ""
Write-Host "Verifying SSO roles..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT `"RoleName`", `"DisplayName`", `"HierarchyLevel`" FROM `"UserRoles`" ORDER BY `"HierarchyLevel`";"

Write-Host ""
Write-Host "Verifying admin user..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT `"Username`", `"Email`", `"IsActive`", `"IsEmailVerified`" FROM `"Users`" WHERE `"Username`" = 'admin';"

Write-Host ""
Write-Host "Verifying permissions by category..."
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT `"ResourceCategory`", COUNT(*) as permission_count FROM `"RolePermissions`" GROUP BY `"ResourceCategory`" ORDER BY `"ResourceCategory`";"

Write-Host ""
Write-Host "=========================================="
Write-Host "IMPORTANT: Default admin credentials"
Write-Host "=========================================="
Write-Host "Username: admin"
Write-Host "Password: JubileeAdmin2024!"
Write-Host ""
Write-Host "CHANGE THIS PASSWORD IMMEDIATELY!"
Write-Host "=========================================="
