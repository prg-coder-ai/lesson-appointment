#!/usr/bin/env bash
# 本地前端启动器（bash / Git Bash / WSL）
# 以远程 API 服务器 152.136.254.127 为目标运行本地前端
# 默认监听 8080（与前端 FRONTEND_ORIGIN 默认端口一致，登录后跳转闭环）
# 如需自定义： API_HOST=1.2.3.4 DEV_PORT=8080 bash start-frontend.sh
cd "$(dirname "$0")"
exec node dev-frontend.js
