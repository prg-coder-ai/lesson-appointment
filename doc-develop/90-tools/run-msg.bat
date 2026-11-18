@echo off
REM %~dp0 = 本 bat 所在目录(doc-develop\90-tools\)
REM 2026-11-18 修复：原文件内容被一段微信云代码覆盖，message-service 根本起不来。
setlocal
set "JAR="
for /f "delims=" %%F in ('dir /b /o-d "%~dp0..\..\deploy\jars\message-service-*.jar" 2^>nul') do if not defined JAR set "JAR=%~dp0..\..\deploy\jars\%%F"
if not defined JAR (
  for /f "delims=" %%F in ('dir /b /o-d "%~dp0..\..\api\message-service\target\message-service-*.jar" 2^>nul') do if not defined JAR set "JAR=%~dp0..\..\api\message-service\target\%%F"
)
if not defined JAR (
  echo [X] 找不到 message-service jar，请先跑 bash deploy/build-backends.sh
  exit /b 1
)
java -jar "%JAR%" %*
