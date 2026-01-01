Import-Module WebAdministration
Get-Website | Where-Object { $_.State -eq 'Started' } | ForEach-Object {
    $siteName = $_.Name
    $_.Bindings.Collection | Where-Object { $_.protocol -eq 'http' -and $_.bindingInformation -like '*:80:*' } | ForEach-Object {
        [PSCustomObject]@{
            Site = $siteName
            Binding = $_.bindingInformation
        }
    }
} | Format-Table -AutoSize
