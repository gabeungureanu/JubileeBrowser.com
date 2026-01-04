-- ============================================================================
-- World Wide Bible Web - Single Sign-On (SSO) Identity System
-- ============================================================================
-- This script creates the complete SSO identity and access management platform
-- for the Jubilee ecosystem. Implements OAuth2-compliant authentication with
-- role-based access control (RBAC).
-- ============================================================================
-- Version: 1.0.0
-- Created: 2024
-- ============================================================================

-- ============================================================================
-- EXTENSION: pgcrypto for secure hashing and UUID generation
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Table: Users
-- ============================================================================
-- Primary user account storage with secure password hashing.
-- Passwords are stored using pgcrypto's crypt() with Blowfish (bf) algorithm,
-- which is compatible with bcrypt.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Users" (
    -- Primary Key: UUID for distributed system compatibility
    "UserID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Username: Case-insensitive, unique identifier for login
    -- Stored as CITEXT for consistent case-insensitive lookups
    "Username" CITEXT NOT NULL,

    -- Email: Case-insensitive, unique, used for account recovery
    "Email" CITEXT NOT NULL,

    -- PasswordHash: Bcrypt-hashed password (never store plain text)
    -- Uses pgcrypto crypt() with gen_salt('bf', 12) for 12-round bcrypt
    "PasswordHash" TEXT NOT NULL,

    -- Display name for UI purposes
    "DisplayName" VARCHAR(255) NULL,

    -- Profile image URL (optional)
    "ProfileImageURL" TEXT NULL,

    -- Account status
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- Email verification status
    "IsEmailVerified" BOOLEAN NOT NULL DEFAULT FALSE,

    -- Account lockout for brute-force protection
    "IsLocked" BOOLEAN NOT NULL DEFAULT FALSE,
    "LockoutEndTime" TIMESTAMP WITH TIME ZONE NULL,
    "FailedLoginAttempts" INTEGER NOT NULL DEFAULT 0,

    -- Last activity tracking
    "LastLoginAt" TIMESTAMP WITH TIME ZONE NULL,
    "LastLoginIP" INET NULL,

    -- Password management
    "PasswordChangedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "RequirePasswordChange" BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" UUID NULL,

    -- Constraints
    CONSTRAINT "UQ_Users_Username" UNIQUE ("Username"),
    CONSTRAINT "UQ_Users_Email" UNIQUE ("Email"),
    CONSTRAINT "CHK_Users_Username_Length" CHECK (LENGTH("Username") >= 3 AND LENGTH("Username") <= 50),
    CONSTRAINT "CHK_Users_Email_Format" CHECK ("Email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Table comments
COMMENT ON TABLE "Users" IS 'Central user account storage for Jubilee SSO system';
COMMENT ON COLUMN "Users"."UserID" IS 'Unique UUID identifier for distributed compatibility';
COMMENT ON COLUMN "Users"."Username" IS 'Case-insensitive unique username for login';
COMMENT ON COLUMN "Users"."Email" IS 'Case-insensitive unique email for account recovery';
COMMENT ON COLUMN "Users"."PasswordHash" IS 'Bcrypt-hashed password (12 rounds)';
COMMENT ON COLUMN "Users"."IsLocked" IS 'Account locked due to failed login attempts';
COMMENT ON COLUMN "Users"."FailedLoginAttempts" IS 'Counter for brute-force protection';

-- ============================================================================
-- Table: UserRoles
-- ============================================================================
-- Defines platform-wide roles for RBAC.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserRoles" (
    -- Primary Key
    "RoleID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Role name: unique, case-insensitive
    "RoleName" CITEXT NOT NULL,

    -- Display name for UI
    "DisplayName" VARCHAR(100) NOT NULL,

    -- Role description
    "Description" TEXT NULL,

    -- Role hierarchy level (lower = more privileged)
    "HierarchyLevel" INTEGER NOT NULL DEFAULT 100,

    -- Whether this is a system role (cannot be deleted)
    "IsSystemRole" BOOLEAN NOT NULL DEFAULT FALSE,

    -- Whether this role is active
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "UQ_UserRoles_RoleName" UNIQUE ("RoleName")
);

COMMENT ON TABLE "UserRoles" IS 'Platform-wide role definitions for RBAC';
COMMENT ON COLUMN "UserRoles"."HierarchyLevel" IS 'Role hierarchy (1=SuperAdmin, 10=Admin, 50=Moderator, 100=User)';

-- ============================================================================
-- Table: RolePermissions
-- ============================================================================
-- Defines granular permissions that can be assigned to roles.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "RolePermissions" (
    -- Primary Key
    "PermissionID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Permission identifier (e.g., 'dns:create', 'webspace:manage')
    "PermissionName" CITEXT NOT NULL,

    -- Human-readable display name
    "DisplayName" VARCHAR(100) NOT NULL,

    -- Description of what this permission grants
    "Description" TEXT NULL,

    -- Resource category (e.g., 'DNS', 'WebSpace', 'Users')
    "ResourceCategory" CITEXT NOT NULL,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "UQ_RolePermissions_PermissionName" UNIQUE ("PermissionName")
);

COMMENT ON TABLE "RolePermissions" IS 'Granular permission definitions for fine-grained access control';

-- ============================================================================
-- Table: RolePermissionAssignments
-- ============================================================================
-- Links roles to their granted permissions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "RolePermissionAssignments" (
    -- Composite primary key
    "RoleID" UUID NOT NULL,
    "PermissionID" UUID NOT NULL,

    -- Audit fields
    "AssignedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "AssignedBy" UUID NULL,

    -- Primary key
    PRIMARY KEY ("RoleID", "PermissionID"),

    -- Foreign keys
    CONSTRAINT "FK_RolePermAssign_Role"
        FOREIGN KEY ("RoleID") REFERENCES "UserRoles" ("RoleID") ON DELETE CASCADE,
    CONSTRAINT "FK_RolePermAssign_Permission"
        FOREIGN KEY ("PermissionID") REFERENCES "RolePermissions" ("PermissionID") ON DELETE CASCADE
);

COMMENT ON TABLE "RolePermissionAssignments" IS 'Maps roles to their granted permissions';

-- ============================================================================
-- Table: UserRoleAssignments
-- ============================================================================
-- Associates users with their assigned roles (many-to-many).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserRoleAssignments" (
    -- Composite primary key
    "UserID" UUID NOT NULL,
    "RoleID" UUID NOT NULL,

    -- Optional: scope the role to a specific resource
    "ResourceScope" CITEXT NULL,

    -- Validity period for temporary role assignments
    "ValidFrom" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ValidUntil" TIMESTAMP WITH TIME ZONE NULL,

    -- Audit fields
    "AssignedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "AssignedBy" UUID NULL,

    -- Primary key
    PRIMARY KEY ("UserID", "RoleID"),

    -- Foreign keys
    CONSTRAINT "FK_UserRoleAssign_User"
        FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE CASCADE,
    CONSTRAINT "FK_UserRoleAssign_Role"
        FOREIGN KEY ("RoleID") REFERENCES "UserRoles" ("RoleID") ON DELETE CASCADE
);

COMMENT ON TABLE "UserRoleAssignments" IS 'Maps users to their assigned roles';
COMMENT ON COLUMN "UserRoleAssignments"."ResourceScope" IS 'Optional: limits role to specific resource (e.g., webspace ID)';
COMMENT ON COLUMN "UserRoleAssignments"."ValidUntil" IS 'NULL means permanent assignment';

-- ============================================================================
-- Table: RefreshTokens
-- ============================================================================
-- Securely manages long-lived refresh tokens for OAuth2 compliance.
-- Tokens are hashed (never stored plain text) and individually revocable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "RefreshTokens" (
    -- Primary Key
    "TokenID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Associated user
    "UserID" UUID NOT NULL,

    -- Hashed refresh token (SHA-256 hash of the actual token)
    -- The plain token is only sent to client, never stored
    "TokenHash" TEXT NOT NULL,

    -- Token family for rotation detection
    -- All tokens in a refresh chain share the same family
    "TokenFamily" UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Token validity
    "IssuedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Revocation status
    "IsRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
    "RevokedAt" TIMESTAMP WITH TIME ZONE NULL,
    "RevokedReason" VARCHAR(255) NULL,

    -- Security metadata
    "IPAddress" INET NULL,
    "UserAgent" TEXT NULL,
    "DeviceFingerprint" TEXT NULL,

    -- For token rotation: reference to the token this replaced
    "ReplacedByTokenID" UUID NULL,

    -- Foreign keys
    CONSTRAINT "FK_RefreshTokens_User"
        FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE CASCADE,
    CONSTRAINT "FK_RefreshTokens_ReplacedBy"
        FOREIGN KEY ("ReplacedByTokenID") REFERENCES "RefreshTokens" ("TokenID") ON DELETE SET NULL
);

-- Unique constraint on token hash
CREATE UNIQUE INDEX IF NOT EXISTS "IX_RefreshTokens_TokenHash" ON "RefreshTokens" ("TokenHash");

COMMENT ON TABLE "RefreshTokens" IS 'OAuth2-compliant refresh token storage with rotation support';
COMMENT ON COLUMN "RefreshTokens"."TokenHash" IS 'SHA-256 hash of refresh token (plain token never stored)';
COMMENT ON COLUMN "RefreshTokens"."TokenFamily" IS 'Token family ID for detecting token reuse attacks';
COMMENT ON COLUMN "RefreshTokens"."ReplacedByTokenID" IS 'Points to new token after rotation';

-- ============================================================================
-- Table: OAuthClients
-- ============================================================================
-- Registered OAuth2 clients for external app integration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "OAuthClients" (
    -- Primary Key
    "ClientID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Client credentials
    "ClientName" VARCHAR(255) NOT NULL,
    "ClientSecretHash" TEXT NOT NULL,

    -- Client type (confidential or public)
    "ClientType" VARCHAR(20) NOT NULL DEFAULT 'confidential',

    -- Allowed redirect URIs (stored as JSON array)
    "RedirectURIs" JSONB NOT NULL DEFAULT '[]',

    -- Allowed grant types
    "AllowedGrantTypes" JSONB NOT NULL DEFAULT '["authorization_code", "refresh_token"]',

    -- Allowed scopes
    "AllowedScopes" JSONB NOT NULL DEFAULT '["openid", "profile", "email"]',

    -- Token lifetimes (in seconds)
    "AccessTokenLifetime" INTEGER NOT NULL DEFAULT 900,  -- 15 minutes
    "RefreshTokenLifetime" INTEGER NOT NULL DEFAULT 2592000,  -- 30 days

    -- Whether this client is active
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- Client owner
    "OwnerUserID" UUID NULL,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "CHK_OAuthClients_ClientType" CHECK ("ClientType" IN ('confidential', 'public')),

    -- Foreign keys
    CONSTRAINT "FK_OAuthClients_Owner"
        FOREIGN KEY ("OwnerUserID") REFERENCES "Users" ("UserID") ON DELETE SET NULL
);

COMMENT ON TABLE "OAuthClients" IS 'Registered OAuth2 clients for external application integration';
COMMENT ON COLUMN "OAuthClients"."ClientSecretHash" IS 'Bcrypt-hashed client secret';
COMMENT ON COLUMN "OAuthClients"."AccessTokenLifetime" IS 'Access token validity in seconds (default 15 min)';
COMMENT ON COLUMN "OAuthClients"."RefreshTokenLifetime" IS 'Refresh token validity in seconds (default 30 days)';

-- ============================================================================
-- Table: TwoFactorTokens
-- ============================================================================
-- Multi-factor authentication support.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "TwoFactorTokens" (
    -- Primary Key
    "TokenID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Associated user
    "UserID" UUID NOT NULL,

    -- 2FA type (totp, sms, email, backup_code)
    "TokenType" VARCHAR(20) NOT NULL,

    -- Encrypted secret (for TOTP) or hashed code (for backup codes)
    "SecretOrHash" TEXT NOT NULL,

    -- For TOTP: algorithm and digits
    "Algorithm" VARCHAR(10) NULL DEFAULT 'SHA1',
    "Digits" INTEGER NULL DEFAULT 6,

    -- Whether this 2FA method is verified and active
    "IsVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- For backup codes: whether this code has been used
    "IsUsed" BOOLEAN NOT NULL DEFAULT FALSE,
    "UsedAt" TIMESTAMP WITH TIME ZONE NULL,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "CHK_TwoFactor_TokenType" CHECK ("TokenType" IN ('totp', 'sms', 'email', 'backup_code')),

    -- Foreign keys
    CONSTRAINT "FK_TwoFactorTokens_User"
        FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE CASCADE
);

COMMENT ON TABLE "TwoFactorTokens" IS 'Multi-factor authentication tokens and backup codes';
COMMENT ON COLUMN "TwoFactorTokens"."SecretOrHash" IS 'Encrypted TOTP secret or hashed backup code';

-- ============================================================================
-- Table: UserAuditLogs
-- ============================================================================
-- Comprehensive audit logging for security events.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserAuditLogs" (
    -- Primary Key
    "LogID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Associated user (NULL for anonymous events)
    "UserID" UUID NULL,

    -- Event type
    "EventType" VARCHAR(50) NOT NULL,

    -- Event category for filtering
    "EventCategory" VARCHAR(30) NOT NULL,

    -- Event description
    "Description" TEXT NOT NULL,

    -- Outcome (success, failure, error)
    "Outcome" VARCHAR(20) NOT NULL DEFAULT 'success',

    -- Additional event data (JSON)
    "EventData" JSONB NULL,

    -- Request context
    "IPAddress" INET NULL,
    "UserAgent" TEXT NULL,
    "RequestID" UUID NULL,

    -- Timestamp
    "OccurredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "CHK_AuditLogs_Outcome" CHECK ("Outcome" IN ('success', 'failure', 'error')),

    -- Foreign keys (no cascade - preserve audit trail even if user deleted)
    CONSTRAINT "FK_UserAuditLogs_User"
        FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE SET NULL
);

COMMENT ON TABLE "UserAuditLogs" IS 'Comprehensive audit trail for security and compliance';
COMMENT ON COLUMN "UserAuditLogs"."EventCategory" IS 'Categories: auth, user, role, token, security';

-- ============================================================================
-- Table: LoginRateLimits
-- ============================================================================
-- Rate limiting for brute-force protection.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "LoginRateLimits" (
    -- Primary Key
    "LimitID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Rate limit key (IP address, username, or combined)
    "LimitKey" VARCHAR(255) NOT NULL,

    -- Limit type
    "LimitType" VARCHAR(20) NOT NULL,

    -- Attempt tracking
    "AttemptCount" INTEGER NOT NULL DEFAULT 1,
    "WindowStart" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "WindowEnd" TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Block status
    "IsBlocked" BOOLEAN NOT NULL DEFAULT FALSE,
    "BlockedUntil" TIMESTAMP WITH TIME ZONE NULL,

    -- Constraints
    CONSTRAINT "UQ_LoginRateLimits_Key_Type" UNIQUE ("LimitKey", "LimitType"),
    CONSTRAINT "CHK_LoginRateLimits_Type" CHECK ("LimitType" IN ('ip', 'username', 'ip_username'))
);

COMMENT ON TABLE "LoginRateLimits" IS 'Rate limiting state for brute-force protection';

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- Users indexes
CREATE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" ("Email");
CREATE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users" ("Username");
CREATE INDEX IF NOT EXISTS "IX_Users_IsActive" ON "Users" ("IsActive") WHERE "IsActive" = TRUE;
CREATE INDEX IF NOT EXISTS "IX_Users_LastLoginAt" ON "Users" ("LastLoginAt" DESC NULLS LAST);

-- Refresh tokens indexes
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_UserID" ON "RefreshTokens" ("UserID");
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_ExpiresAt" ON "RefreshTokens" ("ExpiresAt") WHERE "IsRevoked" = FALSE;
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_TokenFamily" ON "RefreshTokens" ("TokenFamily");

-- User role assignments indexes
CREATE INDEX IF NOT EXISTS "IX_UserRoleAssign_UserID" ON "UserRoleAssignments" ("UserID");
CREATE INDEX IF NOT EXISTS "IX_UserRoleAssign_RoleID" ON "UserRoleAssignments" ("RoleID");

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS "IX_UserAuditLogs_UserID" ON "UserAuditLogs" ("UserID");
CREATE INDEX IF NOT EXISTS "IX_UserAuditLogs_EventType" ON "UserAuditLogs" ("EventType");
CREATE INDEX IF NOT EXISTS "IX_UserAuditLogs_OccurredAt" ON "UserAuditLogs" ("OccurredAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_UserAuditLogs_Category_Date" ON "UserAuditLogs" ("EventCategory", "OccurredAt" DESC);

-- Two-factor tokens indexes
CREATE INDEX IF NOT EXISTS "IX_TwoFactorTokens_UserID" ON "TwoFactorTokens" ("UserID");

-- Rate limits indexes
CREATE INDEX IF NOT EXISTS "IX_LoginRateLimits_LimitKey" ON "LoginRateLimits" ("LimitKey");
CREATE INDEX IF NOT EXISTS "IX_LoginRateLimits_WindowEnd" ON "LoginRateLimits" ("WindowEnd");

-- ============================================================================
-- TRIGGERS for auto-updating timestamps
-- ============================================================================

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON "Users"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_userroles_updated_at
    BEFORE UPDATE ON "UserRoles"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauthclients_updated_at
    BEFORE UPDATE ON "OAuthClients"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- End of SSO Identity Tables
-- ============================================================================
