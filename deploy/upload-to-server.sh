#!/bin/bash
# ============================================================
#  从本地把三份产物 + 配置文件一次性传到服务器（Git Bash / Linux 执行）
#  用法：
#    SERVER=root@1.2.3.4 bash deploy/upload-to-server.sh
#  说明：只传文件，不重启服务；传完按手册第 3 章手工执行重启。
# ============================================================
set -e
SERVER=${SERVER:-root@1.2.3.4}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 版本号不写死：pom 里 <version> 会变，动态取 target 下最新的同名 jar（避免写死 1.0.0 而实际已是 1.0.1 导致传不上去）
BOOKING_JAR="$(ls -1 "$ROOT"/api/target/booking-api-*.jar 2>/dev/null | head -1)"
[ -z "$BOOKING_JAR" ] && BOOKING_JAR="$(ls -1 "$ROOT"/api/beforeRun/booking-api-*.jar 2>/dev/null | head -1)"
MSG_JAR="$(ls -1 "$ROOT"/api/message-service/target/message-service-*.jar 2>/dev/null | head -1)"
[ -n "$BOOKING_JAR" ] || { echo "找不到 booking 产物，请先在 api/ 执行 mvn package"; exit 1; }
[ -n "$MSG_JAR" ]     || { echo "找不到 message-service 产物，请先在 api/message-service/ 执行 mvn package"; exit 1; }

echo "==> 1/7 两个 jar"
scp "$BOOKING_JAR"                                        "$SERVER:/opt/lesson/booking_api.jar.new"
scp "$MSG_JAR"                                            "$SERVER:/opt/lesson/message-service.jar.new"

echo "==> 2/7 前端 dist（内容，不含 dist 这一层）"
rsync -av --delete "$ROOT/frontend/dist/" "$SERVER:/var/www/frontend/"

echo "==> 3/7 SQL 初始化脚本"
rsync -av "$ROOT/api/beforeRun/sql/" "$SERVER:/opt/lesson/sql/"

echo "==> 4/7 systemd 单元 + env 模板"
scp "$ROOT/api/beforeRun/booking.service"         "$SERVER:/etc/systemd/system/booking.service"
scp "$ROOT/api/beforeRun/message-service.service" "$SERVER:/etc/systemd/system/message-service.service"
scp "$ROOT/api/beforeRun/booking.env.template"    "$SERVER:/opt/lesson/booking.env.template"
scp "$ROOT/api/beforeRun/message.env.template"    "$SERVER:/opt/lesson/message.env.template"

echo "==> 5/7 Nginx 配置 + 备份脚本 + logrotate"
scp "$ROOT/deploy/nginx/booking.conf"     "$SERVER:/etc/nginx/sites-available/booking"
scp "$ROOT/deploy/nginx/booking-ip.conf"  "$SERVER:/etc/nginx/sites-available/booking-ip"
scp "$ROOT/deploy/backup.sh"              "$SERVER:/opt/lesson/backup.sh"
scp "$ROOT/deploy/logrotate/lesson"       "$SERVER:/etc/logrotate.d/lesson"
scp "$ROOT/deploy/healthcheck.sh"         "$SERVER:/opt/lesson/healthcheck.sh"

echo "==> 6/7 日志目录 + logrotate 生效校验"
# 目录不建 → systemd 因 append: 打不开文件而启动失败；logrotate 不校验 → 真滚动那天才发现没生效。
ssh "$SERVER" 'sudo mkdir -p /var/log/lesson/api /var/log/lesson/message && sudo chown -R lesson:lesson /var/log/lesson && sudo chmod 644 /etc/logrotate.d/lesson && sudo logrotate -d /etc/logrotate.d/lesson >/dev/null && echo "   logrotate 配置校验通过"' \
  || echo "⚠ logrotate 配置校验失败，请登录服务器手动执行：sudo logrotate -d /etc/logrotate.d/lesson"

echo "==> 7/7 启用软链并平滑重载 Nginx（默认仅启用纯 HTTP 的 booking-ip；无域名/无证书切勿启用 booking.conf 的 443 SSL 块，否则 nginx 因证书缺失起不来）"
ssh "$SERVER" 'rm -f /etc/nginx/sites-enabled/booking /etc/nginx/sites-enabled/default && ln -sf /etc/nginx/sites-available/booking-ip /etc/nginx/sites-enabled/booking-ip && sudo nginx -t && sudo systemctl reload nginx' \
  || echo "⚠ 自动 reload nginx 失败，请登录服务器手动执行：sudo nginx -t && sudo systemctl reload nginx"
echo "   （有域名+证书后启用 HTTPS 版：sudo ln -sf /etc/nginx/sites-available/booking /etc/nginx/sites-enabled/booking && sudo systemctl reload nginx）"

echo "上传完成。接下来在服务器上执行："
echo "  sudo chmod +x /opt/lesson/backup.sh /opt/lesson/healthcheck.sh"
echo "  sudo cp /opt/lesson/booking.env.template /etc/lesson/booking.env   # 再填真实密钥"
echo "  sudo cp /opt/lesson/message.env.template /etc/lesson/message.env"
echo "  sudo chmod 600 /etc/lesson/*.env && sudo chown lesson:lesson /etc/lesson/*.env"
echo "  cd /opt/lesson && mv -f booking_api.jar.new booking_api.jar && mv -f message-service.jar.new message-service.jar"
echo "  sudo systemctl daemon-reload && sudo systemctl restart booking message-service"
echo "  sudo systemctl reload nginx   # 若上面 7/7 已自动 reload 可跳过；但凡改过 nginx 分流就必须 reload"
echo
echo "告警巡检（一次性配置，三个 cron 条目）："
echo "  mysql_config_editor set --login-path=health --host=localhost --user=root --password"
echo "  # 之后编辑 healthcheck.sh 顶部：export MYSQL_LOGIN_PATH=health"
echo "  (crontab -l 2>/dev/null; echo '*/5 * * * * /opt/lesson/healthcheck.sh >> /var/log/lesson/healthcheck.log 2>&1') | crontab -"
echo "  /opt/lesson/healthcheck.sh   # 先手跑一次，确认三条巡检都绿"
echo
echo "日志（首次部署或换机器时必查，已由 6/7 自动建目录+校验）："
echo "  tail -f /var/log/lesson/booking.log            # systemd 捕获的 stdout/stderr（logrotate 管）"
echo "  tail -f /var/log/lesson/api/spring-boot-app.log       # booking 业务日志（logback 管）"
echo "  tail -f /var/log/lesson/message/message-service.log    # message-service 业务日志"
echo "  sudo logrotate -d /etc/logrotate.d/lesson      # 校验滚动配置（-d 空跑，不真转）"
echo
echo "探针（匿名可访问，LB/监控直接用）："
echo "  curl -s localhost:8081/actuator/health/readiness   # booking        → {\"status\":\"UP\"}"
echo "  curl -s localhost:8090/actuator/health/readiness   # message-service → {\"status\":\"UP\"}"
echo "  ⚠ 若返回 401：SecurityConfig 与 JwtAuthenticationFilter 两处白名单只改了一处"
