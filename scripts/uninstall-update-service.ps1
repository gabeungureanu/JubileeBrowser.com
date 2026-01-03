param(
    [string]$ServiceName = "JubileeBrowserUpdateAgent"
)

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Write-Output "Service '$ServiceName' removed."
} else {
    Write-Output "Service '$ServiceName' not found."
}
