#!/usr/bin/env bash
# ==============================================================================
# 本地构建三个后端镜像（产物来自 deploy/jars，构建上下文只有 jar，138MB 封顶）
#
# 用法（仓库根执行，Git Bash / Linux 都行）：
#   bash deploy/docker/build-images.sh                # 构建全部三个
#   bash deploy/docker/build-images.sh booking        # 只构建一个
#   前置于 bash deploy/build-backends.sh（先出 jar，再出镜像）
#
# 产物 tag：<pom 版本>-<git short sha>[-dirty]
#   例：booking-api-2.2.1.jar + a1b2c3d → lesson/booking-api:2.2.1-a1b2c3d
#   ★ tag 里带 sha 是回滚能力的地基：同一个 2.2.1 被改三次也分得清是哪次，
#     反过来"版本号 + 时间戳"在跨机器/跨人发布时无法回答"线上跑的是哪次提交"。
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

JARS="deploy/jars"
DOCKERFILE="deploy/docker/Dockerfile"

command -v docker >/dev/null 2>&1 || { echo "本机没有 docker；改用服务器侧构建（见 README 第六节路径 B）" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon 未运行（Docker Desktop 启动了吗？）" >&2; exit 1; }

SHA="$(git rev-parse --short=7 HEAD 2>/dev/null || echo nogit)"
if ! git diff --quiet HEAD -- 2>/dev/null; then
  SHA="${SHA}-dirty"
  printf '\033[1;33m⚠ 工作区有未提交改动，tag 带 -dirty；正式发布请先提交再构建\033[0m\n'
fi

pick() {  # pick <glob-prefix>  → 输出 jar 文件名（按版本号排序取最新）
  local pattern="$1"
  # ls -1v 做版本排序：2.10.0 要排在 2.9.0 之后，纯字典序会颠倒
  ls -1v "$JARS/$pattern" 2>/dev/null | tail -1
}

VERSION_OF() {  # 从 jar 文件名剥版本：booking-api-2.2.1.jar → 2.2.1
  local f; f="$(basename "$1")"
  f="${f%.jar}"
  echo "${f##*-}"
}

build_one() {
  local name="$1" jar_prefix="$2" port="$3" image="$4"
  local jar tag
  jar="$(pick "$jar_prefix")"
  [ -n "$jar" ] || { echo "找不到 $JARS/$jar_prefix —— 先跑 bash deploy/build-backends.sh" >&2; return 1; }
  tag="$(VERSION_OF "$jar")-$SHA"
  # 进度信息一律走 stderr：stdout 只留最后那行 "name<TAB>tag"，
  # 供调用方重定向成 tags 文件（release.sh 就是这么用的）。混在一起会让
  # 文件里塞满 "===> booking" 这类日志，后续按列解析全错。
  {
    echo
    echo "===> $name"
    echo "     jar   $(basename "$jar")"
    echo "     镜像  $image:$tag"
  } >&2
  # 上下文用 $JARS（相对路径，Git Bash 下不会被改写成 Windows 路径）
  docker build \
    --file "$DOCKERFILE" \
    --build-arg "JAR_FILE=$(basename "$jar")" \
    --build-arg "SERVICE_PORT=$port" \
    --label "org.opencontainers.image.revision=$SHA" \
    --label "org.opencontainers.image.version=$tag" \
    --tag "$image:$tag" \
    --tag "$image:latest" \
    "$JARS" >&2
  echo "     完成  $image:$tag  ($(docker image inspect -f '{{.Size}}' "$image:$tag" | awk '{printf "%.0fMB", $1/1024/1024}'))" >&2
  printf '%s\t%s\n' "$name" "$tag"
}

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*" >&2; }

say "构建版本标识：$SHA"
[ -d "$JARS" ] || { echo "缺目录 $JARS" >&2; exit 1; }

ONLY="${1:-all}"
: > /tmp/lesson-image-tags.txt

case "$ONLY" in
  all|booking)
    build_one booking   "booking-api-*.jar"     8081 "lesson/booking-api"     >> /tmp/lesson-image-tags.txt
    ;;
esac
case "$ONLY" in
  all|message)
    build_one message   "message-service-*.jar" 8090 "lesson/message-service" >> /tmp/lesson-image-tags.txt
    ;;
esac
case "$ONLY" in
  all|classroom)
    build_one classroom "classroom-service-*.jar" 8092 "lesson/classroom-service" >> /tmp/lesson-image-tags.txt
    ;;
esac
case "$ONLY" in
  all|booking|message|classroom) ;;
  *) echo "用法：$0 [all|booking|message|classroom]" >&2; exit 1 ;;
esac

say "本次产出"
column -t /tmp/lesson-image-tags.txt 2>/dev/null || cat /tmp/lesson-image-tags.txt

echo
echo "下一步（二选一）："
echo "  A. 本地已有镜像 → 打包上传 → 服务器 load → 切版本："
echo "       bash deploy/docker/release.sh            # 一条命令走完全程"
echo "  B. 只想手工搬镜像："
echo "       docker save lesson/booking-api:<tag> | gzip > /tmp/booking.tgz"
echo "       scp /tmp/booking.tgz root@server:/tmp/ && ssh root@server 'docker load -i /tmp/booking.tgz'"
echo "       ssh root@server 'sudo bash /opt/lesson/docker/switch.sh booking <tag>'"
