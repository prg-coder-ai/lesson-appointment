#!/usr/bin/env bash
# ==============================================================================
# 服务器侧「前后版本切换」唯一入口 —— 切换 + 健康检查 + 失败自动回滚
#
# 用法（服务器上，root/sudo）：
#   sudo bash switch.sh booking   2.2.0-a1b2c3d
#   sudo bash switch.sh message   1.1.0-a1b2c3d
#   sudo bash switch.sh classroom 1.0.0-a1b2c3d
#   sudo bash switch.sh frontend  20261120-2230        # 对应 /var/www/releases/<id>
#   sudo bash switch.sh status                        # 看当前版本与容器状态
#
# 为什么必须走这个脚本、不要手工 `docker compose up -d`：
#   1. 手工 up 失败时容器停在 restart 循环里，**compose 命令本身返回 0**，
#      人看到"执行成功"就去通知上线了，实际站点已是 502；
#   2. 回滚需要一个确定的"上一版本"，这个信息只有在切换前记录下来才可靠
#      （事后再去问 docker 有哪些 tag，等于从一堆候选里猜）；
#   3. --no-deps 是必须的：classroom 声明了 depends_on redis，不带它会把
#      Redis 一起重启 —— 课堂在线态 key 在 Redis 里，重启等于把在课学生全判掉线。
# ==============================================================================
set -euo pipefail

DIR="/opt/lesson/docker"
COMPOSE="$DIR/docker-compose.yml"
ENVFILE="$DIR/.env"
LOG="$DIR/releases.log"
HTTP_PORT_SUFFIX=""     # 蓝绿扩展用，见 README 第八节

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m   ✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\033[1;33m   ⚠ %s\033[0m\n' "$*"; }

[ "$(id -u)" = "0" ] || die "请用 root 执行：sudo bash $0 ..."
[ -f "$COMPOSE" ]    || die "缺 $COMPOSE（从仓库 deploy/docker/ 复制过来）"
[ -f "$ENVFILE" ]    || die "缺 $ENVFILE（cp env.example .env 后填 TAG）"

COMPOSE_BIN="docker compose"
docker compose version >/dev/null 2>&1 || die "没有 docker compose v2 插件；重跑 install-docker.sh（docker-compose v1 已 EOL，本项目不用它）"

dc() { ( cd "$DIR" && $COMPOSE_BIN --env-file "$ENVFILE" -f "$COMPOSE" "$@" ); }

env_get() {  # key 不存在时必须返回空串而不是让 grep 的非零退出码冒到 set -e
  grep -E "^$1=" "$ENVFILE" | tail -1 | cut -d= -f2- || true
}
env_set() {  # 原子替换单个 key，不碰其它行（含注释）
  local key="$1" val="$2" tmp
  tmp="$(mktemp "$DIR/.env.XXXXXX")"
  awk -v k="$key" -v v="$val" '
    BEGIN{done=0}
    $0 ~ "^"k"=" {print k"="v; done=1; next}
    {print}
    END{if(!done) print k"="v}
  ' "$ENVFILE" > "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENVFILE"
}

# ------------------------------------------------------------------ 状态查询
if [ "${1:-}" = "status" ]; then
  say "版本清单（$ENVFILE）"
  grep -E '^(BOOKING|MESSAGE|CLASSROOM|FRONTEND)_' "$ENVFILE" | sed 's/^/   /'
  say "容器状态"
  dc ps || true
  say "最近切换记录"
  [ -f "$LOG" ] && tail -10 "$LOG" | sed 's/^/   /' || echo "   （暂无）"
  exit 0
fi

SERVICE="${1:-}"
TARGET="${2:-}"
[ -n "$SERVICE" ] && [ -n "$TARGET" ] || die "用法：$0 <booking|message|classroom|frontend> <版本>   或   $0 status"

# ==============================================================================
# 前端切换：releases/<id> + 软链原子替换
# ==============================================================================
if [ "$SERVICE" = "frontend" ]; then
  REL="/var/www/releases/$TARGET"
  [ -d "$REL" ] || die "没有这个发布包：$REL"
  [ -f "$REL/index.html" ] || die "$REL 里没有 index.html，拒绝切换（切过去就是白页）"

  # 首次从"实体目录"迁移到"软链"：不自动删任何东西，只给出可执行的命令。
  # 自动 mv 掉线上目录的风险太高（哪怕逻辑对，用户看到"目录突然消失"也会慌）。
  if [ -e /var/www/frontend ] && [ ! -L /var/www/frontend ]; then
    # 这里**故意不用命令替换**去猜 releases 里的目录名：迁移前 releases 通常是空的，
    # 猜出来是空串会拼出 `ln -sfn /var/www/releases/ /var/www/frontend` 这种把站点指到
    # 目录列表上的错误命令。让人看一眼自己敲，比自动猜安全。
    cat >&2 <<'EOS'
✗ /var/www/frontend 目前是实体目录，需要先迁移成软链（首次部署只做一次）：

    sudo mkdir -p /var/www/releases
    sudo mv /var/www/frontend /var/www/releases/legacy-$(date +%Y%m%d-%H%M%S)
    # 注意下面 <把 legacy-... 换成上一步生成的真实目录名>
    sudo ln -sfn /var/www/releases/<legacy-目录名> /var/www/frontend
    sudo nginx -t && sudo systemctl reload nginx
    curl -I http://127.0.0.1/          # 确认 200 后，再重跑本命令

迁移完 /var/www/frontend 是指向 releases/<id> 的软链，之后所有前端发布都由
switch.sh frontend <id> 完成，不再需要手工操作。
EOS
    exit 1
  fi

  OLD="$(readlink -f /var/www/frontend 2>/dev/null | xargs -r basename || echo none)"
  # ln -sfn + mv -T：两步都是原子操作，中间不存在"软链指向空"的窗口。
  # 直接 ln -sfn target /var/www/frontend 在部分 coreutils 上会先删后建，有极小窗口。
  ln -sfn "$REL" /var/www/.frontend.next
  mv -T /var/www/.frontend.next /var/www/frontend

  # nginx 以 root 启动、worker 以 www-data 跑；目录必须 world-readable
  chmod -R a+rX "$REL"

  nginx -t >/dev/null || die "nginx 配置校验失败，回滚软链"
  systemctl reload nginx
  ok "前端 $OLD → $TARGET（已 reload nginx）"
  printf '%s\tfrontend\t%s\t%s\t%s\n' "$(date '+%F %T')" "$OLD" "$TARGET" "ok" >> "$LOG"
  exit 0
fi

# ==============================================================================
# 后端切换
# ==============================================================================
case "$SERVICE" in
  booking)   KEY=BOOKING_TAG;   IMAGE="lesson/booking-api";       PORT=8081; TIMEOUT=180 ;;
  message)   KEY=MESSAGE_TAG;   IMAGE="lesson/message-service";   PORT=8090; TIMEOUT=180 ;;
  # 课堂启动最慢（调度器 + 媒体协商 + 租户开关缓存），healthcheck 的 start_period
  # 就是 120s，等待窗口必须大于它，否则正常启动也会被误判成失败并触发回滚。
  classroom) KEY=CLASSROOM_TAG; IMAGE="lesson/classroom-service"; PORT=8092; TIMEOUT=240 ;;
  *) die "未知服务：$SERVICE（只支持 booking|message|classroom|frontend）" ;;
esac

docker image inspect "$IMAGE:$TARGET" >/dev/null 2>&1 \
  || die "本机没有镜像 $IMAGE:$TARGET。先在本地 build + docker save 上传 load，或检查 tag 拼写（$0 status 看当前值）"

OLD="$(env_get "$KEY")"
if [ "$OLD" = "$TARGET" ]; then
  ok "$SERVICE 已经是 $TARGET，无需切换（如要强制重启用：docker compose restart $SERVICE）"
  exit 0
fi

say "$SERVICE：$OLD → $TARGET"

BACKUP="$DIR/.env.prev"
cp -a "$ENVFILE" "$BACKUP"

wait_healthy() {  # wait_healthy <service> <timeout秒>
  local svc="$1" timeout="${2:-180}" cid st waited=0
  while [ "$waited" -lt "$timeout" ]; do
    cid="$(dc ps -q "$svc" 2>/dev/null | head -1)"
    if [ -n "$cid" ]; then
      st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo missing)"
      case "$st" in
        healthy) return 0 ;;
        unhealthy|exited|dead)
          echo "   容器状态：$st，最近日志："
          docker logs --tail 40 "$cid" 2>&1 | sed 's/^/     | /'
          return 1 ;;
      esac
    fi
    sleep 3; waited=$((waited + 3))
    printf '.'
  done
  echo
  warn "等待 ${timeout}s 仍未 healthy（最后状态 ${st:-missing}），最近日志："
  [ -n "${cid:-}" ] && docker logs --tail 40 "$cid" 2>&1 | sed 's/^/     | /'
  return 1
}

rollback_now() {
  warn "切换失败 → 回滚到 $OLD"
  env_set "$KEY" "$OLD"
  dc up -d --no-deps "$SERVICE" || true
  if wait_healthy "$SERVICE" 120; then
    ok "已回滚到 $OLD，服务健康"
  else
    warn "回滚后仍不健康 —— 环境本身有问题（DB/Redis/磁盘/密钥），不是镜像的问题。"
    warn "排查顺序：docker logs → /var/log/lesson/<svc>/ → ss -lntp | grep $PORT → 磁盘 df -h"
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$SERVICE" "$OLD" "$TARGET" "failed-rolled-back" >> "$LOG"
  exit 1
}

env_set "$KEY" "$TARGET"
dc up -d --no-deps "$SERVICE"

if wait_healthy "$SERVICE" "$TIMEOUT"; then
  echo
  ok "$SERVICE 现在运行 $TARGET"

  # 冒烟：healthcheck 只说「进程 + DB 通了」，不代表业务路由已就绪。
  # 课堂额外探 rtc/providers（它反映媒体选型是否降级），这条对课堂尤其重要。
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/actuator/health/readiness" || echo 000)"
  [ "$code" = "200" ] || { warn "health/readiness 返回 $code（预期 200）"; rollback_now; }

  printf '%s\t%s\t%s\t%s\t%s\n' "$(date '+%F %T')" "$SERVICE" "$OLD" "$TARGET" "ok" >> "$LOG"
  [ -f "$BACKUP" ] && rm -f "$BACKUP"
  echo
  echo "回滚命令：sudo bash $0 $SERVICE $OLD"
  exit 0
else
  rollback_now
fi
