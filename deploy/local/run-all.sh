#!/bin/bash
# ============================================================
#  本地开发【一条命令起全套】—— 三个后端 + 前端开发代理
#
#  用法：
#    bash deploy/local/run-all.sh              # 起三后端(后台) + 前端代理(前台占用当前终端)
#    bash deploy/local/run-all.sh stop         # 前后端全停
#    bash deploy/local/run-all.sh status       # 只看四个端口在不在
#
#  常用环境变量（都可组合）：
#    SKIP_CLASSROOM=1   不起课堂 8092（没有 Redis / 只调预约与消息时）
#    BACKEND_ONLY=1     只起后端，不起前端
#    FRONTEND_ONLY=1    只起前端（后端假定已在跑，不复用启动逻辑）
#    DIST=1             前端改伺服 frontend/dist 构建产物（默认源码直出）
#    DEV_PORT=8080      前端代理端口
#
#  它做的事：
#    1) 调 start-backend-local.sh 起后端（那个脚本自带"端口已占用就跳过"，可重复执行）
#    2) 轮询探活 8081 / 8090（课堂在监听时探 8092），就绪才继续 —— 避免前端代理
#       启动时的连通性检查全是 ❌，让人误以为后端没起来
#    3) 前台跑 node doc-develop/dev-frontend-local-src.js（Ctrl+C 停前端；后端留在后台）
#
#  为什么不重复写一遍启动逻辑：jar 通配、端口占用判断、课堂可选这些规则只应有一份，
#  复制到 run-all 里迟早会与 start-backend-local 走偏（2026-10-30 的 jar 名写死事故
#  就是同一个教训）。
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/deploy/local/start-backend-local.sh"
DEV_DIR="$ROOT/doc-develop"
ACTION="${1:-start}"

is_busy() { netstat -ano 2>/dev/null | grep -E ":$1[[:space:]]" | grep -q 'LISTENING'; }

# 轮询 HTTP 根路径，就绪返回 0；超时返回 1（不中断脚本，调用方自己 || true）
wait_http() {
  local port="$1" label="$2" max="${3:-60}" i=0
  while [ "$i" -lt "$max" ]; do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/"; then
      printf '  ✓ %s :%s 就绪\n' "$label" "$port"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  printf '  ✗ %s :%s 在 %s 秒内未就绪 —— 看日志：/tmp/%s.log\n' "$label" "$port" "$max" "$label"
  return 1
}

do_status() {
  echo "端口状态（LISTENING 才算在跑）："
  local p label
  for pair in "8080:前端代理" "8081:booking" "8090:message-service" "8092:classroom"; do
    p="${pair%%:*}"; label="${pair#*:}"
    if is_busy "$p"; then
      echo "  ✓ $p  $label"
    else
      echo "  - $p  $label（未启动）"
    fi
  done
  if ! is_busy 6379; then
    echo "  - 6379  Redis（未启动 → 课堂 8092 起不来，其余不受影响）"
  fi
}

do_stop() {
  echo "停止前端代理……"
  pkill -f 'dev-frontend.*\.js' 2>/dev/null || true
  echo "停止后端……"
  bash "$BACKEND" stop
  echo
  do_status
}

do_start() {
  # 前端端口预检查放在最前面：否则会先把后端全起来、再在前端这步报错退出
  # （已有代理在跑多半是之前手动起的，再起一个只会 EADDRINUSE 崩掉）
  local dev_port="${DEV_PORT:-8080}"
  if [ "${BACKEND_ONLY:-0}" != "1" ] && is_busy "$dev_port"; then
    echo "[X] 前端代理端口 $dev_port 已被占用 —— 已有实例在跑，不必再起。"
    echo "    查是谁在用：bash deploy/local/run-all.sh status"
    echo "    要停掉它：  bash deploy/local/run-all.sh stop"
    echo "    要换端口：  DEV_PORT=8099 bash deploy/local/run-all.sh   （避开 8081/8090/8092 后端端口）"
    exit 1
  fi

  if [ "${FRONTEND_ONLY:-0}" != "1" ]; then
    bash "$BACKEND"
    echo
    echo "等待后端就绪（首次启动约 15–30 秒，别急着关窗口）："
    wait_http 8081 booking   90 || true
    wait_http 8090 message   90 || true
    # 课堂只有真的在监听时才等：没产物或 SKIP_CLASSROOM=1 时它不会起来，等了也没意义
    if is_busy 8092; then
      wait_http 8092 classroom 60 || true
    else
      echo "  - classroom :8092 未启动（不影响预约与消息）"
    fi
    echo
  else
    echo "FRONTEND_ONLY=1：假定后端已在运行，跳过后端启动"
    echo
  fi

  if [ "${BACKEND_ONLY:-0}" = "1" ]; then
    echo "BACKEND_ONLY=1：只起后端。前端另开：node doc-develop/dev-frontend-local-src.js"
    exit 0
  fi

  local front_js
  if [ "${DIST:-0}" = "1" ]; then
    front_js="$DEV_DIR/dev-frontend-local.js"
    echo "模式：伺服 frontend/dist 构建产物（DIST=1）"
  else
    front_js="$DEV_DIR/dev-frontend-local-src.js"
    echo "模式：源码直出（改完 js/html/css 刷新浏览器即生效，无需 build）"
  fi
  [ -f "$front_js" ] || { echo "[X] 找不到 $front_js"; exit 1; }

  echo "启动前端代理：${front_js##*/}"
  echo "  Ctrl+C 停前端；后端留在后台 → 全停用 bash deploy/local/run-all.sh stop"
  echo
  node "$front_js"
  echo
  echo "前端代理已退出。后端仍在后台运行（bash deploy/local/run-all.sh stop 可一并停掉）。"
}

case "$ACTION" in
  start)  do_start  ;;
  stop)   do_stop   ;;
  status) do_status ;;
  *)
    echo "用法：bash deploy/local/run-all.sh [start|stop|status]"
    echo "  start   起三后端 + 前端代理（默认）"
    echo "  stop    前后端全停"
    echo "  status  只看端口状态"
    exit 1
    ;;
esac
