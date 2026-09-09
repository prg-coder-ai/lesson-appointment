#!/bin/bash
# ============================================================
#  本地一键启动两个后端（Linux / macOS / Git Bash）
#    booking_api      -> 127.0.0.1:8081
#    message-service  -> 127.0.0.1:8090
#  用法：bash deploy/local/start-backend-local.sh
#  停止：pkill -f 'booking_api-2.0.0.jar' ; pkill -f 'message-service-1.0.0.jar'
# ============================================================
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BK_JAR="$ROOT/api/target/booking_api-2.0.0.jar"
MS_JAR="$ROOT/api/message-service/target/message-service-1.0.0.jar"

[ -f "$BK_JAR" ] || { echo "[X] 找不到 $BK_JAR，请先构建"; exit 1; }
[ -f "$MS_JAR" ] || { echo "[X] 找不到 $MS_JAR，请先构建"; exit 1; }

nohup java -jar "$BK_JAR" --server.port=8081 > /tmp/booking.log 2>&1 &
nohup java -jar "$MS_JAR" --server.port=8090 > /tmp/message.log 2>&1 &

echo "已后台启动，日志：/tmp/booking.log  /tmp/message.log"
echo "验证：curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/ http://127.0.0.1:8090/"
