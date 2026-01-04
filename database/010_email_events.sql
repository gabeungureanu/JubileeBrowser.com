-- ============================================================================
-- World Wide Bible Web - Email Events Tracking
-- ============================================================================
-- Tracks all outbound emails sent through the Mailcow/SES infrastructure.
-- Provides traceability for verification emails, password resets, notifications.
-- ============================================================================

-- ============================================================================
-- Table: EmailEvents
-- ============================================================================
-- Records every email sent through the platform for auditing and reporting.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailEvents" (
    -- Primary Key
    "EventID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Associated user (NULL for system emails or anonymous recipients)
    "UserID" UUID NULL,

    -- Email metadata
    "RecipientEmail" CITEXT NOT NULL,
    "SenderEmail" CITEXT NOT NULL DEFAULT 'noreply@worldwidebibleweb.com',
    "Subject" TEXT NOT NULL,

    -- Email type classification
    "EmailType" VARCHAR(50) NOT NULL,

    -- Delivery status
    "Status" VARCHAR(30) NOT NULL DEFAULT 'queued',
    "StatusMessage" TEXT NULL,

    -- SES/SMTP tracking
    "MessageID" VARCHAR(255) NULL,
    "SESMessageID" VARCHAR(255) NULL,

    -- Template information
    "TemplateName" VARCHAR(100) NULL,
    "TemplateVersion" VARCHAR(20) NULL,

    -- Additional metadata (JSON)
    "Metadata" JSONB NULL,

    -- Request context
    "IPAddress" INET NULL,
    "UserAgent" TEXT NULL,
    "RequestID" UUID NULL,

    -- Timestamps
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "SentAt" TIMESTAMP WITH TIME ZONE NULL,
    "DeliveredAt" TIMESTAMP WITH TIME ZONE NULL,
    "OpenedAt" TIMESTAMP WITH TIME ZONE NULL,
    "ClickedAt" TIMESTAMP WITH TIME ZONE NULL,
    "BouncedAt" TIMESTAMP WITH TIME ZONE NULL,
    "ComplainedAt" TIMESTAMP WITH TIME ZONE NULL,

    -- Constraints
    CONSTRAINT "CHK_EmailEvents_Status" CHECK (
        "Status" IN ('queued', 'sending', 'sent', 'delivered', 'opened',
                     'clicked', 'bounced', 'complained', 'failed', 'rejected')
    ),
    CONSTRAINT "CHK_EmailEvents_EmailType" CHECK (
        "EmailType" IN ('verification', 'password_reset', 'welcome', 'notification',
                        'newsletter', 'alert', 'report', 'invitation', 'system', 'other')
    ),

    -- Foreign keys
    CONSTRAINT "FK_EmailEvents_User"
        FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE SET NULL
);

-- Add table comments
COMMENT ON TABLE "EmailEvents" IS 'Tracks all outbound emails for auditing and deliverability monitoring';
COMMENT ON COLUMN "EmailEvents"."EmailType" IS 'Classification: verification, password_reset, welcome, notification, etc.';
COMMENT ON COLUMN "EmailEvents"."Status" IS 'Delivery status: queued, sending, sent, delivered, bounced, complained, failed';
COMMENT ON COLUMN "EmailEvents"."SESMessageID" IS 'Amazon SES message ID for tracking delivery status';

-- ============================================================================
-- Table: EmailTemplates
-- ============================================================================
-- Stores email templates for consistent messaging.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailTemplates" (
    -- Primary Key
    "TemplateID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Template identification
    "TemplateName" VARCHAR(100) NOT NULL,
    "Version" VARCHAR(20) NOT NULL DEFAULT '1.0',

    -- Content
    "Subject" TEXT NOT NULL,
    "HtmlBody" TEXT NOT NULL,
    "TextBody" TEXT NULL,

    -- Template metadata
    "Description" TEXT NULL,
    "Category" VARCHAR(50) NOT NULL DEFAULT 'system',

    -- Variables used in template (JSON array)
    "Variables" JSONB NOT NULL DEFAULT '[]',

    -- Status
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedBy" UUID NULL,

    -- Constraints
    CONSTRAINT "UQ_EmailTemplates_Name_Version" UNIQUE ("TemplateName", "Version"),

    -- Foreign keys
    CONSTRAINT "FK_EmailTemplates_CreatedBy"
        FOREIGN KEY ("CreatedBy") REFERENCES "Users" ("UserID") ON DELETE SET NULL
);

COMMENT ON TABLE "EmailTemplates" IS 'Email templates for consistent messaging across the platform';

-- ============================================================================
-- Table: EmailDomains
-- ============================================================================
-- Tracks configured email domains in Mailcow.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailDomains" (
    -- Primary Key
    "DomainID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Domain name
    "DomainName" CITEXT NOT NULL,

    -- Mailcow integration
    "MailcowDomainID" INTEGER NULL,

    -- DNS verification status
    "MXVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "SPFVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "DKIMVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "DMARCVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "LastDNSCheck" TIMESTAMP WITH TIME ZONE NULL,

    -- Status
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "IsPrimary" BOOLEAN NOT NULL DEFAULT FALSE,

    -- DKIM selector and public key
    "DKIMSelector" VARCHAR(50) NULL DEFAULT 'dkim',
    "DKIMPublicKey" TEXT NULL,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "UQ_EmailDomains_DomainName" UNIQUE ("DomainName")
);

COMMENT ON TABLE "EmailDomains" IS 'Configured email domains with DNS verification status';

-- ============================================================================
-- Table: EmailMailboxes
-- ============================================================================
-- Tracks mailboxes configured in Mailcow.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailMailboxes" (
    -- Primary Key
    "MailboxID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Associated domain
    "DomainID" UUID NOT NULL,

    -- Associated user (optional)
    "UserID" UUID NULL,

    -- Mailbox details
    "LocalPart" CITEXT NOT NULL,
    "FullAddress" CITEXT NULL,  -- Populated by trigger

    -- Mailcow integration
    "MailcowMailboxID" VARCHAR(255) NULL,

    -- Quota (in MB)
    "QuotaMB" INTEGER NOT NULL DEFAULT 1024,
    "UsedMB" INTEGER NOT NULL DEFAULT 0,

    -- Mailbox type
    "MailboxType" VARCHAR(30) NOT NULL DEFAULT 'user',

    -- Status
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit fields
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "UQ_EmailMailboxes_Domain_LocalPart" UNIQUE ("DomainID", "LocalPart"),
    CONSTRAINT "CHK_EmailMailboxes_Type" CHECK (
        "MailboxType" IN ('user', 'shared', 'system', 'noreply', 'alias')
    ),

    -- Foreign keys
    CONSTRAINT "FK_EmailMailboxes_Domain"
        FOREIGN KEY ("DomainID") REFERENCES "EmailDomains" ("DomainID") ON DELETE CASCADE,
    CONSTRAINT "FK_EmailMailboxes_User"
        FOREIGN KEY ("UserID") REFERENCES "Users" ("UserID") ON DELETE SET NULL
);

COMMENT ON TABLE "EmailMailboxes" IS 'Email mailboxes configured in Mailcow';

-- Note: FullAddress is populated via trigger since PostgreSQL doesn't support
-- subqueries in GENERATED columns

-- ============================================================================
-- Trigger: Auto-generate FullAddress for mailboxes
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_mailbox_full_address()
RETURNS TRIGGER AS $$
DECLARE
    v_domain_name CITEXT;
BEGIN
    SELECT "DomainName" INTO v_domain_name
    FROM "EmailDomains"
    WHERE "DomainID" = NEW."DomainID";

    NEW."FullAddress" = NEW."LocalPart" || '@' || v_domain_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generate_mailbox_address ON "EmailMailboxes";
CREATE TRIGGER generate_mailbox_address
    BEFORE INSERT OR UPDATE ON "EmailMailboxes"
    FOR EACH ROW
    EXECUTE FUNCTION generate_mailbox_full_address();

-- ============================================================================
-- Table: EmailBounces
-- ============================================================================
-- Tracks email bounces for deliverability management.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailBounces" (
    -- Primary Key
    "BounceID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Associated email event
    "EventID" UUID NULL,

    -- Bounce details
    "RecipientEmail" CITEXT NOT NULL,
    "BounceType" VARCHAR(30) NOT NULL,
    "BounceSubType" VARCHAR(50) NULL,
    "DiagnosticCode" TEXT NULL,

    -- SES bounce notification data
    "SESFeedbackID" VARCHAR(255) NULL,
    "RawNotification" JSONB NULL,

    -- Timestamps
    "BouncedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ProcessedAt" TIMESTAMP WITH TIME ZONE NULL,

    -- Constraints
    CONSTRAINT "CHK_EmailBounces_Type" CHECK (
        "BounceType" IN ('hard', 'soft', 'transient', 'undetermined')
    ),

    -- Foreign keys
    CONSTRAINT "FK_EmailBounces_Event"
        FOREIGN KEY ("EventID") REFERENCES "EmailEvents" ("EventID") ON DELETE SET NULL
);

COMMENT ON TABLE "EmailBounces" IS 'Email bounce tracking for deliverability management';

-- ============================================================================
-- Table: EmailSuppressionList
-- ============================================================================
-- Maintains a list of email addresses that should not receive emails.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "EmailSuppressionList" (
    -- Primary Key
    "SuppressionID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Suppressed email
    "Email" CITEXT NOT NULL,

    -- Suppression reason
    "Reason" VARCHAR(50) NOT NULL,
    "ReasonDetails" TEXT NULL,

    -- Source of suppression
    "Source" VARCHAR(30) NOT NULL DEFAULT 'bounce',

    -- Can be removed?
    "IsPermanent" BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    "SuppressedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMP WITH TIME ZONE NULL,

    -- Constraints
    CONSTRAINT "UQ_EmailSuppressionList_Email" UNIQUE ("Email"),
    CONSTRAINT "CHK_EmailSuppressionList_Reason" CHECK (
        "Reason" IN ('hard_bounce', 'complaint', 'unsubscribe', 'manual', 'invalid')
    ),
    CONSTRAINT "CHK_EmailSuppressionList_Source" CHECK (
        "Source" IN ('bounce', 'complaint', 'user', 'admin', 'ses')
    )
);

COMMENT ON TABLE "EmailSuppressionList" IS 'Email addresses that should not receive emails';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- EmailEvents indexes
CREATE INDEX IF NOT EXISTS "IX_EmailEvents_UserID" ON "EmailEvents" ("UserID");
CREATE INDEX IF NOT EXISTS "IX_EmailEvents_RecipientEmail" ON "EmailEvents" ("RecipientEmail");
CREATE INDEX IF NOT EXISTS "IX_EmailEvents_EmailType" ON "EmailEvents" ("EmailType");
CREATE INDEX IF NOT EXISTS "IX_EmailEvents_Status" ON "EmailEvents" ("Status");
CREATE INDEX IF NOT EXISTS "IX_EmailEvents_CreatedAt" ON "EmailEvents" ("CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_EmailEvents_SESMessageID" ON "EmailEvents" ("SESMessageID") WHERE "SESMessageID" IS NOT NULL;

-- EmailTemplates indexes
CREATE INDEX IF NOT EXISTS "IX_EmailTemplates_Name" ON "EmailTemplates" ("TemplateName");
CREATE INDEX IF NOT EXISTS "IX_EmailTemplates_Category" ON "EmailTemplates" ("Category");

-- EmailDomains indexes
CREATE INDEX IF NOT EXISTS "IX_EmailDomains_DomainName" ON "EmailDomains" ("DomainName");

-- EmailMailboxes indexes
CREATE INDEX IF NOT EXISTS "IX_EmailMailboxes_FullAddress" ON "EmailMailboxes" ("FullAddress");
CREATE INDEX IF NOT EXISTS "IX_EmailMailboxes_UserID" ON "EmailMailboxes" ("UserID");

-- EmailBounces indexes
CREATE INDEX IF NOT EXISTS "IX_EmailBounces_RecipientEmail" ON "EmailBounces" ("RecipientEmail");
CREATE INDEX IF NOT EXISTS "IX_EmailBounces_BouncedAt" ON "EmailBounces" ("BouncedAt" DESC);

-- EmailSuppressionList indexes
CREATE INDEX IF NOT EXISTS "IX_EmailSuppressionList_Email" ON "EmailSuppressionList" ("Email");

-- ============================================================================
-- TRIGGERS for auto-updating timestamps
-- ============================================================================

CREATE TRIGGER update_emailtemplates_updated_at
    BEFORE UPDATE ON "EmailTemplates"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emaildomains_updated_at
    BEFORE UPDATE ON "EmailDomains"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emailmailboxes_updated_at
    BEFORE UPDATE ON "EmailMailboxes"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS for email operations
-- ============================================================================

-- Function: Check if email is suppressed
CREATE OR REPLACE FUNCTION email_is_suppressed(p_email CITEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "EmailSuppressionList"
        WHERE "Email" = p_email
          AND ("ExpiresAt" IS NULL OR "ExpiresAt" > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql;

-- Function: Record email event
CREATE OR REPLACE FUNCTION email_record_event(
    p_user_id UUID,
    p_recipient_email CITEXT,
    p_subject TEXT,
    p_email_type VARCHAR(50),
    p_template_name VARCHAR(100) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    -- Check suppression list
    IF email_is_suppressed(p_recipient_email) THEN
        INSERT INTO "EmailEvents" (
            "UserID", "RecipientEmail", "Subject", "EmailType",
            "Status", "StatusMessage", "TemplateName", "IPAddress", "Metadata"
        )
        VALUES (
            p_user_id, p_recipient_email, p_subject, p_email_type,
            'rejected', 'Email address is on suppression list',
            p_template_name, p_ip_address, p_metadata
        )
        RETURNING "EventID" INTO v_event_id;

        RETURN v_event_id;
    END IF;

    -- Record the email event
    INSERT INTO "EmailEvents" (
        "UserID", "RecipientEmail", "Subject", "EmailType",
        "Status", "TemplateName", "IPAddress", "Metadata"
    )
    VALUES (
        p_user_id, p_recipient_email, p_subject, p_email_type,
        'queued', p_template_name, p_ip_address, p_metadata
    )
    RETURNING "EventID" INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Update email status
CREATE OR REPLACE FUNCTION email_update_status(
    p_event_id UUID,
    p_status VARCHAR(30),
    p_message_id VARCHAR(255) DEFAULT NULL,
    p_ses_message_id VARCHAR(255) DEFAULT NULL,
    p_status_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE "EmailEvents"
    SET "Status" = p_status,
        "MessageID" = COALESCE(p_message_id, "MessageID"),
        "SESMessageID" = COALESCE(p_ses_message_id, "SESMessageID"),
        "StatusMessage" = COALESCE(p_status_message, "StatusMessage"),
        "SentAt" = CASE WHEN p_status = 'sent' THEN CURRENT_TIMESTAMP ELSE "SentAt" END,
        "DeliveredAt" = CASE WHEN p_status = 'delivered' THEN CURRENT_TIMESTAMP ELSE "DeliveredAt" END,
        "OpenedAt" = CASE WHEN p_status = 'opened' THEN CURRENT_TIMESTAMP ELSE "OpenedAt" END,
        "ClickedAt" = CASE WHEN p_status = 'clicked' THEN CURRENT_TIMESTAMP ELSE "ClickedAt" END,
        "BouncedAt" = CASE WHEN p_status = 'bounced' THEN CURRENT_TIMESTAMP ELSE "BouncedAt" END,
        "ComplainedAt" = CASE WHEN p_status = 'complained' THEN CURRENT_TIMESTAMP ELSE "ComplainedAt" END
    WHERE "EventID" = p_event_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function: Process bounce notification
CREATE OR REPLACE FUNCTION email_process_bounce(
    p_recipient_email CITEXT,
    p_bounce_type VARCHAR(30),
    p_bounce_subtype VARCHAR(50) DEFAULT NULL,
    p_diagnostic_code TEXT DEFAULT NULL,
    p_ses_feedback_id VARCHAR(255) DEFAULT NULL,
    p_event_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_bounce_id UUID;
BEGIN
    -- Record the bounce
    INSERT INTO "EmailBounces" (
        "EventID", "RecipientEmail", "BounceType", "BounceSubType",
        "DiagnosticCode", "SESFeedbackID"
    )
    VALUES (
        p_event_id, p_recipient_email, p_bounce_type, p_bounce_subtype,
        p_diagnostic_code, p_ses_feedback_id
    )
    RETURNING "BounceID" INTO v_bounce_id;

    -- Update email event if provided
    IF p_event_id IS NOT NULL THEN
        PERFORM email_update_status(p_event_id, 'bounced');
    END IF;

    -- Add to suppression list for hard bounces
    IF p_bounce_type = 'hard' THEN
        INSERT INTO "EmailSuppressionList" ("Email", "Reason", "Source", "IsPermanent")
        VALUES (p_recipient_email, 'hard_bounce', 'bounce', TRUE)
        ON CONFLICT ("Email") DO UPDATE
        SET "IsPermanent" = TRUE,
            "SuppressedAt" = CURRENT_TIMESTAMP;
    END IF;

    RETURN v_bounce_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS for reporting
-- ============================================================================

-- View: Email statistics by type
CREATE OR REPLACE VIEW "vw_EmailStatsByType" AS
SELECT
    "EmailType",
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE "Status" = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE "Status" = 'bounced') as bounced,
    COUNT(*) FILTER (WHERE "Status" = 'complained') as complained,
    COUNT(*) FILTER (WHERE "Status" = 'opened') as opened,
    ROUND(100.0 * COUNT(*) FILTER (WHERE "Status" = 'delivered') / NULLIF(COUNT(*), 0), 2) as delivery_rate,
    ROUND(100.0 * COUNT(*) FILTER (WHERE "Status" = 'opened') / NULLIF(COUNT(*) FILTER (WHERE "Status" = 'delivered'), 0), 2) as open_rate
FROM "EmailEvents"
WHERE "CreatedAt" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY "EmailType"
ORDER BY total_sent DESC;

-- View: Daily email volume
CREATE OR REPLACE VIEW "vw_DailyEmailVolume" AS
SELECT
    DATE("CreatedAt") as send_date,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE "Status" = 'delivered') as delivered,
    COUNT(*) FILTER (WHERE "Status" = 'bounced') as bounced,
    COUNT(*) FILTER (WHERE "Status" = 'failed') as failed
FROM "EmailEvents"
WHERE "CreatedAt" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE("CreatedAt")
ORDER BY send_date DESC;

-- ============================================================================
-- SEED DATA: Default email templates
-- ============================================================================

INSERT INTO "EmailTemplates" ("TemplateName", "Version", "Subject", "HtmlBody", "TextBody", "Category", "Variables", "IsDefault")
VALUES
(
    'verification_email',
    '1.0',
    'Verify Your Email Address - World Wide Bible Web',
    '<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #2c3e50;">Welcome to World Wide Bible Web!</h1>
<p>Hello {{username}},</p>
<p>Please verify your email address by clicking the button below:</p>
<p style="text-align: center; margin: 30px 0;">
<a href="{{verification_url}}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
</p>
<p>Or copy and paste this link: {{verification_url}}</p>
<p>This link will expire in {{expiry_hours}} hours.</p>
<p>If you did not create an account, please ignore this email.</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
<p style="color: #7f8c8d; font-size: 12px;">World Wide Bible Web - Connecting the Body of Christ</p>
</body></html>',
    'Welcome to World Wide Bible Web!

Hello {{username}},

Please verify your email address by clicking the link below:

{{verification_url}}

This link will expire in {{expiry_hours}} hours.

If you did not create an account, please ignore this email.

---
World Wide Bible Web - Connecting the Body of Christ',
    'auth',
    '["username", "verification_url", "expiry_hours"]',
    TRUE
),
(
    'password_reset',
    '1.0',
    'Reset Your Password - World Wide Bible Web',
    '<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #2c3e50;">Password Reset Request</h1>
<p>Hello {{username}},</p>
<p>We received a request to reset your password. Click the button below to create a new password:</p>
<p style="text-align: center; margin: 30px 0;">
<a href="{{reset_url}}" style="background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
</p>
<p>Or copy and paste this link: {{reset_url}}</p>
<p>This link will expire in {{expiry_hours}} hours.</p>
<p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
<p style="color: #7f8c8d; font-size: 12px;">World Wide Bible Web - Connecting the Body of Christ</p>
</body></html>',
    'Password Reset Request

Hello {{username}},

We received a request to reset your password. Click the link below to create a new password:

{{reset_url}}

This link will expire in {{expiry_hours}} hours.

If you did not request a password reset, please ignore this email.

---
World Wide Bible Web - Connecting the Body of Christ',
    'auth',
    '["username", "reset_url", "expiry_hours"]',
    TRUE
),
(
    'welcome_email',
    '1.0',
    'Welcome to World Wide Bible Web!',
    '<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #2c3e50;">Welcome to the Family!</h1>
<p>Hello {{username}},</p>
<p>Your account has been verified and you are now part of the World Wide Bible Web community!</p>
<p>Here are some things you can do:</p>
<ul>
<li>Explore the Inspire protocol at <a href="inspire://home.inspire">inspire://home.inspire</a></li>
<li>Create your own web space in the Jubileeverse</li>
<li>Connect with other believers around the world</li>
</ul>
<p style="text-align: center; margin: 30px 0;">
<a href="{{dashboard_url}}" style="background-color: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Go to Dashboard</a>
</p>
<p>May God bless your journey!</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
<p style="color: #7f8c8d; font-size: 12px;">World Wide Bible Web - Connecting the Body of Christ</p>
</body></html>',
    'Welcome to the Family!

Hello {{username}},

Your account has been verified and you are now part of the World Wide Bible Web community!

Here are some things you can do:
- Explore the Inspire protocol
- Create your own web space in the Jubileeverse
- Connect with other believers around the world

Visit your dashboard: {{dashboard_url}}

May God bless your journey!

---
World Wide Bible Web - Connecting the Body of Christ',
    'onboarding',
    '["username", "dashboard_url"]',
    TRUE
)
ON CONFLICT ("TemplateName", "Version") DO NOTHING;

-- ============================================================================
-- SEED DATA: Default email domains
-- ============================================================================

INSERT INTO "EmailDomains" ("DomainName", "IsPrimary", "DKIMSelector")
VALUES
    ('worldwidebibleweb.com', TRUE, 'dkim'),
    ('jubileeverse.com', FALSE, 'dkim'),
    ('jubileebrowser.com', FALSE, 'dkim')
ON CONFLICT ("DomainName") DO NOTHING;

-- ============================================================================
-- End of Email Events Schema
-- ============================================================================
