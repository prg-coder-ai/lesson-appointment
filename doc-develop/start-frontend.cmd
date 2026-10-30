@echo off
REM 本地前端启动器（Windows CMD）
REM 以远程 API 服务器 152.136.254.127 为目标运行本地前端
REM 默认监听 8080（与前端 FRONTEND_ORIGIN 默认端口一致，登录后跳转闭环）
REM 如需自定义，先 set 环境变量再执行，例如：
REM   set API_HOST=1.2.3.4
REM   set DEV_PORT=8080
cd /d %~dp0
node dev-frontend.js
pause
