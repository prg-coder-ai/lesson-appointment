$bat = @'
@echo off
setlocal enabledelayedexpansion

set "PORT=8081"
set "KILLED=0"

echo 正在查找监听 %PORT% 端口的进程...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    if "!KILLED!"=="0" (
        echo 发现进程 PID: %%a，正在终止...
        taskkill /PID %%a /F
        set "KILLED=1"
    )
)

if "!KILLED!"=="0" (
    echo 未发现监听 %PORT% 端口的进程，无需操作。
)

echo.
echo 验证端口状态：
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul
if errorlevel 1 (
    echo [成功] %PORT% 端口已释放。
) else (
    echo [警告] %PORT% 端口仍被占用，请手动检查。
)

echo.
pause
endlocal
'@
$path = 'C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\api\stop-8081.bat'
[System.IO.File]::WriteAllText($path, $bat + "`r`n", [System.Text.Encoding]::GetEncoding(936))
Write-Host "Wrote GBK batch file to: $path"
