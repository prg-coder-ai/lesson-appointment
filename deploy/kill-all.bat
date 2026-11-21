@echo off
chcp 65001 >nul 2>&1
rem ============================================================================
rem kill-all.bat - 清理本地开发端口占用（Windows cmd）
rem
rem 终止占用 8080 / 8081 / 8090 / 8092 的进程：
rem   8080  前端开发代理（node dev-frontend-local.js，HTTPS）
rem   8081  booking-api        预约主服务
rem   8090  message-service    消息中心
rem   8092  classroom-service  在线课堂
rem
rem 用法：
rem   kill-all.bat            列出占用，确认后终止
rem   kill-all.bat /y         不确认，直接终止（脚本调用 / 无人值守用）
rem   kill-all.bat /n         只列出，不终止（排查用，无任何副作用）
rem   kill-all.bat /h         显示帮助
rem
rem 为什么需要它（2026-11-21 真实故障）：
rem   8080 的 node 前端代理会"假死"：端口仍 LISTENING、TCP 能连上，但任何请求
rem   （http/https）都不回一个字节，直到客户端超时；进程 CPU 停在启动时的水平
rem   不再增长。成因通常是控制台窗口被选中文本 / 按了 Ctrl+S，导致 node 的
rem   console.log 同步写阻塞，V8 事件循环整体停摆。
rem   这种状态下 Ctrl+C 常常没反应，只能按 PID 强杀 —— 而手敲 netstat -ano +
rem   taskkill 极易看错列（PID 在最后一列，和进程名对不上），本脚本一次扫描、
rem   打出进程名、二次确认。
rem
rem 实现要点：
rem   1. 只看 LISTENING 的本地监听，不碰 ESTABLISHED 的对端连接（避免误伤
rem      浏览器或其他客户端）。
rem   2. 同一 PID 占多个端口（IPv4 + IPv6 双栈各一条）只杀一次。
rem   3. 先把 netstat 结果落盘，再用 findstr 逐端口过滤 —— 嵌套管道里的引号
rem      转义在 cmd 下极易写错，落盘后就没这个问题。
rem   4. 杀之前用 tasklist 打出进程名，让你看清要杀的是谁再决定。
rem   5. 杀完复查端口，仍有占用会报出来（多半是权限不足，用管理员身份重跑）。
rem   6. 跳过 PID 0 / 4（System Idle Process / System），这两个不可能监听端口，
rem      一旦出现说明 netstat 输出格式变了，宁可跳过也不要盲杀。
rem
rem 本文件以 UTF-8（无 BOM）+ CRLF 保存，第 2 行 chcp 65001 把控制台切到 UTF-8，
rem 因此编辑器 / Git / 预览面板里都不会显示乱码。改本文件时务必保持三点：
rem   ① UTF-8 且【无 BOM】—— 有 BOM 会让首行 @echo off 被读成乱命令并报错；
rem   ② CRLF 换行 —— 纯 LF 会让 goto 跳转标签的解析出问题（不报错，只跳错）；
rem   ③ 保留第 2 行 chcp 65001 —— 去掉它，中文提示在 GBK(936) 控制台仍是乱码。
rem 与 deploy/local/*.cmd 的写法保持一致。
rem ============================================================================

setlocal enabledelayedexpansion

set "PORTS=8080 8081 8090 8092"
set "ASSUME_YES=0"
set "DRYRUN=0"

rem ---------------------------------------------------------------- 参数解析
:parse
if "%~1"=="" goto :args_done
if /i "%~1"=="/y"        ( set "ASSUME_YES=1" & shift & goto :parse )
if /i "%~1"=="-y"        ( set "ASSUME_YES=1" & shift & goto :parse )
if /i "%~1"=="--yes"     ( set "ASSUME_YES=1" & shift & goto :parse )
if /i "%~1"=="/n"        ( set "DRYRUN=1" & shift & goto :parse )
if /i "%~1"=="-n"        ( set "DRYRUN=1" & shift & goto :parse )
if /i "%~1"=="--dry-run" ( set "DRYRUN=1" & shift & goto :parse )
if /i "%~1"=="/h"        goto :usage
if /i "%~1"=="--help"    goto :usage
echo.
echo   [ERR] 未知参数：%~1
goto :usage

:usage
echo.
echo   用法：kill-all.bat [选项]
echo.
echo     （无选项）  列出占用，确认后终止
echo     /y          不确认，直接终止
echo     /n          只列出，不终止
echo     /h          显示本帮助
echo.
echo   终止范围：端口 %PORTS% 上的 LISTENING 进程
echo.
pause
exit /b 1

:args_done

echo.
echo ============================================================
echo   本地开发端口清理
echo   目标端口：%PORTS%
if "%DRYRUN%"=="1" echo   模式：只列出（/n），不会终止任何进程
echo ============================================================

rem ---------------------------------------------------------------- 扫描端口
set "TMPF=%TEMP%\kill-all-ports-%RANDOM%.txt"
netstat -ano -p TCP 2>nul | findstr "LISTENING" > "%TMPF%"
if not exist "%TMPF%" (
    echo.
    echo   [ERR] 无法生成 netstat 快照，请确认在 Windows 的 cmd 里运行本脚本。
    goto :die
)

rem 一次遍历：收集去重后的 PID 列表（用于后面统一终止）
set "PIDLIST="
for %%P in (%PORTS%) do (
    for /f "tokens=5" %%A in ('findstr /c:":%%P " "%TMPF%"') do (
        if not "%%A"=="0" if not "%%A"=="4" (
            if not defined SEEN_%%A (
                set "SEEN_%%A=1"
                set "PIDLIST=!PIDLIST! %%A"
            )
        )
    )
)

if not defined PIDLIST (
    echo.
    echo   目标端口全部空闲，无需清理。
    goto :finish
)

rem 第二次遍历：按端口打印占用明细（同一端口双栈的两个 PID 相同，只显示一次）
echo.
echo ==^> 占用清单
echo.
for %%P in (%PORTS%) do (
    for /f "tokens=5" %%A in ('findstr /c:":%%P " "%TMPF%"') do (
        if not defined SHOW_%%P_%%A (
            set "SHOW_%%P_%%A=1"
            set "PNAME=?"
            for /f "tokens=1 delims=," %%B in ('tasklist /fi "PID eq %%A" /fo csv /nh 2^>nul') do (
                set "PNAME=%%~B"
            )
            echo   端口 %%P  ^<-  PID %%A  !PNAME!
        )
    )
)

if "%DRYRUN%"=="1" (
    echo.
    echo   [DRY] 仅列出，未终止任何进程。去掉 /n 参数才会真的杀。
    goto :finish
)

rem ---------------------------------------------------------------- 二次确认
if "%ASSUME_YES%"=="0" (
    set "ANS="
    set /p "ANS=  确认终止以上进程？(y=终止 / 其他=取消) "
    if /i not "!ANS!"=="y" if /i not "!ANS!"=="yes" (
        echo.
        echo   已取消，未做任何改动。
        goto :finish
    )
)

rem ---------------------------------------------------------------- 终止
echo.
echo ==^> 终止进程
for %%A in (!PIDLIST!) do (
    taskkill /f /pid %%A >nul 2>&1
    if errorlevel 1 (
        echo   [WARN] PID %%A 终止失败（可能已自行退出，或需要管理员权限）
    ) else (
        echo   [OK]   PID %%A 已终止
    )
)

rem ---------------------------------------------------------------- 复查
echo.
echo ==^> 复查端口
del "%TMPF%" >nul 2>&1
netstat -ano -p TCP 2>nul | findstr "LISTENING" > "%TMPF%"
set "LEFT=0"
for %%P in (%PORTS%) do (
    findstr /c:":%%P " "%TMPF%" >nul 2>&1
    if errorlevel 1 (
        echo   [OK]   %%P 已释放
    ) else (
        echo   [WARN] %%P 仍被占用，请用管理员身份重跑本脚本
        set "LEFT=1"
    )
)

if "!LEFT!"=="1" (
    echo.
    echo   [ERR] 仍有端口未释放，见上面的 [WARN]。
    goto :die
)

echo.
echo ------------------------------------------------------------
echo  清理完成。重新启动服务：
echo    前端    doc-develop\90-tools\start-frontend-local.cmd
echo    后端    deploy\run-all.bat
echo.
echo  若 8080 再次“端口在听、页面打不开”：不要在 cmd 窗口里拖选文本，
echo  也不要按 Ctrl+S，两者都会把 node 的输出写阻塞住。
echo  （或在 cmd 窗口属性里取消“快速编辑模式”，一劳永逸）
echo ------------------------------------------------------------
goto :finish

rem ---------------------------------------------------------------- 收尾
:finish
del "%TMPF%" >nul 2>&1
endlocal
echo %CMDCMDLINE% | findstr /i /c:"%~nx0" >nul
if not errorlevel 1 pause
exit /b 0

:die
del "%TMPF%" >nul 2>&1
endlocal
echo %CMDCMDLINE% | findstr /i /c:"%~nx0" >nul
if not errorlevel 1 pause
exit /b 1
