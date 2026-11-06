@echo off
chcp 65001 >nul
REM ============================================================
REM  本地一键启动两个后端（Windows）
REM    booking_api        -> 127.0.0.1:8081
REM    message-service    -> 127.0.0.1:8090
REM  两个 jar 使用源码 application.properties 里同一套 jwt.secret，
REM  属于同一密钥域，可正常联调（不可一个本地一个远程混连）。
REM  停掉：在各自窗口 Ctrl+C，或 taskkill /F /IM java.exe
REM
REM  【2026-11-05】jar 优先取 deploy\jars（构建脚本统一收口），回退各模块 target；
REM  版本用通配 /o-d 取最新一个，不再写死 2.0.0/1.0.0（那两个文件实际不存在）。
REM ============================================================
set ROOT=%~dp0..\..
set "BK_JAR="
set "MS_JAR="

for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\deploy\jars\booking-api-*.jar" 2^>nul') do if not defined BK_JAR set "BK_JAR=%ROOT%\deploy\jars\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\api\target\booking-api-*.jar" 2^>nul') do if not defined BK_JAR set "BK_JAR=%ROOT%\api\target\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\deploy\jars\message-service-*.jar" 2^>nul') do if not defined MS_JAR set "MS_JAR=%ROOT%\deploy\jars\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\api\message-service\target\message-service-*.jar" 2^>nul') do if not defined MS_JAR set "MS_JAR=%ROOT%\api\message-service\target\%%F"

if not defined BK_JAR echo [X] 找不到 booking jar ，请先跑 deploy\build-backends.sh & pause & exit /b 1
if not defined MS_JAR echo [X] 找不到 message-service jar ，请先跑 deploy\build-backends.sh & pause & exit /b 1
echo booking  ^<- %BK_JAR%
echo message  ^<- %MS_JAR%

start "booking-8081"      java -jar "%BK_JAR%" --server.port=8081
start "message-8090"      java -jar "%MS_JAR%" --server.port=8090

echo.
echo 两个后端正在启动，请等待约 20 秒后验证：
echo   curl http://127.0.0.1:8081/
echo   curl http://127.0.0.1:8090/
echo 然后另开窗口启动前端：node doc-develop\dev-frontend-local-src.js
pause
