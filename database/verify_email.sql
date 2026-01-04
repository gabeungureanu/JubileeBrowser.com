-- Verify email tables
SELECT 'EmailEvents' as table_name, COUNT(*) as row_count FROM "EmailEvents"
UNION ALL
SELECT 'EmailTemplates', COUNT(*) FROM "EmailTemplates"
UNION ALL
SELECT 'EmailDomains', COUNT(*) FROM "EmailDomains"
UNION ALL
SELECT 'EmailMailboxes', COUNT(*) FROM "EmailMailboxes"
UNION ALL
SELECT 'EmailBounces', COUNT(*) FROM "EmailBounces"
UNION ALL
SELECT 'EmailSuppressionList', COUNT(*) FROM "EmailSuppressionList";

-- Show templates
SELECT "TemplateName", "Subject" FROM "EmailTemplates";

-- Show domains
SELECT "DomainName", "IsDefault", "IsActive" FROM "EmailDomains";
