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

# 版本号不写死：pom 里 api 的 <version> 会变（曾写死 2.0.0 而产物已是 2.0.1，scp 直接 No such file）
BOOKING_JAR="$(ls -1 "$ROOT"/api/target/booking_api-*.jar 2>/dev/null | head -1)"
MSG_JAR="$ROOT/api/message-service/target/message-service-1.0.0.jar"
[ -f "$BOOKING_JAR" ] || { echo "找不到 api 产物，请先在 api/ 执行 mvn package"; exit 1; }
[ -f "$MSG_JAR" ]     || { echo "找不到 message-service 产物，请先在 api/message-service/ 执行 mvn package"; exit 1; }

echo "==> 1/5 两个 jar"
scp "$BOOKING_JAR"                                        "$SERVER:/opt/lesson/booking_api.jar.new"
scp "$MSG_JAR"                                            "$SERVER:/opt/lesson/message-service.jar.new"

echo "==> 2/5 前端 dist（内容，不含 dist 这一层）"
rsync -av --delete "$ROOT/frontend/dist/" "$SERVER:/var/www/frontend/"

echo "==> 3/5 SQL 初始化脚本"
rsync -av "$ROOT/api/beforeRun/sql/" "$SERVER:/opt/lesson/sql/"

echo "==> 4/5 systemd 单元 + env 模板"
scp "$ROOT/api/beforeRun/booking.service"         "$SERVER:/etc/systemd/system/booking.service"
scp "$ROOT/api/beforeRun/message-service.service" "$SERVER:/etc/systemd/system/message-service.service"
scp "$ROOT/api/beforeRun/booking.env.template"    "$SERVER:/opt/lesson/booking.env.template"
scp "$ROOT/api/beforeRun/message.env.template"    "$SERVER:/opt/lesson/message.env.template"

echo "==> 5/5 Nginx 配置 + 备份脚本"
scp "$ROOT/deploy/nginx/booking.conf"     "$SERVER:/etc/nginx/sites-available/booking"
scp "$ROOT/deploy/nginx/booking-ip.conf"  "$SERVER:/etc/nginx/sites-available/booking-ip"
scp "$ROOT/deploy/backup.sh"              "$SERVER:/opt/lesson/backup.sh"

echo "上传完成。接下来在服务器上执行："
echo "  sudo chmod +x /opt/lesson/backup.sh"
echo "  sudo cp /opt/lesson/booking.env.template /etc/lesson/booking.env   # 再填真实密钥"
echo "  sudo cp /opt/lesson/message.env.template /etc/lesson/message.env"
echo "  sudo chmod 600 /etc/lesson/*.env && sudo chown lesson:lesson /etc/lesson/*.env"
echo "  cd /opt/lesson && mv -f booking_api.jar.new booking_api.jar && mv -f message-service.jar.new message-service.jar"
echo "  sudo systemctl daemon-reload && sudo systemctl restart booking message-service"
