$ansi = [System.Text.Encoding]::Default
$oemCP = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\CodePage' -ErrorAction SilentlyContinue).OEMCP
$ansiCP = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\CodePage' -ErrorAction SilentlyContinue).ACP
Write-Host "ANSI (Encoding.Default) WebName : $($ansi.WebName)"
Write-Host "ANSI CodePage                  : $($ansi.CodePage)"
Write-Host "Registry ACP (ANSI)            : $ansiCP"
Write-Host "Registry OEMCP (OEM/cmd)      : $oemCP"
Write-Host "Console OutputEncoding        : $([Console]::OutputEncoding.WebName)"
Write-Host "CurrentCulture                : $([System.Globalization]::CultureInfo.CurrentCulture.Name)"
Write-Host "SystemLocale (registry)       : $((Get-WinSystemLocale -ErrorAction SilentlyContinue).Name)"
