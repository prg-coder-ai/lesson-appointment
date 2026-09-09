@echo off
chcp 65001 >nul
REM 前端启动器 —— 连接【服务器（远程）API】
REM   /api/v1/*                    -> 152.136.254.127:8081  远程 booking_api
REM   /api/v1/{message,sse,users/} -> 152.136.254.127:8090  远程 message-service
REM 注意：远程 booking 与远程 message-service 共用系统 jwt 密钥，两端必须都指远程；
REM       不要只把 message-service 指向本地，否则跨服务 token 验签失败（401）。
REM 可覆盖： set DEV_PORT=8080 / set API_HOST=1.2.3.4 / set DIST=1
cd /d %~dp0
node dev-frontend-remote.js
pause
