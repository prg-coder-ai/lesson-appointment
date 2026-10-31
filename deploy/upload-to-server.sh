#!/bin/bash
# ============================================================
#  从本地把产物 + 配置文件一次性传到服务器（Git Bash / Linux 执行）
#  用法：
#    SERVER=root@1.2.3.4 bash deploy/upload-to-server.sh
#  说明：只传文件，不重启服务；传完按手册第 3 章手工执行重启。
#
#  2026-10-30：后端由 2 个服务扩到 3 个（新增 classroom-service）。
#  课堂产物是**可选**的 —— 没构建就跳过并告警，不阻断预约/消息的上线流程。
# ============================================================
set -e
SERVER=${SERVER:-root@1.2.3.4}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 版本号不写死：pom 里 <version> 会变，动态取 target 下最新的同名 jar
# （避免写死 1.0.0 而实际已是 1.0.1 导致传不上去）
BOOKING_JAR="$(ls -1 "$ROOT"/api/target/booking-api-*.jar 2>/dev/null | head -1)"
[ -z "$BOOKING_JAR" ] && BOOKING_JAR="$(ls -1 "$ROOT"/api/beforeRun/booking-api-*.jar 2>/dev/null | head -1)"
MSG_JAR="$(ls -1 "$ROOT"/api/message-service/target/message-service-*.jar 2>/dev/null | head -1)"
CLS_JAR="$(ls -1 "$ROOT"/api/classroom-service/target/classroom-service-*.jar 2>/dev/null | head -1)"
[ -n "$BOOKING_JAR" ] || { echo "找不到 booking 产物，请先在 api/ 执行 mvn package"; exit 1; }
[ -n "$MSG_JAR" ]     || { echo "找不到 message-service 产物，请先在 api/message-service/ 执行 mvn package"; exit 1; }

echo "==> 1/8 三个 jar（课堂可选）"
scp "$BOOKING_JAR" "$SERVER:/opt/lesson/booking_api.jar.new"
scp "$MSG_JAR"     "$SERVER:/opt/lesson/message-service.jar.new"
if [ -n "$CLS_JAR" ]; then
  scp "$CLS_JAR"   "$SERVER:/opt/lesson/classroom-service.jar.new"
else
  echo "   ⚠ 未找到课堂产物（api/classroom-service/target/classroom-service-*.jar），跳过课堂 jar"
fi

echo "==> 2/8 前端 dist（内容，不含 dist 这一层）"
rsync -av --delete "$ROOT/frontend/dist/" "$SERVER:/var/www/frontend/"

echo "==> 3/8 SQL 初始化脚本（三库；源目录是 api/sql/{schema,seed,patch}，不是 api/beforeRun/sql）"
# ⚠️ 历史坑：旧版脚本与旧手册都写 api/beforeRun/sql/，而**该目录并不存在** ——
#    rsync 源缺失会让 set -e 直接终止整个上传流程。这里统一指向真实位置，
#    并用 [ -d ] 保护，缺目录只告警不中断。
# 目标子目录要先建：rsync 只能创建最后一层，父目录不存在会失败。
ssh "$SERVER" 'sudo mkdir -p /opt/lesson/sql/schema /opt/lesson/sql/seed /opt/lesson/sql/patch /opt/lesson/sql/classroom' \
  || echo "   ⚠ 远程建目录失败，后续 rsync 可能报错"
for d in api/sql/schema api/sql/seed api/sql/patch; do
  if [ -d "$ROOT/$d" ]; then
    rsync -av "$ROOT/$d/" "$SERVER:/opt/lesson/sql/$(basename "$d")/"
  else
    echo "   ⚠ 缺少目录 $d，跳过"
  fi
done
# 课堂库结构自带 CREATE DATABASE classroom + USE，单独放 classroom/
if [ -d "$ROOT/api/classroom-service/sql" ]; then
  rsync -av "$ROOT/api/classroom-service/sql/" "$SERVER:/opt/lesson/sql/classroom/"
else
  echo "   ⚠ 缺少目录 api/classroom-service/sql，跳过课堂 SQL"
fi

echo "==> 4/8 systemd 单元 + env 模板（三个服务）"
scp "$ROOT/api/beforeRun/booking.service"         "$SERVER:/etc/systemd/system/booking.service"
scp "$ROOT/api/beforeRun/message-service.service" "$SERVER:/etc/systemd/system/message-service.service"
scp "$ROOT/api/beforeRun/classroom.service"       "$SERVER:/etc/systemd/system/classroom-service.service"
scp "$ROOT/api/beforeRun/booking.env.template"    "$SERVER:/opt/lesson/booking.env.template"
scp "$ROOT/api/beforeRun/message.env.template"    "$SERVER:/opt/lesson/message.env.template"
scp "$ROOT/api/beforeRun/classroom.env.template"  "$SERVER:/opt/lesson/classroom.env.template"

echo "==> 5/8 Nginx 配置 + 备份脚本 + logrotate"
scp "$ROOT/deploy/nginx/booking.conf"     "$SERVER:/etc/nginx/sites-available/booking"
scp "$ROOT/deploy/nginx/booking-ip.conf"  "$SERVER:/etc/nginx/sites-available/booking-ip"
scp "$ROOT/deploy/backup.sh"              "$SERVER:/opt/lesson/backup.sh"
scp "$ROOT/deploy/logrotate/lesson"       "$SERVER:/etc/logrotate.d/lesson"
scp "$ROOT/deploy/healthcheck.sh"         "$SERVER:/opt/lesson/healthcheck.sh"

echo "==> 6/8 日志目录 + 课堂存储目录 + logrotate 生效校验"
# 目录不建 → systemd 因 append: 打不开文件而启动失败；logrotate 不校验 → 真滚动那天才发现没生效。
# 课堂的 STORAGE_LOCAL_ROOT 默认 /opt/lesson/data/oss，属主必须是 lesson 才写得进讲稿/录制。
ssh "$SERVER" 'sudo mkdir -p /var/log/lesson/api /var/log/lesson/message /var/log/lesson/classroom /opt/lesson/data/oss && sudo chown -R lesson:lesson /var/log/lesson /opt/lesson/data && sudo chmod 644 /etc/logrotate.d/lesson && sudo logrotate -d /etc/logrotate.d/lesson >/dev/null && echo "   logrotate 配置校验通过"' \
  || echo "⚠ logrotate 配置校验失败，请登录服务器手动执行：sudo logrotate -d /etc/logrotate.d/lesson"

echo "==> 7/8 启用软链并平滑重载 Nginx（默认仅启用纯 HTTP 的 booking-ip；无域名/无证书切勿启用 booking.conf 的 443 SSL 块，否则 nginx 因证书缺失起不来）"
ssh "$SERVER" 'rm -f /etc/nginx/sites-enabled/booking /etc/nginx/sites-enabled/default && ln -sf /etc/nginx/sites-available/booking-ip /etc/nginx/sites-enabled/booking-ip && sudo nginx -t && sudo systemctl reload nginx' \
  || echo "⚠ 自动 reload nginx 失败，请登录服务器手动执行：sudo nginx -t && sudo systemctl reload nginx"
echo "   （有域名+证书后启用 HTTPS 版：sudo ln -sf /etc/nginx/sites-available/booking /etc/nginx/sites-enabled/booking && sudo systemctl reload nginx）"

echo "==> 8/8 分流自检（三服务：8081 主 / 8090 消息 / 8092 课堂）"
ssh "$SERVER" 'for p in "api/v1/system/info:8081 主服务" "api/v1/message/system/info:8090 消息" "api/v1/rtc/providers:8092 课堂"; do url=${p%%:*}; echo -n "   $url -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1/$url"; done' \
  || echo "   ⚠ 自检失败（后端可能还没启动，属正常；重启后端后再跑一次）"

echo
echo "上传完成。接下来在服务器上执行："
echo "  sudo chmod +x /opt/lesson/backup.sh /opt/lesson/healthcheck.sh"
echo "  sudo cp /opt/lesson/booking.env.template   /etc/lesson/booking.env    # 再填真实密钥（AES_KEY / HMAC_KEY，不是 CRYPTO_AESKEY）"
echo "  sudo cp /opt/lesson/message.env.template   /etc/lesson/message.env"
echo "  sudo cp /opt/lesson/classroom.env.template /etc/lesson/classroom.env  # 另需填 REDIS_* / STORAGE_LOCAL_ROOT"
echo "  sudo chmod 600 /etc/lesson/*.env && sudo chown lesson:lesson /etc/lesson/*.env"
echo "  cd /opt/lesson && mv -f booking_api.jar.new booking_api.jar \\"
echo "                     && mv -f message-service.jar.new message-service.jar \\"
echo "                     && mv -f classroom-service.jar.new classroom-service.jar   # 课堂没传就跳过这句"
echo "  sudo systemctl daemon-reload && sudo systemctl restart booking message-service classroom-service"
echo "  sudo systemctl reload nginx   # 若上面 7/8 已自动 reload 可跳过；但凡改过 nginx 分流就必须 reload"
echo
echo "告警巡检（一次性配置，三个 cron 条目）："
echo "  mysql_config_editor set --login-path=health --host=localhost --user=root --password"
echo "  # 之后编辑 healthcheck.sh 顶部：export MYSQL_LOGIN_PATH=health"
echo "  (crontab -l 2>/dev/null; echo '*/5 * * * * /opt/lesson/healthcheck.sh >> /var/log/lesson/healthcheck.log 2>&1') | crontab -"
echo "  /opt/lesson/healthcheck.sh   # 先手跑一次，确认巡检都绿"
echo
echo "日志（首次部署或换机器时必查，已由 6/8 自动建目录+校验）："
echo "  tail -f /var/log/lesson/booking.log                   # systemd 捕获（logrotate 管）"
echo "  tail -f /var/log/lesson/classroom.log                 # 课堂 systemd 捕获"
echo "  tail -f /var/log/lesson/api/spring-boot-app.log       # booking 业务日志（logback 管）"
echo "  tail -f /var/log/lesson/message/message-service.log   # message 业务日志"
echo "  tail -f /var/log/lesson/classroom/classroom-service.log  # 课堂业务日志（扫描器/掉线判定都在这）"
echo "  sudo logrotate -d /etc/logrotate.d/lesson      # 校验滚动配置（-d 空跑，不真转）"
echo
echo "探针（匿名可访问，LB/监控直接用）："
echo "  curl -s localhost:8081/actuator/health/readiness   # booking         → {\"status\":\"UP\"}"
echo "  curl -s localhost:8090/actuator/health/readiness   # message-service → {\"status\":\"UP\"}"
echo "  curl -s localhost:8092/actuator/health/readiness   # classroom       → {\"status\":\"UP\"}"
echo "  curl -s localhost:8092/api/v1/rtc/providers        # 课堂媒体选型（configured/active/degraded）"
echo "  redis-cli -n 2 ping                                # 课堂依赖 Redis → PONG"
echo "  ⚠ 若返回 401：SecurityConfig 与 JwtAuthenticationFilter 两处白名单只改了一处"
