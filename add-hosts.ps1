$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$entry = "127.0.0.1 jubileebrowser.com"

$content = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue

if ($content -notmatch "jubileebrowser.com") {
    Add-Content -Path $hostsPath -Value "`n$entry"
    Write-Output "Hosts entry added successfully"
} else {
    Write-Output "Hosts entry already exists"
}
