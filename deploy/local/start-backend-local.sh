#!/bin/bash
# ============================================================
#  本地一键启动两个后端（Linux / macOS / Git Bash）
#    booking_api      -> 127.0.0.1:8081
#    message-service  -> 127.0.0.1:8090
#  用法：bash deploy/local/start-backend-local.sh
#  停止：pkill -f 'booking-api-.*\.jar' ; pkill -f 'message-service-.*\.jar'
#
# 【2026-11-05】jar 从 deploy/jars/ 取（构建脚本统一收口），回退各模块 target/。
#  版本用通配匹配，不再写死 2.0.0/1.0.0 —— 原来那两个文件名在仓库里根本不存在，
#  脚本必然报「找不到 jar，请先构建」。
# ============================================================
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

BK_JAR="$(ls -1 "$ROOT"/deploy/jars/booking-api-*.jar 2>/dev/null | head -1)"
[ -z "$BK_JAR" ] && BK_JAR="$(ls -1 "$ROOT"/api/target/booking-api-*.jar 2>/dev/null | head -1)"
MS_JAR="$(ls -1 "$ROOT"/deploy/jars/message-service-*.jar 2>/dev/null | head -1)"
[ -z "$MS_JAR" ] && MS_JAR="$(ls -1 "$ROOT"/api/message-service/target/message-service-*.jar 2>/dev/null | head -1)"

[ -n "$BK_JAR" ] && [ -f "$BK_JAR" ] || { echo "[X] 找不到 booking jar，请先跑 bash deploy/build-backends.sh"; exit 1; }
[ -n "$MS_JAR" ] && [ -f "$MS_JAR" ] || { echo "[X] 找不到 message-service jar，请先跑 bash deploy/build-backends.sh"; exit 1; }
echo "booking  <- $BK_JAR"
echo "message  <- $MS_JAR"

nohup java -jar "$BK_JAR" --server.port=8081 > /tmp/booking.log 2>&1 &
nohup java -jar "$MS_JAR" --server.port=8090 > /tmp/message.log 2>&1 &

echo "已后台启动，日志：/tmp/booking.log  /tmp/message.log"
echo "验证：curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/ http://127.0.0.1:8090/"
