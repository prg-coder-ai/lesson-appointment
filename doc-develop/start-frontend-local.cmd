@echo off
chcp 65001 >nul
REM 前端启动器 —— 连接【本地 API】
REM   /api/v1/*                    -> 127.0.0.1:8081  本地 booking_api
REM   /api/v1/{message,sse,users/} -> 127.0.0.1:8090  本地 message-service
REM 启动前请确认两个后端已在本地运行（密钥同源）。
REM 可覆盖： set DEV_PORT=8080 / set API_HOST=127.0.0.1 / set MSG_HOST=127.0.0.1 / set DIST=1
cd /d %~dp0
node dev-frontend-local.js
pause
