#!/usr/bin/env bash
# ============================================================================
# 本地消息中心联调一键启动脚本
# ----------------------------------------------------------------------------
# 用途：本地同时拉起 message-service(:8090) 与 dev 代理(:8080)
#        - message-service 走本地 127.0.0.1
#        - booking 仍走远程 API_HOST(默认 152.136.254.127:8081)
# 使用：bash doc-develop/start-local-msg.sh
#
# 重要坑位：本沙箱/部分环境存在 SERVER__PORT 环境变量(=55058)，会被 Spring Boot
#           宽松绑定覆盖 server.port，导致 message-service 去绑 55058 撞 IDE 而退出。
#           因此 message-service 必须显式带 --server.port=8090 (CLI 参数优先级最高)。
# ============================================================================
set -u

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MSG_JAR="$BASE_DIR/api/message-service/target/message-service-1.0.0.jar"
DEV_DIR="$BASE_DIR/doc-develop"
API_HOST="${API_HOST:-152.136.254.127}"

echo "==> 项目根: $BASE_DIR"

# ---- 0) 前置检查 ----
if [ ! -f "$MSG_JAR" ]; then
  echo "✗ 未找到 $MSG_JAR，请先在 api/message-service 执行 mvn package" >&2
  exit 1
fi
if [ ! -d "$DEV_DIR" ]; then
  echo "✗ 未找到 $DEV_DIR" >&2
  exit 1
fi

# ---- 1) 清理已有 8080(dev 代理) / 本地 8090(message-service) ----
echo "==> 清理占用 8080 的 dev 代理与本地 message-service ..."
powershell -NoProfile -Command '
$ErrorActionPreference="SilentlyContinue"
$p8080=(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if($p8080){ Stop-Process -Id $p8080 -Force }
$p8090=(Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if($p8090){
  $c=Get-CimInstance Win32_Process -Filter "ProcessId=$p8090" -ErrorAction SilentlyContinue
  if($c -and $c.CommandLine -like "*message-service-1.0.0.jar*"){ Stop-Process -Id $p8090 -Force }
}
Start-Sleep -Seconds 1
'
echo "    已清理"

# ---- 2) 启动 message-service(强制 8090，绕开 SERVER__PORT 覆盖) ----
echo "==> 启动 message-service (--server.port=8090) ..."
cd "$BASE_DIR/api/message-service/target"
nohup java -jar message-service-1.0.0.jar --server.port=8090 > "$DEV_DIR/msg_svc.log" 2>&1 &
MSG_PID=$!
echo "    message-service PID=$MSG_PID, 日志: $DEV_DIR/msg_svc.log"

# ---- 3) 启动 dev 代理(消息走本地 127.0.0.1, booking 走远程) ----
echo "==> 启动 dev 代理 (MSG_HOST=127.0.0.1, 监听 :8080) ..."
cd "$DEV_DIR"
MSG_HOST=127.0.0.1 nohup node dev-frontend.js > "$DEV_DIR/dev_frontend.log" 2>&1 &
DEV_PID=$!
echo "    dev-frontend PID=$DEV_PID, 日志: $DEV_DIR/dev_frontend.log"

# ---- 4) 等待 message-service 就绪 ----
echo "==> 等待 message-service 就绪(最多 30s) ..."
READY=0
for i in $(seq 1 30); do
  if powershell -NoProfile -Command '(Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue)' >/dev/null 2>&1; then
    READY=1
    echo "    ✔ 8090 已监听"
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "    ✗ 30s 内 8090 未就绪，请查 $DEV_DIR/msg_svc.log"
fi

# ---- 5) 冒烟: 经代理 8080 打 send 应返回鉴权类状态码(链路通) ----
echo "==> 链路冒烟(经 localhost:8080) ..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/v1/messages/send \
  -H "Content-Type: application/json" -d '{"title":"t","content":"c","recipientUserIds":["u1"],"broadcast":false}' 2>/dev/null)
echo "    POST /api/v1/messages/send -> HTTP ${CODE:-无响应}(401/403=链路已通, 仅缺登录态)"

echo ""
echo "==> 完成。浏览器打开 http://localhost:8080 登录后即可测试发送消息。"
echo "    停止: 终止 PID $MSG_PID (message-service) 与 $DEV_PID (dev 代理)"
