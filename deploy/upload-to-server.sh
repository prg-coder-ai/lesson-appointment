#!/bin/bash
# ============================================================
#  从本地把产物 + 配置文件一次性传到服务器（Git Bash / Linux 执行）
#  用法：
#    SERVER=root@1.2.3.4 bash deploy/upload-to-server.sh
#  说明：只传文件，不重启服务；传完按手册第 3 章手工执行重启。
#
#  2026-10-30：后端由 2 个服务扩到 3 个（新增 classroom-service）。
#  课堂产物是**可选**的 —— 没构建就跳过并告警，不阻断预约/消息的上线流程。
#
#  产物来源（2026-11-05）：优先 deploy/jars/ + deploy/dist/（由构建脚本自动收口），
#  找不到才回退各模块 target/ 与 frontend/dist/。构建后若没自动收口，
#  先跑 node deploy/collect-artifacts.js，避免上传旧版本。
# ============================================================
set -e
SERVER=${SERVER:-root@1.2.3.4}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 【2026-11-05】产物统一收口在 deploy/：优先取 deploy/jars、deploy/dist，
# 找不到时回退原来的各模块 target/ 与 frontend/dist/（老流程仍可用）。
# 版本号不写死：pom 里 <version> 会变，collect-artifacts.js 只保留最新版本 jar。
BOOKING_JAR="$(ls -1 "$ROOT"/deploy/jars/booking-api-*.jar 2>/dev/null | head -1)"
[ -z "$BOOKING_JAR" ] && BOOKING_JAR="$(ls -1 "$ROOT"/api/target/booking-api-*.jar 2>/dev/null | head -1)"
MSG_JAR="$(ls -1 "$ROOT"/deploy/jars/message-service-*.jar 2>/dev/null | head -1)"
[ -z "$MSG_JAR" ] && MSG_JAR="$(ls -1 "$ROOT"/api/message-service/target/message-service-*.jar 2>/dev/null | head -1)"
# 课堂产物是**可选**的（2026-10-30 起新增）：没构建就跳过并告警，不阻断预约/消息的上线流程
CLS_JAR="$(ls -1 "$ROOT"/deploy/jars/classroom-service-*.jar 2>/dev/null | head -1)"
[ -z "$CLS_JAR" ] && CLS_JAR="$(ls -1 "$ROOT"/api/classroom-service/target/classroom-service-*.jar 2>/dev/null | head -1)"

[ -n "$BOOKING_JAR" ] || { echo "找不到 booking 产物，请先跑 bash deploy/build-backends.sh"; exit 1; }
[ -n "$MSG_JAR" ]     || { echo "找不到 message-service 产物，请先跑 bash deploy/build-backends.sh"; exit 1; }

echo "==> 1/9 三个 jar（课堂可选）"
echo "    booking   <- $BOOKING_JAR"
echo "    message   <- $MSG_JAR"
scp "$BOOKING_JAR" "$SERVER:/opt/lesson/booking_api.jar.new"
scp "$MSG_JAR"     "$SERVER:/opt/lesson/message-service.jar.new"
if [ -n "$CLS_JAR" ] && [ -f "$CLS_JAR" ]; then
  echo "    classroom <- $CLS_JAR"
  scp "$CLS_JAR" "$SERVER:/opt/lesson/classroom-service.jar.new"
else
  echo "    classroom <- 未找到，跳过（不影响预约/消息）"
fi

DIST_DIR="$ROOT/frontend/dist"
if [ -d "$ROOT/deploy/dist" ]; then
  DIST_DIR="$ROOT/deploy/dist"
  # deploy/dist 是收口快照；若源码侧又重新构建过而没收口，别静默上传旧页面
  if [ -f "$ROOT/frontend/dist/build-info.json" ] && [ -f "$DIST_DIR/build-info.json" ] \
     && [ "$ROOT/frontend/dist/build-info.json" -nt "$DIST_DIR/build-info.json" ]; then
    echo "⚠ frontend/dist 比 deploy/dist 新，建议先跑：node deploy/collect-artifacts.js --only dist"
  fi
fi
echo "==> 2/9 前端 dist（内容，不含 dist 这一层；来源 $DIST_DIR）"
rsync -av --delete "$DIST_DIR/" "$SERVER:/var/www/frontend/"

# ------------------------------------------------------------
# 课堂 App（classroom-app/www）—— 2026-11-26 新增
#
# 为什么必须传：frontend 侧所有「进入课堂」入口都收敛到 ClassroomLink，
#   产出相对地址 ./launch.html?scheduleId=…，而 launch.html 只存在于
#   classroom-app/www。nginx 的「课堂 App 静态承接」块把它指向
#   /var/www/classroom-app —— 这个目录不传，线上所有「进入课堂」都会 404。
#
# 它和 frontend/dist 是两份独立产物：
#   frontend     → node frontend/build.js           → /var/www/frontend
#   classroom-app→ node classroom-app/scripts/build.js → /var/www/classroom-app
# 后者内含 App 专属补丁（见 classroom-app/config/frontend-patches.js），
# 不能用 frontend/dist 的 classroom.html 顶替。
#
# 缺产物只告警不中断：与课堂服务 jar 一样属可选，不阻断预约/消息上线。
# ------------------------------------------------------------
APP_WWW_DIR="$ROOT/classroom-app/www"
if [ -f "$APP_WWW_DIR/launch.html" ]; then
  echo "==> 3/9 课堂 App www（内容，不含 www 这一层；来源 classroom-app/www）"
  ssh "$SERVER" 'mkdir -p /var/www/classroom-app' || echo "   ⚠ 远程建目录失败，后续 rsync 可能报错"
  rsync -av --delete "$APP_WWW_DIR/" "$SERVER:/var/www/classroom-app/"
else
  echo "==> 3/9 课堂 App www —— 未构建，跳过"
  echo "     ⚠ 线上「进入课堂」会 404：先跑 node classroom-app/scripts/build.js 再传"
fi

echo "==> 4/9 SQL 初始化脚本（三库；源目录是 deploy/sql/{schema,seed,patch}）"
# 2026-11-18 目录整合：DDL 从 api/sql/ 迁入 deploy/sql/。旧脚本里的 api/beforeRun/sql/
#    早已不存在，`set -e` 下 rsync 源缺失会中断整个上传流程。这里统一指向 deploy/sql/，
#    并用 [ -d ] 保护，缺目录只告警不中断。
# 目标子目录要先建：rsync 只能创建最后一层，父目录不存在会失败。
ssh "$SERVER" 'sudo mkdir -p /opt/lesson/sql/schema /opt/lesson/sql/seed /opt/lesson/sql/patch /opt/lesson/sql/classroom' \
  || echo "   ⚠ 远程建目录失败，后续 rsync 可能报错"
for d in deploy/sql/schema deploy/sql/seed deploy/sql/patch; do
  if [ -d "$ROOT/$d" ]; then
    rsync -av "$ROOT/$d/" "$SERVER:/opt/lesson/sql/$(basename "$d")/"
  else
    echo "   ⚠ 缺少目录 $d，跳过"
  fi
done
# 三库建库 + 应用账号脚本在 sql/ 根目录（不在 schema/seed/patch 任一子目录里，上面的 rsync 带不到）。
# 漏传它的后果：新环境没有 CREATE DATABASE 语句可用，只能手敲，且 collation 极易抄错。
if [ -f "$ROOT/deploy/sql/00-create-databases.sql" ]; then
  scp "$ROOT/deploy/sql/00-create-databases.sql" "$SERVER:/opt/lesson/sql/00-create-databases.sql"
else
  echo "   ⚠ 缺少 deploy/sql/00-create-databases.sql（新环境建库/建账号要靠它）"
fi
# 课堂库结构自带 CREATE DATABASE classroom + USE，单独放 classroom/
if [ -d "$ROOT/api/classroom-service/sql" ]; then
  rsync -av "$ROOT/api/classroom-service/sql/" "$SERVER:/opt/lesson/sql/classroom/"
else
  echo "   ⚠ 缺少目录 api/classroom-service/sql，跳过课堂 SQL"
fi

echo "==> 5/9 systemd 单元 + env 模板（三个服务）"
scp "$ROOT/deploy/booking.service"         "$SERVER:/etc/systemd/system/booking.service"
scp "$ROOT/deploy/message-service.service" "$SERVER:/etc/systemd/system/message-service.service"
scp "$ROOT/deploy/classroom.service"       "$SERVER:/etc/systemd/system/classroom-service.service"
scp "$ROOT/deploy/booking.env.template"    "$SERVER:/opt/lesson/booking.env.template"
scp "$ROOT/deploy/message.env.template"    "$SERVER:/opt/lesson/message.env.template"
scp "$ROOT/deploy/classroom.env.template"  "$SERVER:/opt/lesson/classroom.env.template"
# keys.env 是三个服务的共用密钥（2026-11-21 起）。只传模板，真实值在服务器上填。
scp "$ROOT/deploy/keys.env.template"       "$SERVER:/opt/lesson/keys.env.template"

echo "==> 6/9 Nginx 配置 + 备份脚本 + logrotate"
scp "$ROOT/deploy/nginx/booking.conf"     "$SERVER:/etc/nginx/sites-available/booking"
scp "$ROOT/deploy/nginx/booking-ip.conf"  "$SERVER:/etc/nginx/sites-available/booking-ip"
# HTTPS 版（2026-11-22 新增）。**只上传、绝不自动 ln -s 启用**：
# 它引用的证书路径在没签发证书前不存在，一旦被 enabled，nginx -t 直接失败 → 整站起不来。
# 启用时机与步骤见维护手册 3.8（先 certbot 签证书，再替换域名占位，再启用本份并摘掉 booking-ip）。
scp "$ROOT/deploy/nginx/booking-https.conf" "$SERVER:/etc/nginx/sites-available/booking-https"
echo "    提示：booking-https 已上传但未启用；启用前必须先有证书，否则 nginx -t 会失败（见 3.8）"
# 纯 IP 自签两种形态（2026-11-22 新增）：仅 HTTPS / HTTP+HTTPS 双栈。
# 同样**只上传不启用** —— 证书没生成前 enabled 会 nginx -t 失败。
# 落地清单见 doc-develop/04-部署与运维/纯IP环境HTTPS自签配置清单-*.md
scp "$ROOT/deploy/nginx/booking-ip-https.conf" "$SERVER:/etc/nginx/sites-available/booking-ip-https"
scp "$ROOT/deploy/nginx/booking-ip-dual.conf"  "$SERVER:/etc/nginx/sites-available/booking-ip-dual"
# 自签证书生成脚本：拷到 /opt/lesson/nginx/ 便于在服务器上直接跑（需 root）
ssh "$SERVER" 'mkdir -p /opt/lesson/nginx'
scp "$ROOT/deploy/nginx/gen-selfsigned-cert.sh" "$SERVER:/opt/lesson/nginx/gen-selfsigned-cert.sh"
ssh "$SERVER" 'chmod +x /opt/lesson/nginx/gen-selfsigned-cert.sh'
# 形态切换脚本：五份站点只能启用一份，手工 ln -sfn 极易启错（2026-11-22 事故：
# 错启域名版 booking-https，nginx -t 报 cannot load certificate .../your.domain.com/fullchain.pem）
scp "$ROOT/deploy/nginx/switch-site.sh" "$SERVER:/opt/lesson/nginx/switch-site.sh"
ssh "$SERVER" 'chmod +x /opt/lesson/nginx/switch-site.sh'
echo "    提示：booking-ip-https / booking-ip-dual 已上传但未启用；先 sudo bash /opt/lesson/nginx/gen-selfsigned-cert.sh <公网IP>"
# 等保 P0-3：限流 zone 定义（limit_req_zone 必须在 http{} 上下文，放不进 sites-available，
# 单独走 conf.d）。漏传这个文件 → nginx -t 失败，整站起不来。
# 报错文本有两种，都指向「定义没生效」：
#   zero size shared memory zone "api_zone"   ← 不带文件行号，最难查（2026-11-21 生产遇到）
#   unknown limit_req_zone "api_zone"          ← 带文件行号
scp "$ROOT/deploy/nginx/conf.d/00-limit-req-zone.conf" "$SERVER:/etc/nginx/conf.d/00-limit-req-zone.conf"
# proxy_params：两份站点配置共 22 处 include /etc/nginx/proxy_params。
# Debian/Ubuntu 的 nginx-common 自带；CentOS / Anolis / Rocky 没有 → nginx -t 直接失败，
# 而报错只说 open() "/etc/nginx/proxy_params" failed，不告诉你缺的是哪个包。
# 只在目标缺失时补，绝不覆盖发行版自带的那份（其他站点可能在用，内容未必相同）。
if ssh "$SERVER" 'test -f /etc/nginx/proxy_params'; then
  echo "    proxy_params 已存在（发行版自带），跳过覆盖"
else
  scp "$ROOT/deploy/nginx/proxy_params" "$SERVER:/tmp/proxy_params.lesson"
  ssh "$SERVER" 'sudo mv /tmp/proxy_params.lesson /etc/nginx/proxy_params && sudo chmod 644 /etc/nginx/proxy_params'
  echo "    proxy_params 缺失 → 已补（CentOS/Anolis 这类没有 nginx-common 的环境）"
fi
scp "$ROOT/deploy/backup.sh"              "$SERVER:/opt/lesson/backup.sh"
scp "$ROOT/deploy/logrotate/lesson"       "$SERVER:/etc/logrotate.d/lesson"
scp "$ROOT/deploy/healthcheck.sh"         "$SERVER:/opt/lesson/healthcheck.sh"

echo "==> 7/9 日志目录 + 课堂存储目录 + logrotate 生效校验"
# 目录不建 → systemd 因 append: 打不开文件而启动失败；logrotate 不校验 → 真滚动那天才发现没生效。
# 课堂的 STORAGE_LOCAL_ROOT 默认 /opt/lesson/data/oss，属主必须是 lesson 才写得进讲稿/录制。
ssh "$SERVER" 'sudo mkdir -p /var/log/lesson/api /var/log/lesson/message /var/log/lesson/classroom /opt/lesson/data/oss && sudo chown -R lesson:lesson /var/log/lesson /opt/lesson/data && sudo chmod 644 /etc/logrotate.d/lesson && sudo logrotate -d /etc/logrotate.d/lesson >/dev/null && echo "   logrotate 配置校验通过"' \
  || echo "⚠ logrotate 配置校验失败，请登录服务器手动执行：sudo logrotate -d /etc/logrotate.d/lesson"

echo "==> 8/9 启用软链并平滑重载 Nginx（默认仅启用纯 HTTP 的 booking-ip；无域名/无证书切勿启用 booking.conf 的 443 SSL 块，否则 nginx 因证书缺失起不来）"
ssh "$SERVER" 'rm -f /etc/nginx/sites-enabled/booking /etc/nginx/sites-enabled/default && ln -sf /etc/nginx/sites-available/booking-ip /etc/nginx/sites-enabled/booking-ip && sudo nginx -t && sudo systemctl reload nginx' \
  || echo "⚠ 自动 reload nginx 失败，请登录服务器手动执行：sudo nginx -t && sudo systemctl reload nginx"
echo "   （有域名+证书后启用 HTTPS 版：sudo ln -sf /etc/nginx/sites-available/booking /etc/nginx/sites-enabled/booking && sudo systemctl reload nginx）"

echo "==> 9/9 分流自检（三服务：8081 主 / 8090 消息 / 8092 课堂）"
ssh "$SERVER" 'for p in "api/v1/system/info:8081 主服务" "api/v1/message/system/info:8090 消息" "api/v1/rtc/providers:8092 课堂"; do url=${p%%:*}; echo -n "   $url -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1/$url"; done' \
  || echo "   ⚠ 自检失败（后端可能还没启动，属正常；重启后端后再跑一次）"

echo
echo "上传完成。接下来在服务器上执行："
echo "  sudo chmod +x /opt/lesson/backup.sh /opt/lesson/healthcheck.sh"
echo "  sudo cp /opt/lesson/keys.env.template      /etc/lesson/keys.env       # ★ 先填这个：三服务共用密钥（JWT_SECRET / AES_KEY / HMAC_KEY）"
echo "  sudo cp /opt/lesson/booking.env.template   /etc/lesson/booking.env    # 只填 DB / LOG_PATH 等私有项（密钥已迁出到 keys.env）"
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
echo "每日备份（一次性配置；不装 = 出事那天没有可回滚的库）："
echo "  mysql_config_editor set --login-path=backup --host=localhost --user=root --password"
echo "  (crontab -l 2>/dev/null; echo '0 3 * * * /opt/lesson/backup.sh >> /var/log/lesson/backup.log 2>&1') | crontab -"
echo "  /opt/lesson/backup.sh        # 先手跑一次，确认 /opt/backup 下出现当天 4 个文件"
echo "  ✅ 覆盖三个库 + 课堂文件目录：lesson_appointment / message_center / classroom 各一个 .sql.gz，"
echo "     外加 oss_*.tar.gz（/opt/lesson/data/oss 的讲稿/作品/录制）。"
echo "     库留 14 天、oss 留 3 天（录制可达 GB 级，14 份全量会撑爆盘）："
echo "     调整用环境变量 DB_KEEP_DAYS / OSS_KEEP_DAYS / OSS_WARN_MB；不要就地改脚本。"
echo "     ⚠ 只回库不回文件 = 记录都在、点开全 404，恢复必须库 + 目录一起。"
echo
echo "Redis（课堂强依赖；journal 里出现 Connection refused / 掉线判定异常先看这里）："
echo "  sudo apt install -y redis-server      # CentOS/Anolis/Rocky: sudo yum install -y redis"
echo "  redis-cli -n 2 ping                   # → PONG（课堂用 db 2，见 classroom.env 注释）"
echo "  ⚠ 不要给 Redis 配 allkeys-lru：课堂「在线」的唯一真相源就是 Redis key，"
echo "    key 被 LRU 逐出会把在课学生判成掉线（掉线扫描器据此提前结课）。"
echo "    内存吃紧请扩容或缩短 TTL，别用会驱逐数据的策略。"
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
