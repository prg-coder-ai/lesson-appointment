@echo off
setlocal enabledelayedexpansion

set "PORT=8081"
set "KILLED=0"

echo Finding process listening on port %PORT% ...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    if "!KILLED!"=="0" (
        echo Found PID: %%a , terminating...
        taskkill /PID %%a /F
        set "KILLED=1"
    )
)

if "!KILLED!"=="0" (
    echo No process is listening on port %PORT%.
)

echo.
echo Verifying port status:
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul
if errorlevel 1 (
    echo [OK] Port %PORT% has been released.
) else (
    echo [WARN] Port %PORT% is still in use, please check manually.
)

echo.
pause
endlocal
