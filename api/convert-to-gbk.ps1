$path = 'C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\api\stop-8081.bat'
# Explicitly read as UTF-8 (file is UTF-8 without BOM)
$content = Get-Content -Raw -Encoding UTF8 -Path $path
# Write back as GBK (code page 936)
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::GetEncoding(936))
Write-Host "Converted stop-8081.bat to GBK (code page 936)"
