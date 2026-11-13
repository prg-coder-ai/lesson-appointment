@echo off
REM %~dp0 = 本 bat 所在目录(doc-develop\)，仓库迁盘后无需改这里
java -jar "%~dp0..\api\target\booking-api-2.0.2.jar" %*
