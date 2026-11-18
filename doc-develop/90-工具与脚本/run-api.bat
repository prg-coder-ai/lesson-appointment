@echo off
REM %~dp0 = 本 bat 所在目录(doc-develop\90-工具与脚本\)
setlocal
set "JAR="
for /f "delims=" %%F in ('dir /b /o-d "%~dp0..\..\deploy\jars\booking-api-*.jar" 2^>nul') do if not defined JAR set "JAR=%~dp0..\..\deploy\jars\%%F"
if not defined JAR (
  for /f "delims=" %%F in ('dir /b /o-d "%~dp0..\..\api\target\booking-api-*.jar" 2^>nul') do if not defined JAR set "JAR=%~dp0..\..\api\target\%%F"
)
if not defined JAR (
  echo [X] 找不到 booking-api jar，请先跑 bash deploy/build-backends.sh
  exit /b 1
)
java -jar "%JAR%" %*
