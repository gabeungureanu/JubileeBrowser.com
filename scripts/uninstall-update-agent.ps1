param(
    [string]$TaskName = "JubileeBrowser Update Agent"
)

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Write-Output "Scheduled task '$TaskName' removed."
