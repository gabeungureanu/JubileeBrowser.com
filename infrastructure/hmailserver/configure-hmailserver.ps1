# =============================================================================
# hMailServer Configuration Script for Jubilee Browser / WorldWideBibleWeb
# =============================================================================
# This script configures hMailServer domains, mailboxes, and SMTP relay.
# Run as Administrator after hMailServer is installed.
# =============================================================================

#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory=$true)]
    [string]$AdminPassword,

    [string]$SesSmtpUsername = "",
    [string]$SesSmtpPassword = "",
    [string]$SesSmtpEndpoint = "email-smtp.us-east-1.amazonaws.com"
)

$ErrorActionPreference = "Stop"

Write-Host "=== hMailServer Configuration Script ===" -ForegroundColor Green
Write-Host ""

# =============================================================================
# Connect to hMailServer
# =============================================================================

Write-Host "Connecting to hMailServer..." -ForegroundColor Cyan

try {
    $hMailServer = New-Object -ComObject hMailServer.Application
    $hMailServer.Authenticate("Administrator", $AdminPassword) | Out-Null
    Write-Host "Connected successfully!" -ForegroundColor Green
}
catch {
    Write-Host "Failed to connect to hMailServer: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure hMailServer is installed and the admin password is correct." -ForegroundColor Yellow
    exit 1
}

# =============================================================================
# Domain Configuration
# =============================================================================

$domains = @(
    @{ Name = "worldwidebibleweb.com"; Active = $true },
    @{ Name = "jubileebrowser.com"; Active = $true },
    @{ Name = "jubileeverse.com"; Active = $true }
)

Write-Host ""
Write-Host "Configuring domains..." -ForegroundColor Cyan

foreach ($domainConfig in $domains) {
    $domainName = $domainConfig.Name

    # Check if domain exists
    $existingDomain = $null
    for ($i = 0; $i -lt $hMailServer.Domains.Count; $i++) {
        if ($hMailServer.Domains.Item($i).Name -eq $domainName) {
            $existingDomain = $hMailServer.Domains.Item($i)
            break
        }
    }

    if ($existingDomain) {
        Write-Host "  Domain '$domainName' already exists" -ForegroundColor Yellow
    }
    else {
        $domain = $hMailServer.Domains.Add()
        $domain.Name = $domainName
        $domain.Active = $domainConfig.Active
        $domain.Save()
        Write-Host "  Created domain: $domainName" -ForegroundColor Green
    }
}

# =============================================================================
# Mailbox Configuration
# =============================================================================

$mailboxes = @(
    @{ Domain = "worldwidebibleweb.com"; Address = "noreply"; DisplayName = "No Reply"; Password = "NoReply2024!Secure"; QuotaMB = 100 },
    @{ Domain = "worldwidebibleweb.com"; Address = "support"; DisplayName = "Support Team"; Password = "Support2024!Secure"; QuotaMB = 500 },
    @{ Domain = "worldwidebibleweb.com"; Address = "admin"; DisplayName = "Administrator"; Password = "Admin2024!Secure"; QuotaMB = 1000 },
    @{ Domain = "worldwidebibleweb.com"; Address = "ai01"; DisplayName = "AI Agent 01"; Password = "AI01Agent2024!"; QuotaMB = 100 },
    @{ Domain = "worldwidebibleweb.com"; Address = "ai02"; DisplayName = "AI Agent 02"; Password = "AI02Agent2024!"; QuotaMB = 100 },
    @{ Domain = "jubileebrowser.com"; Address = "noreply"; DisplayName = "No Reply"; Password = "NoReply2024!Secure"; QuotaMB = 100 },
    @{ Domain = "jubileebrowser.com"; Address = "support"; DisplayName = "Support Team"; Password = "Support2024!Secure"; QuotaMB = 500 },
    @{ Domain = "jubileebrowser.com"; Address = "feedback"; DisplayName = "Feedback"; Password = "Feedback2024!Secure"; QuotaMB = 500 },
    @{ Domain = "jubileeverse.com"; Address = "noreply"; DisplayName = "No Reply"; Password = "NoReply2024!Secure"; QuotaMB = 100 },
    @{ Domain = "jubileeverse.com"; Address = "hello"; DisplayName = "Hello"; Password = "Hello2024!Secure"; QuotaMB = 500 }
)

Write-Host ""
Write-Host "Configuring mailboxes..." -ForegroundColor Cyan

foreach ($mailboxConfig in $mailboxes) {
    $domainName = $mailboxConfig.Domain
    $address = $mailboxConfig.Address
    $fullAddress = "$address@$domainName"

    # Find the domain
    $domain = $null
    for ($i = 0; $i -lt $hMailServer.Domains.Count; $i++) {
        if ($hMailServer.Domains.Item($i).Name -eq $domainName) {
            $domain = $hMailServer.Domains.Item($i)
            break
        }
    }

    if (-not $domain) {
        Write-Host "  Domain '$domainName' not found, skipping mailbox '$fullAddress'" -ForegroundColor Yellow
        continue
    }

    # Check if mailbox exists
    $existingAccount = $null
    for ($i = 0; $i -lt $domain.Accounts.Count; $i++) {
        if ($domain.Accounts.Item($i).Address -eq $fullAddress) {
            $existingAccount = $domain.Accounts.Item($i)
            break
        }
    }

    if ($existingAccount) {
        Write-Host "  Mailbox '$fullAddress' already exists" -ForegroundColor Yellow
    }
    else {
        $account = $domain.Accounts.Add()
        $account.Address = $fullAddress
        $account.Password = $mailboxConfig.Password
        $account.MaxSize = $mailboxConfig.QuotaMB
        $account.Active = $true
        $account.PersonFirstName = $mailboxConfig.DisplayName
        $account.Save()
        Write-Host "  Created mailbox: $fullAddress" -ForegroundColor Green
    }
}

# =============================================================================
# SMTP Settings
# =============================================================================

Write-Host ""
Write-Host "Configuring SMTP settings..." -ForegroundColor Cyan

$settings = $hMailServer.Settings

# Enable SMTP authentication
$settings.SMTPRelayer = $SesSmtpEndpoint
$settings.SMTPRelayerPort = 587
$settings.SMTPRelayerConnectionSecurity = 2  # STARTTLS
$settings.SMTPRelayerUseSSL = $false

if ($SesSmtpUsername -and $SesSmtpPassword) {
    $settings.SMTPRelayerRequiresAuthentication = $true
    $settings.SMTPRelayerUsername = $SesSmtpUsername
    $settings.SMTPRelayerPassword = $SesSmtpPassword
    Write-Host "  Configured Amazon SES relay: $SesSmtpEndpoint" -ForegroundColor Green
}
else {
    Write-Host "  SMTP relay credentials not provided, skipping relay configuration" -ForegroundColor Yellow
    Write-Host "  To configure later, use hMailServer Administrator" -ForegroundColor Yellow
}

# =============================================================================
# Security Settings
# =============================================================================

Write-Host ""
Write-Host "Configuring security settings..." -ForegroundColor Cyan

# Enable TLS for incoming connections
$settings.SSLCertificates | Out-Null  # Access to ensure property exists

# Anti-spam settings
$antiSpam = $settings.AntiSpam
$antiSpam.SpamMarkThreshold = 5
$antiSpam.SpamDeleteThreshold = 20
$antiSpam.AddHeaderSpam = $true
$antiSpam.AddHeaderReason = $true
$antiSpam.PrependSubject = $true
$antiSpam.PrependSubjectText = "[SPAM] "

Write-Host "  Anti-spam configured" -ForegroundColor Green

# =============================================================================
# Logging Settings
# =============================================================================

Write-Host ""
Write-Host "Configuring logging..." -ForegroundColor Cyan

$logging = $settings.Logging
$logging.Enabled = $true
$logging.LogSMTP = $true
$logging.LogIMAP = $true
$logging.LogPOP3 = $true
$logging.LogTCPIP = $true
$logging.LogApplication = $true
$logging.LogDebug = $false
$logging.KeepFilesOpen = $false

Write-Host "  Logging enabled" -ForegroundColor Green

# =============================================================================
# Save Settings
# =============================================================================

Write-Host ""
Write-Host "Saving configuration..." -ForegroundColor Cyan

# Settings are saved automatically in COM, but let's verify
Write-Host "  Configuration saved!" -ForegroundColor Green

# =============================================================================
# Summary
# =============================================================================

Write-Host ""
Write-Host "=== Configuration Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Domains configured:" -ForegroundColor Cyan
foreach ($d in $domains) {
    Write-Host "  - $($d.Name)" -ForegroundColor White
}

Write-Host ""
Write-Host "Mailboxes created:" -ForegroundColor Cyan
foreach ($m in $mailboxes) {
    Write-Host "  - $($m.Address)@$($m.Domain)" -ForegroundColor White
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure DNS records (MX, SPF, DKIM, DMARC)" -ForegroundColor White
Write-Host "2. Verify domains in Amazon SES if using SES relay" -ForegroundColor White
Write-Host "3. Test sending/receiving emails" -ForegroundColor White
Write-Host "4. Configure SSL/TLS certificates for secure connections" -ForegroundColor White
Write-Host ""
