@echo off
chcp 65001 >nul
REM 前端启动器 —— 连接【服务器（远程）API】
REM 当前部署：服务器后端端口已收紧（只放 80/443），故统一走远程 80，由远程 Nginx 分流：
REM   浏览器 -> http://localhost:8080（本代理）
REM             └─ /api/v1/*（含 message/sse/users） -> 152.136.254.127:80
REM 早期部署（后端端口对外放行）用： set BOOKING_PORT=8081 & set MSG_PORT=8090
REM 注意：远程 booking 与远程 message-service 共用系统 jwt 密钥，两端必须都指远程；
REM       不要只把 message-service 指向本地，否则跨服务 token 验签失败（401）。
REM 可覆盖： set DEV_PORT=8080 / set API_HOST=1.2.3.4 / set DIST=1
cd /d %~dp0
node dev-frontend-remote.js
pause
