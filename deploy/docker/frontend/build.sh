#!/usr/bin/env bash
# ==============================================================================
# 构建前端镜像（在**开发机**跑，不在服务器上跑）
#
#   bash deploy/docker/frontend/build.sh              # 用 frontend/dist 构建
#   DIST_SRC=/tmp/dist bash deploy/docker/frontend/build.sh
#   IMAGE=registry.example.com/lesson/frontend bash deploy/docker/frontend/build.sh
#
# 为什么要先把 dist 拷到本目录再 build：
#   本目录是构建上下文（`COPY dist /var/www/frontend`）。若把上下文设成仓库根，
#   docker 要把整个仓库（含 node_modules、target、各份 dist）打成 tar 传进 daemon，
#   几百 MB 起步，且必须新增一份仓库级 .dockerignore —— 那会影响后端镜像的构建。
#   只拷 dist（约 5MB）最省事，也和 cloudBased/frontend 的做法一致。
#
# 产物 tag：<dist 构建时间>-<git sha>，例如 lesson/frontend:202611210403-9d7221b
#   · 前半段来自 dist/build-info.json 的 buildTime（**内容**是哪批）；
#   · 后半段来自当前 HEAD（**代码**是哪次提交）。
#   两者不一致说明 dist 不是用当前代码构建的 —— 脚本会 WARN，见下面第 3 步。
# ==============================================================================
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)

IMAGE=${IMAGE:-lesson/frontend}
DIST_SRC=${DIST_SRC:-$REPO/frontend/dist}
DOCKERFILE="$HERE/Dockerfile"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ 1. 前置检查
say "1/5 检查构建前置条件"

command -v docker >/dev/null 2>&1 || die "找不到 docker。本机只做语法自检的话可以跳过构建，见文档「不装 docker 如何验证配置」。"
docker info >/dev/null 2>&1 || die "docker daemon 没在跑（Windows 上先启动 Docker Desktop）"

[ -d "$DIST_SRC" ] || die "dist 目录不存在：$DIST_SRC
  先在仓库根跑：CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js"

for f in index.html login.html build-info.json; do
    [ -f "$DIST_SRC/$f" ] || die "dist 缺少 $f —— 构建未完成或产物不完整：$DIST_SRC"
done
echo "    dist 来源: $DIST_SRC"

# ------------------------------------------------------------------ 2. 拷贝 dist
say "2/5 拷贝 dist 到构建上下文（本目录/dist，已 gitignore）"

rm -rf "$HERE/dist"
mkdir -p "$HERE/dist"
if command -v rsync >/dev/null 2>&1; then
    rsync -a "$DIST_SRC/" "$HERE/dist/"
else
    cp -a "$DIST_SRC/." "$HERE/dist/"
fi

CNT=$(find "$HERE/dist" -type f | wc -l | tr -d ' ')
[ "$CNT" -gt 10 ] || die "拷贝后只有 $CNT 个文件，dist 像是空的"
echo "    已拷入 $CNT 个文件，$(du -sh "$HERE/dist" | cut -f1)"

# ------------------------------------------------------------------ 3. 版本一致性
say "3/5 校验 dist 与代码版本是否对得上"

DIST_SHA=$(node -e "try{process.stdout.write((require('$HERE/dist/build-info.json').gitCommit||'').slice(0,7))}catch(e){}" 2>/dev/null || true)
HEAD_SHA=$(git -C "$REPO" rev-parse --short=7 HEAD 2>/dev/null || echo "")
BUILD_TIME=$(node -e "try{process.stdout.write(require('$HERE/dist/build-info.json').buildTime||'')}catch(e){}" 2>/dev/null || true)

[ -n "$BUILD_TIME" ] || die "build-info.json 里没有 buildTime，dist 不完整"
# 2026-11-21T04:03:04.615Z → 202611210403
BT_TAG=$(printf '%s' "$BUILD_TIME" | tr -d -- '-:T' | cut -c1-12)

if [ -n "$HEAD_SHA" ] && [ -n "$DIST_SHA" ] && [ "$HEAD_SHA" != "$DIST_SHA" ]; then
    printf '\033[1;33m    WARN: dist 的 gitCommit=%s，当前 HEAD=%s —— dist 不是用当前代码构建的。\n' "$DIST_SHA" "$HEAD_SHA"
    printf '          如果这是有意的（回滚到旧版前端），可以继续；否则先重跑 node frontend/build.js。\033[0m\n'
else
    echo "    dist 与 HEAD 一致（$HEAD_SHA），buildTime=$BUILD_TIME"
fi

TAG="${BT_TAG}-${HEAD_SHA:-nogit}"
FULL="$IMAGE:$TAG"

# ------------------------------------------------------------------ 4. 构建
say "4/5 docker build → $FULL"

docker build \
    --file "$DOCKERFILE" \
    --build-arg "BUILD_VERSION=$TAG" \
    --label "org.opencontainers.image.revision=${HEAD_SHA:-unknown}" \
    --label "org.opencontainers.image.version=$TAG" \
    --tag "$FULL" \
    --tag "$IMAGE:latest" \
    "$HERE"

SIZE=$(docker image inspect -f '{{.Size}}' "$FULL" | awk '{printf "%.0fMB", $1/1024/1024}')

# ------------------------------------------------------------------ 5. 构建期自检
say "5/5 构建期自检（不启动服务，只查镜像内部）"

# ① 镜像里静态站点必须完整，且不该带部署文件
docker run --rm --entrypoint sh "$FULL" -c '
    set -e
    test -f /var/www/frontend/index.html
    test -f /var/www/frontend/login.html
    test -f /opt/nginx/default.conf.template
    test -f /opt/nginx/proxy_params
    test -f /etc/nginx/conf.d/00-proxy-map.conf
    test ! -e /var/www/frontend/Dockerfile
    test ! -e /var/www/frontend/container.config.json
    echo "    静态站点与配置模板齐备，无部署文件泄漏"
'

# ② 三个上游缺失时必须「起不来」而不是带病启动（这是关键行为的回归测试）
if docker run --rm --network none "$FULL" >/tmp/fe-noenv.log 2>&1; then
    die "没给上游环境变量容器却启动了 —— 预检没生效，配置错了会静默 502"
else
    grep -q 'BOOKING_UPSTREAM' /tmp/fe-noenv.log \
        || { cat /tmp/fe-noenv.log; die "报错信息里没提 BOOKING_UPSTREAM，预检逻辑不对"; }
    echo "    缺环境变量时按预期失败（报错指向 BOOKING_UPSTREAM）"
fi

# ③ 给全环境变量后配置必须能渲染并通过 nginx -t
#    注意：用后台 PID 精确收尾，**不要** pkill -f "nginx: master" —— 宿主机上
#    可能就有一个 nginx 在跑，一条 pkill 会把线上服务打掉（这个坑很容易踩）。
CID=$(docker run -d --network none \
        -e BOOKING_UPSTREAM=http://127.0.0.1:8081 \
        -e MSG_UPSTREAM=http://127.0.0.1:8090 \
        -e CLASSROOM_UPSTREAM=http://127.0.0.1:8092 \
        "$FULL")
sleep 5
docker logs "$CID" >/tmp/fe-boot.log 2>&1 || true
if grep -q 'nginx -t OK' /tmp/fe-boot.log; then
    echo "    nginx -t 通过，配置渲染正常"
else
    cat /tmp/fe-boot.log
    docker rm -f "$CID" >/dev/null 2>&1 || true
    die "启动日志里没有 'nginx -t OK'（见上）"
fi
docker rm -f "$CID" >/dev/null 2>&1 || true

say "完成"
echo "    镜像  $FULL"
echo "    别名  $IMAGE:latest"
echo "    大小  $SIZE"
echo
echo "  下一步（二选一）："
echo "    · 本机跑起来看效果："
echo "        docker run -d --name fe --network host \\"
echo "          -e BOOKING_UPSTREAM=http://127.0.0.1:8081 \\"
echo "          -e MSG_UPSTREAM=http://127.0.0.1:8090 \\"
echo "          -e CLASSROOM_UPSTREAM=http://127.0.0.1:8092 \\"
echo "          -v /var/www/app-config:/app-config:ro \\"
echo "          $FULL"
echo "        bash deploy/docker/frontend/verify.sh http://127.0.0.1:8080"
echo "    · 分发到服务器：docker save $FULL | gzip > frontend-$TAG.tar.gz"
echo "        服务器上 gunzip -c frontend-$TAG.tar.gz | docker load"
echo "        再在 compose 的 .env 里把 FRONTEND_TAG 改成 $TAG"
