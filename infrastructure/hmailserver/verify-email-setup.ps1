# =============================================================================
# Email Infrastructure Verification Script
# =============================================================================
# Verifies hMailServer, database, and DNS configuration.
# =============================================================================

param(
    [string]$Domain = "worldwidebibleweb.com",
    [switch]$SkipDns,
    [switch]$SkipDatabase,
    [switch]$SkipHMailServer
)

$ErrorActionPreference = "Continue"

Write-Host "=== Email Infrastructure Verification ===" -ForegroundColor Green
Write-Host ""

# =============================================================================
# Check hMailServer Installation
# =============================================================================

if (-not $SkipHMailServer) {
    Write-Host "Checking hMailServer installation..." -ForegroundColor Cyan

    $hMailServerPath = "C:\Program Files (x86)\hMailServer"
    $hMailServerService = Get-Service -Name "hMailServer" -ErrorAction SilentlyContinue

    if (Test-Path "$hMailServerPath\Bin\hMailServer.exe") {
        Write-Host "  [OK] hMailServer installed at $hMailServerPath" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] hMailServer not found at $hMailServerPath" -ForegroundColor Red
        Write-Host "  Run install-hmailserver.ps1 to install" -ForegroundColor Yellow
    }

    if ($hMailServerService) {
        if ($hMailServerService.Status -eq "Running") {
            Write-Host "  [OK] hMailServer service is running" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] hMailServer service is $($hMailServerService.Status)" -ForegroundColor Yellow
            Write-Host "  Start with: Start-Service hMailServer" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [FAIL] hMailServer service not found" -ForegroundColor Red
    }

    # Check SMTP port
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $tcpClient.Connect("127.0.0.1", 25)
        $tcpClient.Close()
        Write-Host "  [OK] SMTP port 25 is listening" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] SMTP port 25 is not accessible" -ForegroundColor Red
    }

    # Check submission port
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $tcpClient.Connect("127.0.0.1", 587)
        $tcpClient.Close()
        Write-Host "  [OK] Submission port 587 is listening" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Submission port 587 is not accessible" -ForegroundColor Yellow
    }

    Write-Host ""
}

# =============================================================================
# Check Database Tables
# =============================================================================

if (-not $SkipDatabase) {
    Write-Host "Checking database tables..." -ForegroundColor Cyan

    $env:PGPASSWORD = "askShaddai4e!"
    $psqlPath = "C:\Program Files\PostgreSQL\16\bin\psql.exe"

    if (Test-Path $psqlPath) {
        $query = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'Email%' ORDER BY table_name;"
        $result = & $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -t -c $query 2>&1

        $tables = @("EmailEvents", "EmailTemplates", "EmailDomains", "EmailMailboxes", "EmailBounces", "EmailSuppressionList")

        foreach ($table in $tables) {
            if ($result -match $table) {
                Write-Host "  [OK] Table $table exists" -ForegroundColor Green
            } else {
                Write-Host "  [FAIL] Table $table not found" -ForegroundColor Red
            }
        }

        # Check for seeded data
        $templateCount = & $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -t -c "SELECT COUNT(*) FROM ""EmailTemplates"";" 2>&1
        Write-Host "  [INFO] EmailTemplates has $($templateCount.Trim()) records" -ForegroundColor White

        $domainCount = & $psqlPath -U postgres -h 127.0.0.1 -p 5432 -d worldwidebibleweb -t -c "SELECT COUNT(*) FROM ""EmailDomains"";" 2>&1
        Write-Host "  [INFO] EmailDomains has $($domainCount.Trim()) records" -ForegroundColor White
    } else {
        Write-Host "  [FAIL] PostgreSQL client not found at $psqlPath" -ForegroundColor Red
    }

    Write-Host ""
}

# =============================================================================
# Check DNS Records
# =============================================================================

if (-not $SkipDns) {
    Write-Host "Checking DNS records for $Domain..." -ForegroundColor Cyan

    # MX Record
    try {
        $mx = Resolve-DnsName -Name $Domain -Type MX -ErrorAction Stop
        if ($mx) {
            Write-Host "  [OK] MX record: $($mx[0].NameExchange) (Priority: $($mx[0].Preference))" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [FAIL] No MX record found for $Domain" -ForegroundColor Red
    }

    # SPF Record
    try {
        $txt = Resolve-DnsName -Name $Domain -Type TXT -ErrorAction Stop
        $spf = $txt | Where-Object { $_.Strings -like "*v=spf1*" }
        if ($spf) {
            Write-Host "  [OK] SPF record found" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] No SPF record found" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [WARN] Could not check SPF record" -ForegroundColor Yellow
    }

    # DKIM Record
    try {
        $dkim = Resolve-DnsName -Name "dkim._domainkey.$Domain" -Type TXT -ErrorAction Stop
        if ($dkim) {
            Write-Host "  [OK] DKIM record found" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] No DKIM record found at dkim._domainkey.$Domain" -ForegroundColor Yellow
    }

    # DMARC Record
    try {
        $dmarc = Resolve-DnsName -Name "_dmarc.$Domain" -Type TXT -ErrorAction Stop
        if ($dmarc) {
            Write-Host "  [OK] DMARC record found" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] No DMARC record found at _dmarc.$Domain" -ForegroundColor Yellow
    }

    Write-Host ""
}

# =============================================================================
# Check Windows Firewall
# =============================================================================

Write-Host "Checking Windows Firewall rules..." -ForegroundColor Cyan

$requiredPorts = @(25, 465, 587, 110, 995, 143, 993)

foreach ($port in $requiredPorts) {
    $rule = Get-NetFirewallRule -DisplayName "*$port*" -ErrorAction SilentlyContinue |
            Where-Object { $_.Enabled -eq "True" -and $_.Direction -eq "Inbound" }

    if ($rule) {
        Write-Host "  [OK] Port $port has inbound rule" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] No inbound firewall rule found for port $port" -ForegroundColor Yellow
    }
}

Write-Host ""

# =============================================================================
# Summary
# =============================================================================

Write-Host "=== Verification Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. If hMailServer is not installed, run: .\install-hmailserver.ps1" -ForegroundColor White
Write-Host "2. If database tables are missing, run: 010_email_events.sql migration" -ForegroundColor White
Write-Host "3. Configure DNS records as documented in DNS-CONFIGURATION.md" -ForegroundColor White
Write-Host "4. Configure Amazon SES relay in hMailServer if needed" -ForegroundColor White
Write-Host "5. Send a test email to verify end-to-end functionality" -ForegroundColor White
Write-Host ""
