#!/usr/bin/env bash
# ==============================================================================
# build-all.sh —— 微信云托管 · 本地预打包一键脚本（Linux / macOS / Git Bash）
#
# 用法：
#   chmod +x cloudBased/scripts/build-all.sh
#   ./cloudBased/scripts/build-all.sh
#   ./cloudBased/scripts/build-all.sh --skip-frontend --skip-docker   # Java 改动时跳过前端
#   ./cloudBased/scripts/build-all.sh --env-id myenv01 --docker-push  # 推到云托管镜像仓库
#
# 参数：
#   --skip-frontend    跳过前端 node build.js
#   --skip-backend     跳过 Maven 打包
#   --skip-docker      跳过 docker build
#   --docker-push      推送镜像到云托管仓库（需与 --env-id 同用）
#   --env-id <ENV_ID>  云托管环境 ID，用于 docker tag 命名 + web 服务内网地址
# ==============================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_DIR="$PROJECT_ROOT/api"
MSG_DIR="$API_DIR/message-service"
FE_DIR="$PROJECT_ROOT/frontend"
CLOUD_API="$PROJECT_ROOT/cloudBased/api"
CLOUD_MSG="$PROJECT_ROOT/cloudBased/message-service"
CLOUD_WEB="$PROJECT_ROOT/cloudBased/web"
# web 的「源文件」在 deploy 下受版本控制；cloudBased/web 是纯暂存目录（.gitignore 已忽略），
# 构建前由本脚本把源码拷进去。理由：cloudBased/web 里还堆着 dist/、jar、web.zip 等产物，
# 整目录入库只会制造 diff 噪声与"源码/产物混在一起"的误判。
WEB_SRC="$PROJECT_ROOT/deploy/nginx/cloudbase-web"

SKIP_FE=0; SKIP_BE=0; SKIP_DOCKER=0; DOCKER_PUSH=0; ENV_ID=""
for a in "$@"; do
    case $a in
        --skip-frontend) SKIP_FE=1 ;;
        --skip-backend)  SKIP_BE=1 ;;
        --skip-docker)   SKIP_DOCKER=1 ;;
        --docker-push)   DOCKER_PUSH=1 ;;
        --env-id) shift; ENV_ID="$1" ;;
        *) echo "未知参数: $a"; exit 1 ;;
    esac
done

step() { echo -e "\n\033[36m▶ $1\033[0m"; }
ok()   { echo -e "  \033[32m✅ $1\033[0m"; }
warn() { echo -e "  \033[33m⚠️  $1\033[0m"; }
fail() { echo -e "  \033[31m❌ $1\033[0m"; exit 1; }

# ==============================================================================
# Step 1 — Maven 打包
# ==============================================================================
if [ $SKIP_BE -eq 0 ]; then
    step "Step 1 — Maven 打包后端服务"

    echo "  📦 api (booking-api-2.2.0.jar) ..."
    (cd "$API_DIR" && mvn clean package -DskipTests -q) || fail "api Maven 构建失败"

    echo "  📦 message-service (message-service-1.1.0.jar) ..."
    (cd "$MSG_DIR" && mvn clean package -DskipTests -q) || fail "message-service Maven 构建失败"

    mkdir -p "$CLOUD_API/target" "$CLOUD_MSG/target"
    cp "$API_DIR/target/booking-api-2.2.0.jar"     "$CLOUD_API/target/"
    cp "$MSG_DIR/target/message-service-1.1.0.jar" "$CLOUD_MSG/target/"

    ok "后端打包完成"
else
    warn "跳过 Maven 打包 (--skip-backend)"
fi

# ==============================================================================
# Step 2 — 前端构建
# ==============================================================================
if [ $SKIP_FE -eq 0 ]; then
    step "Step 2 — 前端构建 (node build.js)"

    (cd "$FE_DIR" && node build.js) || fail "前端构建失败"

    rm -rf "$CLOUD_WEB/dist"
    cp -r "$FE_DIR/dist" "$CLOUD_WEB/"

    ok "前端构建完成"
else
    warn "跳过前端构建 (--skip-frontend)"
fi

# ==============================================================================
# Step 3 — Docker 镜像
# ==============================================================================
if [ $SKIP_DOCKER -eq 0 ]; then
    step "Step 3 — Docker 镜像构建"

    command -v docker >/dev/null 2>&1 || fail "未检测到 docker"

    echo "  🐳 booking-api:2.2.0 ..."
    (cd "$CLOUD_API" && docker build -t "booking-api:2.2.0" .) || fail "api docker build 失败"
    ok "booking-api:2.2.0"

    echo "  🐳 booking-message-service:1.1.0 ..."
    (cd "$CLOUD_MSG" && docker build -t "booking-message-service:1.1.0" .) || fail "message-service docker build 失败"
    ok "booking-message-service:1.1.0"

    # 两个上游：api（8081）与 message-service（8090）是**两个独立的云托管服务**
    API_UPSTREAM="http://REPLACE_WITH_API_INTERNAL_HOST:8081"
    MSG_UPSTREAM="http://REPLACE_WITH_MESSAGE_INTERNAL_HOST:8090"
    if [ -n "$ENV_ID" ]; then
        API_UPSTREAM="http://api.$ENV_ID.svc.cluster.local:8081"
        MSG_UPSTREAM="http://message-service.$ENV_ID.svc.cluster.local:8090"
    fi

    # web 源文件：deploy/nginx/cloudbase-web → 暂存目录 cloudBased/web（构建上下文必须是这里，
    # Dockerfile 里的 COPY dist/ 依赖它）。缺文件就在这一步炸，别等到 docker build 报 Dockerfile not found。
    [ -f "$WEB_SRC/Dockerfile" ]           || fail "缺少 $WEB_SRC/Dockerfile"
    [ -f "$WEB_SRC/nginx.conf.template" ]  || fail "缺少 $WEB_SRC/nginx.conf.template"
    cp -f "$WEB_SRC/Dockerfile" "$WEB_SRC/nginx.conf.template" "$CLOUD_WEB/"
    ok "web 源文件已拷入暂存目录（deploy/nginx/cloudbase-web → cloudBased/web）"

    echo "  🐳 booking-web:latest  (API_UPSTREAM=$API_UPSTREAM  MSG_UPSTREAM=$MSG_UPSTREAM) ..."
    (cd "$CLOUD_WEB" && docker build \
        --build-arg "API_UPSTREAM=$API_UPSTREAM" \
        --build-arg "MSG_UPSTREAM=$MSG_UPSTREAM" \
        -t "booking-web:latest" .) || fail "web docker build 失败"
    ok "booking-web:latest"

    if [ $DOCKER_PUSH -eq 1 ]; then
        step "Step 3d — 推送镜像到云托管"
        [ -n "$ENV_ID" ] || fail "推送需要 --env-id"

        REGISTRY="ccr.ccs.tencentyun.com/cb-$ENV_ID"
        docker tag "booking-api:2.2.0"              "$REGISTRY/api:2.2.0"
        docker tag "booking-message-service:1.1.0"  "$REGISTRY/message-service:1.1.0"
        docker tag "booking-web:latest"             "$REGISTRY/web:latest"

        docker push "$REGISTRY/api:2.2.0"            || fail "api push 失败"
        docker push "$REGISTRY/message-service:1.1.0"|| fail "message-service push 失败"
        docker push "$REGISTRY/web:latest"           || fail "web push 失败"
        ok "镜像已推送到 $REGISTRY"
    fi
else
    warn "跳过 Docker 构建 (--skip-docker)"
fi

# ==============================================================================
# 汇总
# ==============================================================================
step "构建产物清单"
echo "  后端 jar：cloudBased/api/target/booking-api-2.2.0.jar"
echo "            cloudBased/message-service/target/message-service-1.1.0.jar"
echo "  前端 dist：cloudBased/web/dist/"
echo ""
echo "  下一步："
echo "    方式 A — 控制台「上传代码包 / Dockerfile」"
echo "    方式 B — 流水线：授权代码源 + container.config.json"
if [ -n "$ENV_ID" ]; then
    echo "    方式 C — 已推镜像：ccr.ccs.tencentyun.com/cb-$ENV_ID/<服务>:<tag>"
fi

ok "全部完成 ✨"
