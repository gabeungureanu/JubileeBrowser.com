param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$exePath = Join-Path $InstallRoot "JubileeBrowser.UpdateAgent.exe"
if (-not (Test-Path $exePath)) {
    Write-Error "Update agent executable not found: $exePath"
    exit 1
}

$serviceName = "JubileeBrowserUpdateAgent"
$displayName = "Jubilee Browser Update Agent"

if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
    New-Service -Name $serviceName -DisplayName $displayName -BinaryPathName "`"$exePath`"" -StartupType Automatic | Out-Null
}

Start-Service -Name $serviceName -ErrorAction SilentlyContinue
Write-Output "Service '$displayName' is installed and running."
