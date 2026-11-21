#!/usr/bin/env bash
# ==============================================================================
# 本地一键发布：构建镜像 → 打包 → 传输 → 远端 load → 远端切版本（失败自动回滚）
#
# 用法（仓库根执行）：
#   SERVER=root@1.2.3.4 bash deploy/docker/release.sh
#   SERVER=root@1.2.3.4 bash deploy/docker/release.sh --only booking
#   SERVER=root@1.2.3.4 bash deploy/docker/release.sh --skip-build   # 镜像已构建过
#   SERVER=root@1.2.3.4 bash deploy/docker/release.sh --frontend-only
#
# 为什么用 save/load 而不是推 registry：
#   当前是单机、发布频率低，多一个 Harbor 就是多一个要打补丁的组件。
#   规模起来（>2 台 / 每天多次）再上 registry，脚本里的 load 换成 pull 即可，
#   切换机制（switch.sh）完全不用改 —— 那就是把发布与分发解耦的好处。
#
# ⚠ 镜像包动辄 400~600MB（三个 jar 138MB + 共享 JRE 层），务必走内网或
#   开 scp 限速，别在公司出口带宽上跑。
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

pkg_time() { date +%Y%m%d-%H%M%S; }
say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }

SERVER="${SERVER:-}"
[ -n "$SERVER" ] || die "必须指定目标：SERVER=root@<ip> bash deploy/docker/release.sh"
REMOTE_DIR="/opt/lesson/docker"
REMOTE_TMP="/tmp/lesson-release"

ONLY=all; SKIP_BUILD=0; FRONTEND_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only)          ONLY="${2:?--only 需要值：booking|message|classroom}"; shift 2 ;;
    --skip-build)    SKIP_BUILD=1; shift ;;
    --frontend-only) FRONTEND_ONLY=1; shift ;;
    *) die "未知参数：$1" ;;
  esac
done

ssh "$SERVER" 'true' || die "连不上 $SERVER（密钥/网络？）"

# ------------------------------------------------------------------ 1. 构建镜像
# 用函数而不是 declare -A：macOS 自带 bash 3.2 没有关联数组，脚本要能在任意
# 开发机上跑（仓库里这些 .sh 本来就同时服务 Windows Git Bash / Linux / macOS）。
image_of() {
  case "$1" in
    booking)   echo "lesson/booking-api" ;;
    message)   echo "lesson/message-service" ;;
    classroom) echo "lesson/classroom-service" ;;
    *) die "未知服务名：$1" ;;
  esac
}
TAGS_FILE=/tmp/lesson-image-tags.txt

if [ "$FRONTEND_ONLY" = 0 ]; then
  if [ "$SKIP_BUILD" = 0 ]; then
    say "1/6 构建镜像（--only $ONLY）"
    bash deploy/docker/build-images.sh "$ONLY"
  else
    say "1/6 跳过构建（--skip-build），沿用 $TAGS_FILE"
    [ -s "$TAGS_FILE" ] || die "$TAGS_FILE 不存在或为空，去掉 --skip-build 重跑"
  fi

  # ------------------------------------------------------------------ 2. 打包
  say "2/6 打包镜像（一次 save 三个 → 共享基础层，比分别 save 省一半体积）"
  IMAGE_REFS=()
  TAGS=()
  NAMES=()
  while IFS=$'\t' read -r name tag; do
    case "$name" in booking|message|classroom) ;; *) continue ;; esac
    NAMES+=("$name")
    TAGS+=("$tag")
    IMAGE_REFS+=("$(image_of "$name"):$tag")
  done < "$TAGS_FILE"
  [ "${#IMAGE_REFS[@]}" -gt 0 ] || die "$TAGS_FILE 里没有可发布的镜像"

  printf '    %s\n' "${IMAGE_REFS[@]}"

  BUNDLE="$(pkg_time)"
  LOCAL_TGZ="/tmp/lesson-images-$BUNDLE.tar.gz"
  docker save "${IMAGE_REFS[@]}" | gzip -1 > "$LOCAL_TGZ"
  # 空包检测：gzip 空输入恒为 20 字节，一旦 save 失败但管道吞掉退出码，
  # 传过去 load 才炸，报错还指向解压而不是构建。这里先卡体积。
  SIZE=$(stat -c %s "$LOCAL_TGZ" 2>/dev/null || stat -f %z "$LOCAL_TGZ")
  [ "$SIZE" -gt 5000000 ] || die "镜像包只有 ${SIZE} 字节，构建/打包失败"
  SUM=$(sha256sum "$LOCAL_TGZ" | awk '{print $1}')
  echo "    $(du -h "$LOCAL_TGZ" | cut -f1)  sha256=${SUM:0:16}…"

  # ------------------------------------------------------------------ 3. 传输
  say "3/6 传输到 $SERVER:$REMOTE_TMP"
  ssh "$SERVER" "mkdir -p $REMOTE_TMP"
  scp -C "$LOCAL_TGZ" "$SERVER:$REMOTE_TMP/lesson-images.tar.gz"

  # ------------------------------------------------------------------ 4. load
  say "4/6 远端校验并 load"
  ssh "$SERVER" "set -e
    cd $REMOTE_TMP
    echo '$SUM  lesson-images.tar.gz' | sha256sum -c - >/dev/null || { echo '校验失败，包已损坏，重传'; exit 1; }
    gunzip -c lesson-images.tar.gz | docker load
    rm -f lesson-images.tar.gz"
  rm -f "$LOCAL_TGZ"

  # ------------------------------------------------------------------ 5. 切版本
  say "5/6 切版本（healthcheck 通过才算成功，失败自动回滚）"
  for i in "${!NAMES[@]}"; do
    ssh "$SERVER" "sudo bash $REMOTE_DIR/switch.sh ${NAMES[$i]} '${TAGS[$i]}'"
  done
else
  say "1-5/6 跳过后端（--frontend-only）"
  BUNDLE="$(pkg_time)"
fi

# ------------------------------------------------------------------ 6. 前端
say "6/6 前端 dist → /var/www/releases/$BUNDLE 并切换软链"
[ -d deploy/dist ] || die "缺 deploy/dist —— 先跑 node deploy/collect-artifacts.js --only dist 或完整构建"
ssh "$SERVER" "sudo mkdir -p /var/www/releases/$BUNDLE && sudo chown -R \$(id -u lesson):\$(id -g lesson) /var/www/releases/$BUNDLE"
rsync -a --delete deploy/dist/ "$SERVER:/var/www/releases/$BUNDLE/"
ssh "$SERVER" "sudo bash $REMOTE_DIR/switch.sh frontend '$BUNDLE'"

echo
echo "发布完成。当前版本："
ssh "$SERVER" "sudo grep -E '^(BOOKING|MESSAGE|CLASSROOM|FRONTEND)_' $REMOTE_DIR/.env | sed 's/^/  /'"
echo
echo "回滚到上一版本：ssh $SERVER 'sudo bash $REMOTE_DIR/rollback.sh booking'"
