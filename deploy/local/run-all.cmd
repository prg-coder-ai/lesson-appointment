@echo off
chcp 65001 >nul
REM ============================================================
REM  本地开发【一条命令起全套】—— 三个后端 + 前端开发代理（Windows）
REM
REM  用法：
REM    run-all.cmd              起三后端（各自独立窗口）+ 本窗口跑前端代理
REM    run-all.cmd stop         停后端窗口
REM    run-all.cmd status       只看端口状态
REM
REM  可覆盖（先 set 再执行）：
REM    set SKIP_CLASSROOM=1     不起课堂 8092（没 Redis / 只调预约与消息）
REM    set BACKEND_ONLY=1       只起后端，不起前端
REM    set FRONTEND_ONLY=1      只起前端（后端假定已在跑）
REM    set DIST=1               前端伺服 frontend\dist 构建产物（默认源码直出）
REM    set DEV_PORT=8080        前端代理端口
REM
REM  为什么不重写启动逻辑：jar 通配、端口占用判断、课堂可选这些规则只应有一份，
REM  所以这里直接 call start-backend-local.cmd nopause 复用
REM  （2026-10-30 的"jar 名写死"事故就是同类教训）。
REM ============================================================
setlocal
set ROOT=%~dp0..\..
set BACKEND=%~dp0start-backend-local.cmd
set DEV_DIR=%ROOT%\doc-develop
set ACTION=%~1
if "%ACTION%"=="" set ACTION=start

if /i "%ACTION%"=="stop"   goto :do_stop
if /i "%ACTION%"=="status" goto :do_status
if /i "%ACTION%"=="start"  goto :do_start
echo 用法：run-all.cmd [start^|stop^|status]
exit /b 1

REM ---------------- 启动 ----------------
:do_start
REM 前端端口预检查放在最前面：否则会先把后端全起来、再在前端这步报错退出
if "%BACKEND_ONLY%"=="1" goto :port_ok
call :check_front_port
if errorlevel 1 exit /b 1
:port_ok
if "%FRONTEND_ONLY%"=="1" (
  echo FRONTEND_ONLY=1：假定后端已在运行，跳过后端启动
  echo.
  goto :frontend
)

call "%BACKEND%" nopause
if errorlevel 1 (
  echo.
  echo [X] 后端启动失败，见上面的提示
  exit /b 1
)

echo.
where curl >nul 2>&1
if errorlevel 1 (
  echo   （本机没有 curl，跳过就绪等待，直接起前端）
  echo.
  goto :frontend
)

echo 等待后端就绪（首次启动约 15-30 秒，别急着关窗口）：
call :wait_port 8081 booking 90
call :wait_port 8090 message-service 90
netstat -ano | findstr "LISTENING" | findstr ":8092 " >nul 2>&1
if errorlevel 1 (
  echo   - classroom :8092 未启动（不影响预约与消息）
) else (
  call :wait_port 8092 classroom 60
)
echo.

REM 前端端口预检查：已有代理在跑时再起一个只会 EADDRINUSE 崩掉
:check_front_port
set DEV_PORT_DEF=8080
if defined DEV_PORT set DEV_PORT_DEF=%DEV_PORT%
netstat -ano | findstr "LISTENING" | findstr ":%DEV_PORT_DEF% " >nul 2>&1
if not errorlevel 1 (
  echo [X] 前端代理端口 %DEV_PORT_DEF% 已被占用 —— 已有实例在跑，不必再起。
  echo     看是谁在用：run-all.cmd status
  echo     要换端口  ：set DEV_PORT=8099 后再执行本脚本（避开 8081/8090/8092 后端端口）
  exit /b 1
)
exit /b 0

:frontend
if "%BACKEND_ONLY%"=="1" (
  echo BACKEND_ONLY=1：只起后端。前端另开：node doc-develop\dev-frontend-local-src.js
  exit /b 0
)

set FRONT_JS=%DEV_DIR%\dev-frontend-local-src.js
if "%DIST%"=="1" set FRONT_JS=%DEV_DIR%\dev-frontend-local.js
if not exist "%FRONT_JS%" (
  echo [X] 找不到 %FRONT_JS%
  exit /b 1
)
if "%DIST%"=="1" (
  echo 模式：伺服 frontend\dist 构建产物（DIST=1）
) else (
  echo 模式：源码直出（改完 js/html/css 刷新浏览器即生效，无需 build）
)
echo 启动前端代理：%FRONT_JS%
echo   Ctrl+C 停前端；后端在独立窗口，关掉那些窗口即停
echo.
node "%FRONT_JS%"
echo.
echo 前端代理已退出。后端仍在各自窗口运行（run-all.cmd stop 可按窗口标题停掉）。
pause
exit /b 0

REM ---------------- 停止 ----------------
:do_stop
echo 停止后端窗口……
taskkill /F /FI "WINDOWTITLE eq booking-8081*"     >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq message-8090*"     >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq classroom-8092*"   >nul 2>&1
echo 已按窗口标题停掉后端窗口。若端口仍被占用（窗口标题被改过），用：
echo    tasklist ^| findstr java       然后 taskkill /F /PID 那个PID
echo.
call :status_ports
exit /b 0

REM ---------------- 状态 ----------------
:do_status
echo 端口状态（LISTENING 才算在跑）：
call :status_ports
if not defined NOPAUSE pause
exit /b 0

REM ---------------- 子过程 ----------------
:status_ports
for %%p in (8080 8081 8090 8092 6379) do (
  netstat -ano | findstr "LISTENING" | findstr ":%%p " >nul 2>&1
  if errorlevel 1 (
    echo   - %%p 未监听
  ) else (
    echo   OK %%p 在监听
  )
)
goto :eof

:wait_port
REM %1=端口  %2=名字  %3=最多等几秒
set /a WP_I=0
:wp_loop
curl -s -o nul --max-time 1 http://127.0.0.1:%~1/ >nul 2>&1
if not errorlevel 1 (
  echo   OK %~2 :%~1 就绪
  goto :eof
)
set /a WP_I+=1
if %WP_I% geq %~3 (
  echo   !! %~2 :%~1 在 %~3 秒内未就绪 —— 看那个后端窗口的输出
  goto :eof
)
timeout /t 1 /nobreak >nul
goto :wp_loop
