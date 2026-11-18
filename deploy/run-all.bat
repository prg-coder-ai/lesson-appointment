@echo off
rem ============================================================================
rem run-all.bat - start the local dev stack in four separate terminals
rem   booking 8081 / message-service 8090 / classroom 8092 / dev proxy 8080
rem
rem The four launchers (run-api / run-msg / run-clas / run-lcl) live in
rem doc-develop\90-工具与脚本\ (moved there on 2026-11-18). Paths are resolved
rem relative to this script, so moving the repository no longer breaks them.
rem Each window is kept open so errors stay visible if a service exits.
rem
rem STARTUP GATE (2026-11-15): run-lcl.bat is started only after all three
rem backend TCP ports are LISTENING. dev-frontend-local.js probes those same
rem ports with net.connect() on boot, so gating here removes its "not ready"
rem warnings and makes the proxy usable as soon as its window opens.
rem   * Criterion = TCP port LISTENING (exactly dev-proxy.js#probe). Do NOT use
rem     /actuator/health here: classroom-service returns 503 when local Redis
rem     db2 is missing, even though Tomcat already accepts connections.
rem
rem IDEMPOTENT START (2026-11-15): a window is opened only when its port is
rem free, so re-running this script no longer produces "port already in use"
rem error windows. A port held by ANOTHER app looks the same as our own service
rem here; if that happens, free the port or set FORCE_START=1.
rem
rem   * Tunables (env var or edit below): WAIT_TIMEOUT seconds (0 = skip gate),
rem     POLL_SECONDS, START_PROXY_ON_TIMEOUT (1 = start anyway + warn, 0 = abort),
rem     FORCE_START (1 = always open every window, even if a port is taken).
rem ============================================================================
setlocal EnableDelayedExpansion

rem Resolve the repository root from this script's own location (deploy\..).
pushd "%~dp0.." >nul 2>nul
set "PRJ=%CD%"
popd >nul 2>nul
set "LAUNCH=%PRJ%\doc-develop\90-工具与脚本\"
set "BACKEND_PORTS=8081 8090 8092"
if not defined WAIT_TIMEOUT set "WAIT_TIMEOUT=180"
if not defined POLL_SECONDS set "POLL_SECONDS=2"
if not defined START_PROXY_ON_TIMEOUT set "START_PROXY_ON_TIMEOUT=1"
if not defined FORCE_START set "FORCE_START=0"
set "STARTED="
set "SKIPPED="
set /a PING_COUNT=%POLL_SECONDS%+1

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

rem /D sets cwd so java -jar writes ./logs into the project, not the launcher dir.
rem RC=1 means "open this window": the port is free, or FORCE_START=1.
call :portListening 8081
if errorlevel 1 (set "RC=1") else (set "RC=0")
if "%FORCE_START%"=="1" set "RC=1"
if "%RC%"=="1" (
    start "booking 8081" /D "%PRJ%" cmd /k call "%LAUNCH%run-api.bat"
    set "STARTED=!STARTED! booking:8081"
) else (
    echo   [skip] :8081 already LISTENING - booking window not started.
    set "SKIPPED=!SKIPPED! booking:8081"
)

call :portListening 8090
if errorlevel 1 (set "RC=1") else (set "RC=0")
if "%FORCE_START%"=="1" set "RC=1"
if "%RC%"=="1" (
    start "message 8090" /D "%PRJ%" cmd /k call "%LAUNCH%run-msg.bat"
    set "STARTED=!STARTED! message:8090"
) else (
    echo   [skip] :8090 already LISTENING - message window not started.
    set "SKIPPED=!SKIPPED! message:8090"
)

call :portListening 8092
if errorlevel 1 (set "RC=1") else (set "RC=0")
if "%FORCE_START%"=="1" set "RC=1"
if "%RC%"=="1" (
    start "classroom 8092" /D "%PRJ%" cmd /k call "%LAUNCH%run-clas.bat"
    set "STARTED=!STARTED! classroom:8092"
) else (
    echo   [skip] :8092 already LISTENING - classroom window not started.
    set "SKIPPED=!SKIPPED! classroom:8092"
)

if "%WAIT_TIMEOUT%"=="0" (
    echo.
    echo   [skip] WAIT_TIMEOUT=0 - no backend wait, frontend proxy is next.
    goto START_PROXY
)

set /a ELAPSED=0
set "FIRST=1"

:WAIT_LOOP
set "PENDING="
for %%P in (%BACKEND_PORTS%) do (
    call :portListening %%P
    if errorlevel 1 set "PENDING=!PENDING! %%P"
)
if not defined PENDING goto READY
if %ELAPSED% GEQ %WAIT_TIMEOUT% goto TIMEOUT
if "%FIRST%"=="1" (
    echo.
    echo   Waiting for backends to listen on: %BACKEND_PORTS%
    echo   Timeout %WAIT_TIMEOUT%s, poll %POLL_SECONDS%s, set WAIT_TIMEOUT=0 to skip
    set "FIRST=0"
)
echo   [wait] !ELAPSED!s  pending:!PENDING!
rem ping is used as a sleep: "timeout /t" fails when stdin is redirected.
ping -n %PING_COUNT% 127.0.0.1 >nul 2>&1
set /a ELAPSED+=%POLL_SECONDS%
goto WAIT_LOOP

:READY
echo.
echo   [ok] booking 8081 + message 8090 + classroom 8092 are LISTENING.
goto START_PROXY

:TIMEOUT
echo.
echo   [WARN] Backends still not listening after %WAIT_TIMEOUT%s. Pending:!PENDING!
if "%START_PROXY_ON_TIMEOUT%"=="1" (
    echo   [WARN] START_PROXY_ON_TIMEOUT=1 - starting frontend proxy anyway.
    goto START_PROXY
)
echo   [ERR] START_PROXY_ON_TIMEOUT=0 - frontend proxy NOT started.
echo   Check the backend windows; classroom-service also needs local Redis db2.
pause
endlocal
exit /b 1

:START_PROXY
call :portListening 8080
if errorlevel 1 (set "RC=1") else (set "RC=0")
if "%FORCE_START%"=="1" set "RC=1"
if "%RC%"=="1" (
    start "frontend 8080" /D "%PRJ%" cmd /k call "%LAUNCH%run-lcl.bat"
    set "STARTED=!STARTED! frontend:8080"
) else (
    echo   [skip] :8080 already LISTENING - frontend proxy window not started.
    set "SKIPPED=!SKIPPED! frontend:8080"
)

echo.
echo   Startup complete.
if defined STARTED echo     started:!STARTED!
if defined SKIPPED echo     skipped, port already LISTENING:!SKIPPED!
echo   Open http://127.0.0.1:8080/
echo   Stop: close each window, or press Ctrl+C in it.
echo   classroom-service also needs local Redis db2.
echo   Tip: FORCE_START=1 opens every window even when a port is taken.
echo.
endlocal
exit /b 0

rem ----------------------------------------------------------------------------
rem :portListening PORT  :  errorlevel 0 = LISTENING, 1 = not listening
rem
rem Pure cmd built-ins on purpose: no findstr and no external pipe, because
rem findstr reading redirected or piped stdin is unreliable in some shells.
rem A netstat TCP row is: TCP local:port foreign LISTENING pid, all space padded.
rem tokens=2,4 give %%A=local address and %%B=state; split %%A on colon to get %%Q=port.
rem IPv4 rows are enough (a dual-stack listener always has a 0.0.0.0 row too).
rem ----------------------------------------------------------------------------
:portListening
set "_FOUND="
for /f "tokens=2,4" %%A in ('netstat -ano -p tcp 2^>nul') do (
    if "%%B"=="LISTENING" (
        for /f "tokens=2 delims=:" %%Q in ("%%A") do (
            if "%%Q"=="%~1" set "_FOUND=1"
        )
    )
)
if defined _FOUND (exit /b 0) else (exit /b 1)
