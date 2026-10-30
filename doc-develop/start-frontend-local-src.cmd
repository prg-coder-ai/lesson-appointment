@echo off
chcp 65001 >nul
REM ============================================================
REM  前端【源码直出】启动器 —— 不打包，直接伺服 frontend/ 源码
REM  接口全部走本机后端：
REM    /api/v1/*                    -> 127.0.0.1:8081  booking_api
REM    /api/v1/{message,sse,users/} -> 127.0.0.1:8090  message-service
REM  改完 js/html/css 直接刷新浏览器即可，无需 npm run build
REM ============================================================
cd /d %~dp0
node dev-frontend-local-src.js
pause
