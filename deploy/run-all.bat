@echo off
rem ============================================================================
rem run-all.bat - start the local dev stack in four separate terminals
rem   booking 8081 / message-service 8090 / classroom 8092 / dev proxy 8080
rem
rem The four launchers (run-api / run-msg / run-clas / run-lcl) live at G:\ root.
rem This file is in deploy\, so it calls them by absolute path.
rem Each window is kept open so errors stay visible if a service exits.
rem ============================================================================
setlocal

set "PRJ=G:\WorkBuddy\2026-08-30-17-19-24"
set "LAUNCH=G:\"

rem Fail early instead of opening four empty windows.
for %%F in (run-api.bat run-msg.bat run-clas.bat run-lcl.bat) do (
    if not exist "%LAUNCH%%%F" (
        echo   [ERR] missing %LAUNCH%%%F
        pause
        exit /b 1
    )
)

if not exist "%PRJ%\api\target\booking-api-2.2.0.jar" (
    echo   [WARN] api\target\booking-api-2.2.0.jar not found - build first if booking fails
)

rem /D sets cwd so java -jar writes ./logs into the project, not G:\ or deploy\.
rem Backends go first. The proxy probes them on startup and may print "not ready"
rem warnings; that is informational and does NOT block startup - no restart needed.
start "booking 8081"    /D "%PRJ%" cmd /k call %LAUNCH%run-api.bat
start "message 8090"    /D "%PRJ%" cmd /k call %LAUNCH%run-msg.bat
start "classroom 8092"  /D "%PRJ%" cmd /k call %LAUNCH%run-clas.bat
start "frontend 8080"   /D "%PRJ%" cmd /k call %LAUNCH%run-lcl.bat

echo.
echo   Four terminals started:
echo     booking 8081 ^| message 8090 ^| classroom 8092 ^| frontend proxy 8080
echo   Open http://127.0.0.1:8080/
echo   Stop: close each window, or press Ctrl+C in it.
echo   classroom-service also needs local Redis db2.
echo.
endlocal
