$path = 'C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\api\stop-8081.bat'
$bytes = [System.IO.File]::ReadAllBytes($path)
Write-Host ("Total bytes: " + $bytes.Length)
Write-Host ("First 3 bytes (BOM check, hex): " + ($bytes[0..2] | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
Write-Host "--- Decoded as GBK (codepage 936) ---"
$gbk = [System.Text.Encoding]::GetEncoding(936)
Write-Host $gbk.GetString($bytes)
Write-Host "--- Decoded as UTF8 ---"
Write-Host ([System.Text.Encoding]::UTF8.GetString($bytes))
