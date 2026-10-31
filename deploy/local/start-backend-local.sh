#!/bin/bash
# ============================================================
#  本地一键启动后端（Linux / macOS / Git Bash）
#    booking_api       -> 127.0.0.1:8081
#    message-service   -> 127.0.0.1:8090
#    classroom-service -> 127.0.0.1:8092   （可选：需 classroom 库 + Redis db2）
#
#  用法：
#    bash deploy/local/start-backend-local.sh                    # 能起的都起
#    SKIP_CLASSROOM=1 bash deploy/local/start-backend-local.sh   # 不起课堂
#    bash deploy/local/start-backend-local.sh stop               # 全停
#
#  本脚本只负责后端。前端代理要另开窗口：
#    node doc-develop/dev-frontend-local-src.js
#  想一条命令起全套（后端 + 前端）：bash deploy/local/run-all.sh
#
#  变更记录：
#   2026-10-30 ① jar 名改为通配（原写死 booking_api-2.0.0.jar，而实际产物已到 2.2.0
#              → 脚本直接报"找不到 jar"）；② 补上课堂 8092。
#   2026-10-31 ③ 起之前先查端口，已被占用就跳过并提示（重复执行/已被前人起过时
#              不再互相踩端口，也不会误报"启动成功"）。
#              ④ 去掉 set -e：探活类函数返回非 0 不该整脚本退出。
# ============================================================
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 通配取产物：版本号会变，写死必踩空
pick() { ls -1 $1 2>/dev/null | head -1; }
BK_JAR="$(pick "$ROOT/api/target/booking-api-*.jar")"
[ -z "$BK_JAR" ] && BK_JAR="$(pick "$ROOT/api/target/booking_api-*.jar")"
MS_JAR="$(pick "$ROOT/api/message-service/target/message-service-*.jar")"
CLS_JAR="$(pick "$ROOT/api/classroom-service/target/classroom-service-*.jar")"

# 端口是否已被监听（Windows Git Bash 的 netstat 也适用）
is_busy() { netstat -ano 2>/dev/null | grep -E ":$1[[:space:]]" | grep -q 'LISTENING'; }

if [ "${1:-}" = "stop" ]; then
  pkill -f 'booking-?api.*\.jar'      || true
  pkill -f 'message-service.*\.jar'   || true
  pkill -f 'classroom-service.*\.jar' || true
  echo "已停止后端（若还有残留：netstat -ano | grep -E '8081|8090|8092'）"
  exit 0
fi

[ -n "$BK_JAR" ] || { echo "[X] 找不到 booking 产物，请先在 api/ 执行 mvn package"; exit 1; }
[ -n "$MS_JAR" ] || { echo "[X] 找不到 message-service 产物，请先在 api/message-service/ 执行 mvn package"; exit 1; }

# 起一个服务：已占用则跳过，避免"起了但绑不上端口"的伪成功
start_one() {
  local port="$1" name="$2" jar="$3" log="$4"
  if is_busy "$port"; then
    echo "  ~ $name ($port) 已在运行，跳过"
    return 0
  fi
  nohup java -jar "$jar" --server.port="$port" > "$log" 2>&1 &
  echo "  + $name ($port) 后台启动 → $log"
}

echo "启动后端："
start_one 8081 booking          "$BK_JAR"  /tmp/booking.log
start_one 8090 message-service  "$MS_JAR"  /tmp/message.log

if [ -n "$CLS_JAR" ] && [ "${SKIP_CLASSROOM:-0}" != "1" ]; then
  start_one 8092 classroom "$CLS_JAR" /tmp/classroom.log
  echo "  ⚠ 课堂另需 Redis（db2）+ classroom 库；缺 Redis 时课堂会启动失败，不影响前两个"
else
  echo "  - 跳过课堂（未构建产物，或设了 SKIP_CLASSROOM=1）"
fi

echo
echo "等约 20 秒后验证："
echo "  curl -s -o /dev/null -w '8081 %{http_code}\\n' http://127.0.0.1:8081/"
echo "  curl -s -o /dev/null -w '8090 %{http_code}\\n' http://127.0.0.1:8090/"
echo "  curl -s http://127.0.0.1:8092/api/v1/rtc/providers    # 课堂媒体选型"
echo "然后另开窗口起前端：node doc-develop/dev-frontend-local-src.js"
