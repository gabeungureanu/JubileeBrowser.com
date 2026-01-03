param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$IntervalHours = 4
)

$exePath = Join-Path $InstallRoot "JubileeBrowser.UpdateAgent.exe"
if (-not (Test-Path $exePath)) {
    Write-Error "Update agent executable not found: $exePath"
    exit 1
}

$taskName = "JubileeBrowser Update Agent"
$action = New-ScheduledTaskAction -Execute $exePath -Argument "--run-once"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
    -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -User "SYSTEM" -RunLevel Highest -Force | Out-Null

Write-Output "Scheduled task '$taskName' registered to run every $IntervalHours hours."
