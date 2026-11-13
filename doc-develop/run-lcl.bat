@echo off
REM %~dp0 = 本 bat 所在目录(doc-develop\)，仓库迁盘后无需改这里
node "%~dp0dev-frontend-local.js" %*
