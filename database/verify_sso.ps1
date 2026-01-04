$env:PGPASSWORD = 'askShaddai4e!'
$psqlPath = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$dbName = 'worldwidebibleweb'

Write-Host "=========================================="
Write-Host "SSO System Verification"
Write-Host "=========================================="
Write-Host ""

Write-Host "1. User Roles:"
$query = @"
SELECT "RoleName", "DisplayName", "HierarchyLevel" FROM "UserRoles" ORDER BY "HierarchyLevel";
"@
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c $query

Write-Host ""
Write-Host "2. Admin User:"
$query = @"
SELECT "Username", "Email", "IsActive", "IsEmailVerified" FROM "Users" WHERE "Username" = 'admin';
"@
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c $query

Write-Host ""
Write-Host "3. Permissions by Category:"
$query = @"
SELECT "ResourceCategory", COUNT(*) as count FROM "RolePermissions" GROUP BY "ResourceCategory" ORDER BY "ResourceCategory";
"@
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c $query

Write-Host ""
Write-Host "4. Admin Role Assignments:"
$query = @"
SELECT u."Username", r."RoleName" FROM "UserRoleAssignments" ura
JOIN "Users" u ON u."UserID" = ura."UserID"
JOIN "UserRoles" r ON r."RoleID" = ura."RoleID";
"@
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c $query

Write-Host ""
Write-Host "5. Total SSO Tables Created:"
$query = @"
SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Users', 'UserRoles', 'UserRoleAssignments', 'RefreshTokens', 'RolePermissions', 'RolePermissionAssignments', 'OAuthClients', 'TwoFactorTokens', 'UserAuditLogs', 'LoginRateLimits');
"@
& $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d $dbName -c $query

Write-Host ""
Write-Host "=========================================="
Write-Host "Verification Complete!"
Write-Host "=========================================="
