# =============================================================================
# hMailServer Installation Script for Jubilee Browser / WorldWideBibleWeb
# =============================================================================
# This script downloads and installs hMailServer with PostgreSQL backend.
# Run as Administrator.
# =============================================================================

#Requires -RunAsAdministrator

param(
    [string]$InstallPath = "C:\Program Files (x86)\hMailServer",
    [string]$DownloadUrl = "https://www.hmailserver.com/download_file/?downloadid=271",
    [string]$InstallerPath = "$env:TEMP\hMailServer-5.6.9-B2632.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "=== hMailServer Installation Script ===" -ForegroundColor Green
Write-Host ""

# Check if hMailServer is already installed
if (Test-Path "$InstallPath\Bin\hMailServer.exe") {
    Write-Host "hMailServer is already installed at $InstallPath" -ForegroundColor Yellow
    Write-Host "Skipping installation. Run uninstall first if you want to reinstall." -ForegroundColor Yellow
    exit 0
}

# Check for PostgreSQL ODBC driver
Write-Host "Checking for PostgreSQL ODBC driver..." -ForegroundColor Cyan
$odbcDrivers = Get-OdbcDriver | Where-Object { $_.Name -like "*PostgreSQL*" }

if (-not $odbcDrivers) {
    Write-Host "PostgreSQL ODBC driver not found!" -ForegroundColor Red
    Write-Host "Please install the PostgreSQL ODBC driver from:" -ForegroundColor Yellow
    Write-Host "https://www.postgresql.org/ftp/odbc/versions/msi/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download the latest version (e.g., psqlodbc_16_00_0000-x64.zip)" -ForegroundColor Yellow
    Write-Host "Extract and run the MSI installer, then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found PostgreSQL ODBC driver: $($odbcDrivers[0].Name)" -ForegroundColor Green

# Download hMailServer
Write-Host ""
Write-Host "Downloading hMailServer..." -ForegroundColor Cyan

if (-not (Test-Path $InstallerPath)) {
    try {
        # Use alternative download approach
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0")
        $webClient.DownloadFile("https://www.hmailserver.com/download_file/?downloadid=271", $InstallerPath)
        Write-Host "Downloaded to: $InstallerPath" -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to download hMailServer automatically." -ForegroundColor Red
        Write-Host "Please download manually from: https://www.hmailserver.com/download" -ForegroundColor Yellow
        Write-Host "Save the installer to: $InstallerPath" -ForegroundColor Yellow
        Write-Host "Then run this script again." -ForegroundColor Yellow
        exit 1
    }
}
else {
    Write-Host "Installer already exists at: $InstallerPath" -ForegroundColor Green
}

# Create silent installation INI file
Write-Host ""
Write-Host "Creating silent installation configuration..." -ForegroundColor Cyan

$iniContent = @"
[hMailServer]
InstallPath=$InstallPath
DatabaseType=PGSQL
"@

$iniPath = "$env:TEMP\hmailserver_install.ini"
Set-Content -Path $iniPath -Value $iniContent

# Run installer
Write-Host ""
Write-Host "Running hMailServer installer..." -ForegroundColor Cyan
Write-Host "IMPORTANT: During installation:" -ForegroundColor Yellow
Write-Host "  1. Select 'Use external database server (PostgreSQL, MySQL, or MS SQL)'" -ForegroundColor Yellow
Write-Host "  2. Choose PostgreSQL as the database type" -ForegroundColor Yellow
Write-Host "  3. Use these connection settings:" -ForegroundColor Yellow
Write-Host "     - Server: 127.0.0.1" -ForegroundColor White
Write-Host "     - Port: 5432" -ForegroundColor White
Write-Host "     - Database: worldwidebibleweb" -ForegroundColor White
Write-Host "     - Username: postgres" -ForegroundColor White
Write-Host "     - Password: (your PostgreSQL password)" -ForegroundColor White
Write-Host ""

# Start the installer
Start-Process -FilePath $InstallerPath -Wait

# Check if installation succeeded
if (Test-Path "$InstallPath\Bin\hMailServer.exe") {
    Write-Host ""
    Write-Host "=== hMailServer Installation Complete ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Open hMailServer Administrator from Start Menu" -ForegroundColor White
    Write-Host "2. Connect with the admin password you set during installation" -ForegroundColor White
    Write-Host "3. Run configure-hmailserver.ps1 to set up domains and mailboxes" -ForegroundColor White
}
else {
    Write-Host ""
    Write-Host "Installation may not have completed successfully." -ForegroundColor Yellow
    Write-Host "Please verify hMailServer is installed at: $InstallPath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
