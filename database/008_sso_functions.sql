-- ============================================================================
-- World Wide Bible Web - SSO Authentication Functions
-- ============================================================================
-- Stored procedures for secure authentication, token management, and
-- user operations. Implements OAuth2-compliant flows with brute-force
-- protection and comprehensive audit logging.
-- ============================================================================

-- ============================================================================
-- Function: sso_hash_password
-- ============================================================================
-- Securely hashes a password using bcrypt (12 rounds).
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_hash_password(p_password TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Use pgcrypto crypt() with blowfish (bcrypt compatible)
    -- gen_salt('bf', 12) creates a 12-round bcrypt salt
    RETURN crypt(p_password, gen_salt('bf', 12));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_hash_password IS 'Securely hashes a password using bcrypt with 12 rounds';

-- ============================================================================
-- Function: sso_verify_password
-- ============================================================================
-- Verifies a password against a stored hash.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_verify_password(p_password TEXT, p_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN crypt(p_password, p_hash) = p_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_verify_password IS 'Verifies a password against a stored bcrypt hash';

-- ============================================================================
-- Function: sso_hash_token
-- ============================================================================
-- Creates a SHA-256 hash of a token for secure storage.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_hash_token(p_token TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(p_token, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_hash_token IS 'Creates SHA-256 hash of a token for secure storage';

-- ============================================================================
-- Function: sso_create_user
-- ============================================================================
-- Creates a new user account with secure password hashing.
-- Returns the new user ID on success, NULL on failure.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_create_user(
    p_username CITEXT,
    p_email CITEXT,
    p_password TEXT,
    p_display_name VARCHAR(255) DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_password_hash TEXT;
BEGIN
    -- Validate password strength (minimum 8 characters)
    IF LENGTH(p_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters long';
    END IF;

    -- Hash the password
    v_password_hash := sso_hash_password(p_password);

    -- Insert the user
    INSERT INTO "Users" (
        "Username",
        "Email",
        "PasswordHash",
        "DisplayName",
        "CreatedBy"
    )
    VALUES (
        p_username,
        p_email,
        v_password_hash,
        COALESCE(p_display_name, p_username),
        p_created_by
    )
    RETURNING "UserID" INTO v_user_id;

    -- Log the event
    INSERT INTO "UserAuditLogs" (
        "UserID",
        "EventType",
        "EventCategory",
        "Description",
        "Outcome"
    )
    VALUES (
        v_user_id,
        'user_created',
        'user',
        'User account created: ' || p_username,
        'success'
    );

    RETURN v_user_id;

EXCEPTION
    WHEN unique_violation THEN
        -- Log failed attempt
        INSERT INTO "UserAuditLogs" (
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "EventData"
        )
        VALUES (
            'user_create_failed',
            'user',
            'Failed to create user - duplicate username or email',
            'failure',
            jsonb_build_object('username', p_username, 'email', p_email)
        );
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_create_user IS 'Creates a new user with secure password hashing';

-- ============================================================================
-- Function: sso_check_rate_limit
-- ============================================================================
-- Checks and updates rate limiting for login attempts.
-- Returns TRUE if request should be blocked.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_check_rate_limit(
    p_limit_key VARCHAR(255),
    p_limit_type VARCHAR(20),
    p_max_attempts INTEGER DEFAULT 5,
    p_window_minutes INTEGER DEFAULT 15,
    p_block_minutes INTEGER DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
    v_record RECORD;
    v_now TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
BEGIN
    -- Check for existing rate limit record
    SELECT * INTO v_record
    FROM "LoginRateLimits"
    WHERE "LimitKey" = p_limit_key AND "LimitType" = p_limit_type;

    IF v_record IS NULL THEN
        -- Create new rate limit record
        INSERT INTO "LoginRateLimits" (
            "LimitKey",
            "LimitType",
            "AttemptCount",
            "WindowStart",
            "WindowEnd"
        )
        VALUES (
            p_limit_key,
            p_limit_type,
            1,
            v_now,
            v_now + (p_window_minutes || ' minutes')::INTERVAL
        );
        RETURN FALSE;
    END IF;

    -- Check if currently blocked
    IF v_record."IsBlocked" AND v_record."BlockedUntil" > v_now THEN
        RETURN TRUE;
    END IF;

    -- Check if window has expired
    IF v_record."WindowEnd" < v_now THEN
        -- Reset the window
        UPDATE "LoginRateLimits"
        SET "AttemptCount" = 1,
            "WindowStart" = v_now,
            "WindowEnd" = v_now + (p_window_minutes || ' minutes')::INTERVAL,
            "IsBlocked" = FALSE,
            "BlockedUntil" = NULL
        WHERE "LimitKey" = p_limit_key AND "LimitType" = p_limit_type;
        RETURN FALSE;
    END IF;

    -- Increment attempt count
    UPDATE "LoginRateLimits"
    SET "AttemptCount" = "AttemptCount" + 1
    WHERE "LimitKey" = p_limit_key AND "LimitType" = p_limit_type;

    -- Check if should be blocked
    IF v_record."AttemptCount" + 1 >= p_max_attempts THEN
        UPDATE "LoginRateLimits"
        SET "IsBlocked" = TRUE,
            "BlockedUntil" = v_now + (p_block_minutes || ' minutes')::INTERVAL
        WHERE "LimitKey" = p_limit_key AND "LimitType" = p_limit_type;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_check_rate_limit IS 'Rate limiting for brute-force protection';

-- ============================================================================
-- Function: sso_reset_rate_limit
-- ============================================================================
-- Resets rate limiting after successful login.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_reset_rate_limit(
    p_limit_key VARCHAR(255),
    p_limit_type VARCHAR(20)
)
RETURNS VOID AS $$
BEGIN
    DELETE FROM "LoginRateLimits"
    WHERE "LimitKey" = p_limit_key AND "LimitType" = p_limit_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: sso_authenticate_user
-- ============================================================================
-- Authenticates a user by username/email and password.
-- Implements brute-force protection and account lockout.
-- Returns user data on success, NULL on failure.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_authenticate_user(
    p_username_or_email CITEXT,
    p_password TEXT,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
    user_id UUID,
    username CITEXT,
    email CITEXT,
    display_name VARCHAR(255),
    roles JSONB,
    requires_2fa BOOLEAN,
    require_password_change BOOLEAN
) AS $$
DECLARE
    v_user RECORD;
    v_is_rate_limited BOOLEAN;
    v_limit_key VARCHAR(255);
BEGIN
    -- Build rate limit key
    v_limit_key := COALESCE(p_ip_address::TEXT, 'unknown') || ':' || p_username_or_email;

    -- Check rate limiting
    v_is_rate_limited := sso_check_rate_limit(v_limit_key, 'ip_username', 5, 15, 30);

    IF v_is_rate_limited THEN
        -- Log blocked attempt
        INSERT INTO "UserAuditLogs" (
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress",
            "UserAgent"
        )
        VALUES (
            'login_rate_limited',
            'auth',
            'Login blocked due to rate limiting: ' || p_username_or_email,
            'failure',
            p_ip_address,
            p_user_agent
        );

        RETURN;
    END IF;

    -- Find user by username or email
    SELECT * INTO v_user
    FROM "Users"
    WHERE "Username" = p_username_or_email OR "Email" = p_username_or_email;

    IF v_user IS NULL THEN
        -- Log failed attempt (user not found)
        INSERT INTO "UserAuditLogs" (
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress",
            "UserAgent"
        )
        VALUES (
            'login_failed',
            'auth',
            'Login failed - user not found: ' || p_username_or_email,
            'failure',
            p_ip_address,
            p_user_agent
        );

        RETURN;
    END IF;

    -- Check if account is locked
    IF v_user."IsLocked" AND v_user."LockoutEndTime" > CURRENT_TIMESTAMP THEN
        INSERT INTO "UserAuditLogs" (
            "UserID",
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress",
            "UserAgent"
        )
        VALUES (
            v_user."UserID",
            'login_blocked',
            'auth',
            'Login blocked - account locked until ' || v_user."LockoutEndTime",
            'failure',
            p_ip_address,
            p_user_agent
        );

        RETURN;
    END IF;

    -- Check if account is active
    IF NOT v_user."IsActive" THEN
        INSERT INTO "UserAuditLogs" (
            "UserID",
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress",
            "UserAgent"
        )
        VALUES (
            v_user."UserID",
            'login_blocked',
            'auth',
            'Login blocked - account inactive',
            'failure',
            p_ip_address,
            p_user_agent
        );

        RETURN;
    END IF;

    -- Verify password
    IF NOT sso_verify_password(p_password, v_user."PasswordHash") THEN
        -- Increment failed login attempts
        UPDATE "Users"
        SET "FailedLoginAttempts" = "FailedLoginAttempts" + 1,
            "IsLocked" = CASE WHEN "FailedLoginAttempts" + 1 >= 5 THEN TRUE ELSE FALSE END,
            "LockoutEndTime" = CASE WHEN "FailedLoginAttempts" + 1 >= 5
                               THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                               ELSE NULL END
        WHERE "UserID" = v_user."UserID";

        INSERT INTO "UserAuditLogs" (
            "UserID",
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress",
            "UserAgent"
        )
        VALUES (
            v_user."UserID",
            'login_failed',
            'auth',
            'Login failed - invalid password',
            'failure',
            p_ip_address,
            p_user_agent
        );

        RETURN;
    END IF;

    -- Successful authentication
    -- Reset failed attempts and update last login
    UPDATE "Users"
    SET "FailedLoginAttempts" = 0,
        "IsLocked" = FALSE,
        "LockoutEndTime" = NULL,
        "LastLoginAt" = CURRENT_TIMESTAMP,
        "LastLoginIP" = p_ip_address
    WHERE "UserID" = v_user."UserID";

    -- Reset rate limiting
    PERFORM sso_reset_rate_limit(v_limit_key, 'ip_username');

    -- Log successful login
    INSERT INTO "UserAuditLogs" (
        "UserID",
        "EventType",
        "EventCategory",
        "Description",
        "Outcome",
        "IPAddress",
        "UserAgent"
    )
    VALUES (
        v_user."UserID",
        'login_success',
        'auth',
        'User logged in successfully',
        'success',
        p_ip_address,
        p_user_agent
    );

    -- Return user data with roles
    RETURN QUERY
    SELECT
        v_user."UserID",
        v_user."Username",
        v_user."Email",
        v_user."DisplayName",
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'roleId', r."RoleID",
                'roleName', r."RoleName",
                'displayName', r."DisplayName"
            ))
            FROM "UserRoleAssignments" ura
            JOIN "UserRoles" r ON r."RoleID" = ura."RoleID"
            WHERE ura."UserID" = v_user."UserID"
              AND r."IsActive" = TRUE
              AND (ura."ValidUntil" IS NULL OR ura."ValidUntil" > CURRENT_TIMESTAMP)),
            '[]'::JSONB
        ) AS roles,
        EXISTS(
            SELECT 1 FROM "TwoFactorTokens"
            WHERE "UserID" = v_user."UserID"
              AND "IsActive" = TRUE
              AND "IsVerified" = TRUE
              AND "TokenType" = 'totp'
        ) AS requires_2fa,
        v_user."RequirePasswordChange";
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_authenticate_user IS 'Authenticates user with brute-force protection and audit logging';

-- ============================================================================
-- Function: sso_create_refresh_token
-- ============================================================================
-- Creates a refresh token and stores its hash in the database.
-- Returns the token family (for rotation tracking).
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_create_refresh_token(
    p_user_id UUID,
    p_token_hash TEXT,
    p_expires_at TIMESTAMP WITH TIME ZONE,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_token_family UUID DEFAULT NULL,
    p_replaced_token_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_token_id UUID;
    v_family UUID;
BEGIN
    v_family := COALESCE(p_token_family, gen_random_uuid());

    INSERT INTO "RefreshTokens" (
        "UserID",
        "TokenHash",
        "TokenFamily",
        "ExpiresAt",
        "IPAddress",
        "UserAgent"
    )
    VALUES (
        p_user_id,
        p_token_hash,
        v_family,
        p_expires_at,
        p_ip_address,
        p_user_agent
    )
    RETURNING "TokenID" INTO v_token_id;

    -- If replacing a token, update the old one
    IF p_replaced_token_id IS NOT NULL THEN
        UPDATE "RefreshTokens"
        SET "ReplacedByTokenID" = v_token_id,
            "IsRevoked" = TRUE,
            "RevokedAt" = CURRENT_TIMESTAMP,
            "RevokedReason" = 'rotated'
        WHERE "TokenID" = p_replaced_token_id;
    END IF;

    RETURN v_token_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_create_refresh_token IS 'Creates a refresh token with rotation support';

-- ============================================================================
-- Function: sso_validate_refresh_token
-- ============================================================================
-- Validates a refresh token hash and returns user info.
-- Detects token reuse attacks by checking if token was already rotated.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_validate_refresh_token(
    p_token_hash TEXT,
    p_ip_address INET DEFAULT NULL
)
RETURNS TABLE (
    token_id UUID,
    user_id UUID,
    token_family UUID,
    is_valid BOOLEAN,
    is_reuse_attack BOOLEAN
) AS $$
DECLARE
    v_token RECORD;
BEGIN
    -- Find the token
    SELECT * INTO v_token
    FROM "RefreshTokens"
    WHERE "TokenHash" = p_token_hash;

    IF v_token IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE, FALSE;
        RETURN;
    END IF;

    -- Check if token was already rotated (reuse attack detection)
    IF v_token."IsRevoked" AND v_token."ReplacedByTokenID" IS NOT NULL THEN
        -- Token reuse attack detected!
        -- Revoke entire token family
        UPDATE "RefreshTokens"
        SET "IsRevoked" = TRUE,
            "RevokedAt" = CURRENT_TIMESTAMP,
            "RevokedReason" = 'reuse_attack_detected'
        WHERE "TokenFamily" = v_token."TokenFamily"
          AND "IsRevoked" = FALSE;

        -- Log security event
        INSERT INTO "UserAuditLogs" (
            "UserID",
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress",
            "EventData"
        )
        VALUES (
            v_token."UserID",
            'token_reuse_attack',
            'security',
            'Refresh token reuse attack detected - all tokens in family revoked',
            'failure',
            p_ip_address,
            jsonb_build_object('tokenFamily', v_token."TokenFamily")
        );

        RETURN QUERY SELECT v_token."TokenID", v_token."UserID", v_token."TokenFamily", FALSE, TRUE;
        RETURN;
    END IF;

    -- Check if token is expired
    IF v_token."ExpiresAt" < CURRENT_TIMESTAMP THEN
        RETURN QUERY SELECT v_token."TokenID", v_token."UserID", v_token."TokenFamily", FALSE, FALSE;
        RETURN;
    END IF;

    -- Check if token is revoked
    IF v_token."IsRevoked" THEN
        RETURN QUERY SELECT v_token."TokenID", v_token."UserID", v_token."TokenFamily", FALSE, FALSE;
        RETURN;
    END IF;

    -- Check if user is still active
    IF NOT EXISTS(SELECT 1 FROM "Users" WHERE "UserID" = v_token."UserID" AND "IsActive" = TRUE) THEN
        RETURN QUERY SELECT v_token."TokenID", v_token."UserID", v_token."TokenFamily", FALSE, FALSE;
        RETURN;
    END IF;

    -- Token is valid
    RETURN QUERY SELECT v_token."TokenID", v_token."UserID", v_token."TokenFamily", TRUE, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_validate_refresh_token IS 'Validates refresh token with reuse attack detection';

-- ============================================================================
-- Function: sso_revoke_refresh_token
-- ============================================================================
-- Revokes a specific refresh token.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_revoke_refresh_token(
    p_token_hash TEXT,
    p_reason VARCHAR(255) DEFAULT 'user_logout'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE "RefreshTokens"
    SET "IsRevoked" = TRUE,
        "RevokedAt" = CURRENT_TIMESTAMP,
        "RevokedReason" = p_reason
    WHERE "TokenHash" = p_token_hash
      AND "IsRevoked" = FALSE;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: sso_revoke_all_user_tokens
-- ============================================================================
-- Revokes all refresh tokens for a user (logout everywhere).
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_revoke_all_user_tokens(
    p_user_id UUID,
    p_reason VARCHAR(255) DEFAULT 'logout_all_devices'
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE "RefreshTokens"
    SET "IsRevoked" = TRUE,
        "RevokedAt" = CURRENT_TIMESTAMP,
        "RevokedReason" = p_reason
    WHERE "UserID" = p_user_id
      AND "IsRevoked" = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Log the event
    INSERT INTO "UserAuditLogs" (
        "UserID",
        "EventType",
        "EventCategory",
        "Description",
        "Outcome",
        "EventData"
    )
    VALUES (
        p_user_id,
        'all_tokens_revoked',
        'token',
        'All refresh tokens revoked for user',
        'success',
        jsonb_build_object('tokensRevoked', v_count, 'reason', p_reason)
    );

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: sso_change_password
-- ============================================================================
-- Changes a user's password securely.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_change_password(
    p_user_id UUID,
    p_current_password TEXT,
    p_new_password TEXT,
    p_ip_address INET DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user RECORD;
BEGIN
    -- Get current user data
    SELECT * INTO v_user
    FROM "Users"
    WHERE "UserID" = p_user_id;

    IF v_user IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify current password
    IF NOT sso_verify_password(p_current_password, v_user."PasswordHash") THEN
        INSERT INTO "UserAuditLogs" (
            "UserID",
            "EventType",
            "EventCategory",
            "Description",
            "Outcome",
            "IPAddress"
        )
        VALUES (
            p_user_id,
            'password_change_failed',
            'auth',
            'Password change failed - invalid current password',
            'failure',
            p_ip_address
        );
        RETURN FALSE;
    END IF;

    -- Validate new password
    IF LENGTH(p_new_password) < 8 THEN
        RAISE EXCEPTION 'New password must be at least 8 characters long';
    END IF;

    -- Update password
    UPDATE "Users"
    SET "PasswordHash" = sso_hash_password(p_new_password),
        "PasswordChangedAt" = CURRENT_TIMESTAMP,
        "RequirePasswordChange" = FALSE
    WHERE "UserID" = p_user_id;

    -- Revoke all existing tokens (force re-login everywhere)
    PERFORM sso_revoke_all_user_tokens(p_user_id, 'password_changed');

    -- Log success
    INSERT INTO "UserAuditLogs" (
        "UserID",
        "EventType",
        "EventCategory",
        "Description",
        "Outcome",
        "IPAddress"
    )
    VALUES (
        p_user_id,
        'password_changed',
        'auth',
        'Password changed successfully',
        'success',
        p_ip_address
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_change_password IS 'Changes user password with verification and token revocation';

-- ============================================================================
-- Function: sso_get_user_permissions
-- ============================================================================
-- Returns all permissions for a user based on their roles.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_get_user_permissions(p_user_id UUID)
RETURNS TABLE (
    permission_name CITEXT,
    resource_category CITEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        rp."PermissionName",
        rp."ResourceCategory"
    FROM "UserRoleAssignments" ura
    JOIN "UserRoles" ur ON ur."RoleID" = ura."RoleID"
    JOIN "RolePermissionAssignments" rpa ON rpa."RoleID" = ur."RoleID"
    JOIN "RolePermissions" rp ON rp."PermissionID" = rpa."PermissionID"
    WHERE ura."UserID" = p_user_id
      AND ur."IsActive" = TRUE
      AND (ura."ValidUntil" IS NULL OR ura."ValidUntil" > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_get_user_permissions IS 'Returns all permissions for a user';

-- ============================================================================
-- Function: sso_user_has_permission
-- ============================================================================
-- Checks if a user has a specific permission.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_user_has_permission(
    p_user_id UUID,
    p_permission_name CITEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM sso_get_user_permissions(p_user_id)
        WHERE permission_name = p_permission_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: sso_assign_role
-- ============================================================================
-- Assigns a role to a user.
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_assign_role(
    p_user_id UUID,
    p_role_id UUID,
    p_assigned_by UUID DEFAULT NULL,
    p_valid_until TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO "UserRoleAssignments" (
        "UserID",
        "RoleID",
        "AssignedBy",
        "ValidUntil"
    )
    VALUES (
        p_user_id,
        p_role_id,
        p_assigned_by,
        p_valid_until
    )
    ON CONFLICT ("UserID", "RoleID")
    DO UPDATE SET
        "ValidUntil" = EXCLUDED."ValidUntil",
        "AssignedAt" = CURRENT_TIMESTAMP,
        "AssignedBy" = EXCLUDED."AssignedBy";

    -- Log the assignment
    INSERT INTO "UserAuditLogs" (
        "UserID",
        "EventType",
        "EventCategory",
        "Description",
        "Outcome",
        "EventData"
    )
    VALUES (
        p_user_id,
        'role_assigned',
        'role',
        'Role assigned to user',
        'success',
        jsonb_build_object('roleId', p_role_id, 'assignedBy', p_assigned_by)
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: sso_cleanup_expired_tokens
-- ============================================================================
-- Cleanup function for expired tokens (run periodically).
-- ============================================================================

CREATE OR REPLACE FUNCTION sso_cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    -- Delete tokens expired more than 30 days ago
    DELETE FROM "RefreshTokens"
    WHERE "ExpiresAt" < CURRENT_TIMESTAMP - INTERVAL '30 days';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Also cleanup old rate limit records
    DELETE FROM "LoginRateLimits"
    WHERE "WindowEnd" < CURRENT_TIMESTAMP - INTERVAL '1 day';

    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sso_cleanup_expired_tokens IS 'Periodic cleanup of expired tokens and rate limits';

-- ============================================================================
-- End of SSO Functions
-- ============================================================================
