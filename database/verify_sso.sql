-- SSO System Verification Queries
\echo '=========================================='
\echo 'SSO System Verification'
\echo '=========================================='
\echo ''

\echo '1. User Roles:'
SELECT "RoleName", "DisplayName", "HierarchyLevel" FROM "UserRoles" ORDER BY "HierarchyLevel";

\echo ''
\echo '2. Admin User:'
SELECT "Username", "Email", "IsActive", "IsEmailVerified" FROM "Users" WHERE "Username" = 'admin';

\echo ''
\echo '3. Permissions by Category:'
SELECT "ResourceCategory", COUNT(*) as count FROM "RolePermissions" GROUP BY "ResourceCategory" ORDER BY "ResourceCategory";

\echo ''
\echo '4. Admin Role Assignments:'
SELECT u."Username", r."RoleName" FROM "UserRoleAssignments" ura
JOIN "Users" u ON u."UserID" = ura."UserID"
JOIN "UserRoles" r ON r."RoleID" = ura."RoleID";

\echo ''
\echo '5. SSO Functions Created:'
SELECT proname as function_name FROM pg_proc WHERE proname LIKE 'sso_%' ORDER BY proname;

\echo ''
\echo '6. Audit Log Entry (account creation):'
SELECT "EventType", "EventCategory", "Description", "Outcome" FROM "UserAuditLogs" LIMIT 5;

\echo ''
\echo '=========================================='
\echo 'Verification Complete!'
\echo '=========================================='
