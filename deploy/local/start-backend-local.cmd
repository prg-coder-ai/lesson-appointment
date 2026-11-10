@echo off
chcp 65001 >nul
REM ============================================================
REM  本地一键启动后端（Windows）
REM    booking_api       -> 127.0.0.1:8081
REM    message-service   -> 127.0.0.1:8090
REM    classroom-service -> 127.0.0.1:8092  （可选：需 classroom 库 + Redis db2）
REM
REM  用法：
REM    start-backend-local.cmd             双击/命令行都行，三个窗口独立
REM    start-backend-local.cmd nopause     不暂停（给 run-all.cmd 调用，失败了直接 exit /b 1）
REM
REM  三个 jar 使用源码 application.properties 里同一套 jwt.secret，
REM  属于同一密钥域，可正常联调（不可一个本地一个远程混连）。
REM  本地一键启动后端（三个服务）
REM    booking_api       -> 127.0.0.1:8081
REM    message-service   -> 127.0.0.1:8090
REM    classroom-service -> 127.0.0.1:8092（可选）
REM  停掉：关闭对应窗口，或 taskkill /F /IM java.exe
REM  前端代理另开窗口：node doc-develop\dev-frontend-local-src.js
REM  一条命令起全套：deploy\local\run-all.cmd
REM
REM  产物来源（2026-11-05）：优先 deploy\jars（构建脚本统一收口），回退各模块 target；
REM  版本用通配 /o-d 取最新一个，不写死 2.0.0/1.0.0（那两个文件实际不存在）。
REM
REM  变更记录：
REM   2026-10-30 ① jar 名改通配（原写死 booking_api-2.0.0.jar，实际产物已到 2.2.0
REM              → 会报"找不到 jar"）；② 补上课堂 8092。
REM   2026-10-31 ③ 起之前查端口，已占用就跳过（重复执行不再互相踩端口）；
REM              ④ 新增 nopause 参数，供 run-all.cmd 复用启动逻辑。
REM   2026-11-05 ⑤ 优先 deploy\jars，回退 target。
REM   2026-11-10 ⑥ 合并 eClassroom 分支：三服务 + deploy\jars 双来源并存。
REM ============================================================
set ROOT=%~dp0..\..
set NP=0
if /i "%~1"=="nopause" set NP=1

REM %%~F 是"去掉引号的路径"，否则带引号 → java -jar ""..."" 会报错
set "BK_JAR="
set "MS_JAR="
set "CLS_JAR="

for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\deploy\jars\booking-api-*.jar" 2^>nul') do if not defined BK_JAR set "BK_JAR=%ROOT%\deploy\jars\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\api\target\booking-api-*.jar" 2^>nul') do if not defined BK_JAR set "BK_JAR=%ROOT%\api\target\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\deploy\jars\message-service-*.jar" 2^>nul') do if not defined MS_JAR set "MS_JAR=%ROOT%\deploy\jars\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\api\message-service\target\message-service-*.jar" 2^>nul') do if not defined MS_JAR set "MS_JAR=%ROOT%\api\message-service\target\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\deploy\jars\classroom-service-*.jar" 2^>nul') do if not defined CLS_JAR set "CLS_JAR=%ROOT%\deploy\jars\%%F"
for /f "delims=" %%F in ('dir /b /o-d "%ROOT%\api\classroom-service\target\classroom-service-*.jar" 2^>nul') do if not defined CLS_JAR set "CLS_JAR=%ROOT%\api\classroom-service\target\%%F"

if not defined BK_JAR echo [X] 找不到 booking jar，请先跑 deploy\build-backends.sh & pause & exit /b 1
if not defined MS_JAR echo [X] 找不到 message-service jar，请先跑 deploy\build-backends.sh & pause & exit /b 1
echo booking   ^<- %BK_JAR%
echo message   ^<- %MS_JAR%
if defined CLS_JAR (echo classroom ^<- %CLS_JAR%) else (echo classroom ^<- 未找到（跳过，不影响预约/消息）)

if not defined BK_JAR (
  echo [X] 找不到 api\target\booking-api-*.jar ，请先在 api 目录执行 mvn package
  if "%NP%"=="0" pause
  exit /b 1
)
if not defined MS_JAR (
  echo [X] 找不到 api\message-service\target\message-service-*.jar ，请先在 api\message-service 目录执行 mvn package
  if "%NP%"=="0" pause
  exit /b 1
)

REM 端口占用检查：已占用就跳过，避免"窗口一闪而过"的伪启动
set BUSY8081=
set BUSY8090=
set BUSY8092=
netstat -ano | findstr "LISTENING" | findstr ":8081 " >nul 2>&1 && set BUSY8081=1
netstat -ano | findstr "LISTENING" | findstr ":8090 " >nul 2>&1 && set BUSY8090=1
netstat -ano | findstr "LISTENING" | findstr ":8092 " >nul 2>&1 && set BUSY8092=1

echo 启动后端：
if defined BUSY8081 (
  echo   ~ booking 8081 已在运行，跳过
) else (
  start "booking-8081" java -jar "%BK_JAR%" --server.port=8081
  echo   + booking 8081 已开窗口
)
if defined BUSY8090 (
  echo   ~ message-service 8090 已在运行，跳过
) else (
  start "message-8090" java -jar "%MS_JAR%" --server.port=8090
  echo   + message-service 8090 已开窗口
)
if defined CLS_JAR (
  if defined BUSY8092 (
    echo   ~ classroom 8092 已在运行，跳过
  ) else (
    start "classroom-8092" java -jar "%CLS_JAR%" --server.port=8092
    echo   + classroom 8092 已开窗口（另需 Redis db2 + classroom 库）
  )
) else (
  echo   - 跳过课堂：未找到 classroom-service 产物
)

echo.
if "%NP%"=="1" goto :eof
echo 后端正在启动，请等待约 20 秒后验证：
echo   curl http://127.0.0.1:8081/
echo   curl http://127.0.0.1:8090/
echo   curl http://127.0.0.1:8092/api/v1/rtc/providers
echo 然后另开窗口启动前端：node doc-develop\dev-frontend-local-src.js
echo （或直接用 run-all.cmd，后端 + 前端一条命令）
pause
