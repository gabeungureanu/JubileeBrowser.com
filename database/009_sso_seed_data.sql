-- ============================================================================
-- World Wide Bible Web - SSO Seed Data
-- ============================================================================
-- Seeds default roles, permissions, and initial admin account.
-- ============================================================================

-- ============================================================================
-- Default Roles
-- ============================================================================

INSERT INTO "UserRoles" ("RoleName", "DisplayName", "Description", "HierarchyLevel", "IsSystemRole")
VALUES
    ('superadmin', 'Super Administrator', 'Full system access with ability to manage all aspects of the platform', 1, TRUE),
    ('admin', 'Administrator', 'Administrative access to manage users, roles, and system settings', 10, TRUE),
    ('wwbw_builder', 'WWBW Builder', 'Can create and manage web spaces in the World Wide Bible Web', 50, FALSE),
    ('dns_manager', 'DNS Manager', 'Can manage DNS records and domain mappings', 50, FALSE),
    ('content_moderator', 'Content Moderator', 'Can review and moderate content across the platform', 60, FALSE),
    ('developer', 'Developer', 'Access to development tools and API documentation', 70, FALSE),
    ('member', 'Member', 'Standard authenticated user with basic access', 100, TRUE),
    ('guest', 'Guest', 'Limited read-only access for unauthenticated interactions', 200, TRUE)
ON CONFLICT ("RoleName") DO NOTHING;

-- ============================================================================
-- Default Permissions
-- ============================================================================

-- User Management Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('users:read', 'View Users', 'Can view user profiles and listings', 'Users'),
    ('users:create', 'Create Users', 'Can create new user accounts', 'Users'),
    ('users:update', 'Update Users', 'Can update user profiles and settings', 'Users'),
    ('users:delete', 'Delete Users', 'Can delete or deactivate user accounts', 'Users'),
    ('users:manage_roles', 'Manage User Roles', 'Can assign and revoke roles from users', 'Users')
ON CONFLICT ("PermissionName") DO NOTHING;

-- Role Management Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('roles:read', 'View Roles', 'Can view role definitions and assignments', 'Roles'),
    ('roles:create', 'Create Roles', 'Can create new role definitions', 'Roles'),
    ('roles:update', 'Update Roles', 'Can modify existing role definitions', 'Roles'),
    ('roles:delete', 'Delete Roles', 'Can delete role definitions', 'Roles'),
    ('roles:manage_permissions', 'Manage Role Permissions', 'Can assign permissions to roles', 'Roles')
ON CONFLICT ("PermissionName") DO NOTHING;

-- DNS Management Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('dns:read', 'View DNS Records', 'Can view DNS records and mappings', 'DNS'),
    ('dns:create', 'Create DNS Records', 'Can create new DNS records', 'DNS'),
    ('dns:update', 'Update DNS Records', 'Can modify existing DNS records', 'DNS'),
    ('dns:delete', 'Delete DNS Records', 'Can delete DNS records', 'DNS')
ON CONFLICT ("PermissionName") DO NOTHING;

-- WebSpace Management Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('webspace:read', 'View Web Spaces', 'Can view web space listings and details', 'WebSpace'),
    ('webspace:create', 'Create Web Spaces', 'Can create new web spaces', 'WebSpace'),
    ('webspace:update', 'Update Web Spaces', 'Can modify existing web spaces', 'WebSpace'),
    ('webspace:delete', 'Delete Web Spaces', 'Can delete web spaces', 'WebSpace'),
    ('webspace:manage_types', 'Manage Web Space Types', 'Can create and modify web space type definitions', 'WebSpace')
ON CONFLICT ("PermissionName") DO NOTHING;

-- Content Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('content:read', 'View Content', 'Can view content across the platform', 'Content'),
    ('content:create', 'Create Content', 'Can create new content', 'Content'),
    ('content:update', 'Update Content', 'Can modify existing content', 'Content'),
    ('content:delete', 'Delete Content', 'Can delete content', 'Content'),
    ('content:moderate', 'Moderate Content', 'Can approve, reject, or flag content', 'Content'),
    ('content:publish', 'Publish Content', 'Can publish content to production', 'Content')
ON CONFLICT ("PermissionName") DO NOTHING;

-- System Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('system:settings', 'Manage System Settings', 'Can modify system-wide configuration settings', 'System'),
    ('system:audit_logs', 'View Audit Logs', 'Can view security and audit logs', 'System'),
    ('system:maintenance', 'System Maintenance', 'Can perform system maintenance operations', 'System'),
    ('system:oauth_clients', 'Manage OAuth Clients', 'Can create and manage OAuth client applications', 'System')
ON CONFLICT ("PermissionName") DO NOTHING;

-- API Permissions
INSERT INTO "RolePermissions" ("PermissionName", "DisplayName", "Description", "ResourceCategory")
VALUES
    ('api:access', 'API Access', 'Can access the REST API', 'API'),
    ('api:admin', 'API Admin Access', 'Can access administrative API endpoints', 'API')
ON CONFLICT ("PermissionName") DO NOTHING;

-- ============================================================================
-- Assign Permissions to Roles
-- ============================================================================

-- Super Admin gets ALL permissions
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'superadmin'
ON CONFLICT DO NOTHING;

-- Admin gets most permissions except system maintenance
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'admin'
  AND p."PermissionName" NOT IN ('system:maintenance')
ON CONFLICT DO NOTHING;

-- WWBW Builder permissions
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'wwbw_builder'
  AND p."PermissionName" IN (
    'webspace:read', 'webspace:create', 'webspace:update',
    'content:read', 'content:create', 'content:update', 'content:publish',
    'dns:read',
    'api:access'
  )
ON CONFLICT DO NOTHING;

-- DNS Manager permissions
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'dns_manager'
  AND p."PermissionName" IN (
    'dns:read', 'dns:create', 'dns:update', 'dns:delete',
    'webspace:read',
    'api:access'
  )
ON CONFLICT DO NOTHING;

-- Content Moderator permissions
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'content_moderator'
  AND p."PermissionName" IN (
    'content:read', 'content:moderate',
    'webspace:read',
    'users:read',
    'api:access'
  )
ON CONFLICT DO NOTHING;

-- Developer permissions
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'developer'
  AND p."PermissionName" IN (
    'webspace:read',
    'dns:read',
    'content:read',
    'api:access'
  )
ON CONFLICT DO NOTHING;

-- Member (standard user) permissions
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'member'
  AND p."PermissionName" IN (
    'webspace:read',
    'content:read',
    'api:access'
  )
ON CONFLICT DO NOTHING;

-- Guest permissions (read-only)
INSERT INTO "RolePermissionAssignments" ("RoleID", "PermissionID")
SELECT r."RoleID", p."PermissionID"
FROM "UserRoles" r
CROSS JOIN "RolePermissions" p
WHERE r."RoleName" = 'guest'
  AND p."PermissionName" IN (
    'webspace:read',
    'content:read'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Create Initial Admin Account
-- ============================================================================
-- Creates a default admin user. IMPORTANT: Change this password immediately!
-- Default credentials: admin / JubileeAdmin2024!
-- ============================================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_superadmin_role_id UUID;
BEGIN
    -- Create admin user if not exists
    IF NOT EXISTS (SELECT 1 FROM "Users" WHERE "Username" = 'admin') THEN
        v_admin_id := sso_create_user(
            'admin',
            'admin@jubileebrowser.com',
            'JubileeAdmin2024!',
            'System Administrator'
        );

        -- Mark email as verified for admin
        UPDATE "Users"
        SET "IsEmailVerified" = TRUE,
            "RequirePasswordChange" = TRUE  -- Force password change on first login
        WHERE "UserID" = v_admin_id;

        -- Assign superadmin role
        SELECT "RoleID" INTO v_superadmin_role_id
        FROM "UserRoles"
        WHERE "RoleName" = 'superadmin';

        IF v_superadmin_role_id IS NOT NULL THEN
            PERFORM sso_assign_role(v_admin_id, v_superadmin_role_id);
        END IF;

        RAISE NOTICE 'Admin account created with ID: %', v_admin_id;
        RAISE NOTICE 'IMPORTANT: Change the default password immediately!';
    END IF;
END $$;

-- ============================================================================
-- Create Default OAuth Client for Jubilee Browser
-- ============================================================================

INSERT INTO "OAuthClients" (
    "ClientName",
    "ClientSecretHash",
    "ClientType",
    "RedirectURIs",
    "AllowedGrantTypes",
    "AllowedScopes",
    "AccessTokenLifetime",
    "RefreshTokenLifetime"
)
VALUES (
    'Jubilee Browser',
    crypt('jubilee-browser-secret-2024', gen_salt('bf', 12)),
    'confidential',
    '["jubilee://callback", "https://jubileebrowser.com/oauth/callback"]',
    '["authorization_code", "refresh_token", "client_credentials"]',
    '["openid", "profile", "email", "offline_access", "wwbw:read", "wwbw:write"]',
    900,      -- 15 minute access tokens
    2592000   -- 30 day refresh tokens
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Summary Views
-- ============================================================================

-- View: Active user sessions (by refresh tokens)
CREATE OR REPLACE VIEW "vw_ActiveUserSessions" AS
SELECT
    u."UserID",
    u."Username",
    u."Email",
    rt."TokenID",
    rt."IssuedAt",
    rt."ExpiresAt",
    rt."IPAddress",
    rt."UserAgent"
FROM "Users" u
JOIN "RefreshTokens" rt ON rt."UserID" = u."UserID"
WHERE rt."IsRevoked" = FALSE
  AND rt."ExpiresAt" > CURRENT_TIMESTAMP
ORDER BY rt."IssuedAt" DESC;

-- View: User roles summary
CREATE OR REPLACE VIEW "vw_UserRolesSummary" AS
SELECT
    u."UserID",
    u."Username",
    u."Email",
    u."IsActive",
    jsonb_agg(
        jsonb_build_object(
            'roleId', r."RoleID",
            'roleName', r."RoleName",
            'displayName', r."DisplayName",
            'validUntil', ura."ValidUntil"
        )
    ) AS roles
FROM "Users" u
LEFT JOIN "UserRoleAssignments" ura ON ura."UserID" = u."UserID"
LEFT JOIN "UserRoles" r ON r."RoleID" = ura."RoleID" AND r."IsActive" = TRUE
WHERE ura."ValidUntil" IS NULL OR ura."ValidUntil" > CURRENT_TIMESTAMP
GROUP BY u."UserID", u."Username", u."Email", u."IsActive";

-- View: Recent security events
CREATE OR REPLACE VIEW "vw_RecentSecurityEvents" AS
SELECT
    ual."LogID",
    ual."UserID",
    u."Username",
    ual."EventType",
    ual."EventCategory",
    ual."Description",
    ual."Outcome",
    ual."IPAddress",
    ual."OccurredAt"
FROM "UserAuditLogs" ual
LEFT JOIN "Users" u ON u."UserID" = ual."UserID"
WHERE ual."EventCategory" IN ('auth', 'security')
ORDER BY ual."OccurredAt" DESC
LIMIT 1000;

-- ============================================================================
-- End of SSO Seed Data
-- ============================================================================
