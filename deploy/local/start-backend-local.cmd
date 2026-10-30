@echo off
chcp 65001 >nul
REM ============================================================
REM  本地一键启动两个后端（Windows）
REM    booking_api        -> 127.0.0.1:8081
REM    message-service    -> 127.0.0.1:8090
REM  两个 jar 使用源码 application.properties 里同一套 jwt.secret，
REM  属于同一密钥域，可正常联调（不可一个本地一个远程混连）。
REM  停掉：在各自窗口 Ctrl+C，或 taskkill /F /IM java.exe
REM ============================================================
set ROOT=%~dp0..\..
set BK_JAR=%ROOT%\api\target\booking_api-2.0.0.jar
set MS_JAR=%ROOT%\api\message-service\target\message-service-1.0.0.jar

if not exist "%BK_JAR%" echo [X] 找不到 %BK_JAR% ，请先构建 & pause & exit /b 1
if not exist "%MS_JAR%" echo [X] 找不到 %MS_JAR% ，请先构建 & pause & exit /b 1

start "booking-8081"      java -jar "%BK_JAR%" --server.port=8081
start "message-8090"      java -jar "%MS_JAR%" --server.port=8090

echo.
echo 两个后端正在启动，请等待约 20 秒后验证：
echo   curl http://127.0.0.1:8081/
echo   curl http://127.0.0.1:8090/
echo 然后另开窗口启动前端：node doc-develop\dev-frontend-local-src.js
pause
