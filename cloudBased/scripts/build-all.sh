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
CLOUD_WEB="$PROJECT_ROOT/cloudBased/frontend"
# web 的构建上下文就是 cloudBased/frontend 本身（Dockerfile + default.conf.template + dist
# 都在这个目录里，COPY dist 依赖它）。原先那套「源文件放 deploy/nginx/cloudbase-web、
# 再拷进暂存目录 cloudBased/web」已废弃 —— 那套是 listen 80 的老镜像（与云托管
# containerPort 8080 不一致，上线即全站 502），2026-11-08 连同源文件一起删除。

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

    # ★ 两个服务的落点**故意不同**，别"统一"成同一个路径：
    #   api/Dockerfile            → COPY booking-api-2.2.0.jar         （构建上下文根目录）
    #   message-service/Dockerfile → COPY target/message-service-1.1.0.jar
    # 之前 api 也往 target/ 拷，而 Dockerfile 读的是根目录那份，导致镜像里装的是
    # 仓库里遗留的旧 jar（改了代码却不生效，排查时极易误判成"代码没编译进去"）。
    mkdir -p "$CLOUD_API" "$CLOUD_MSG/target"
    cp "$API_DIR/target/booking-api-2.2.0.jar"     "$CLOUD_API/"
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
# Step 2.5 — 产物收口到 deploy/（前端 build.js 已自动收 dist，这里再统一兜一次）
# ==============================================================================
ONLY_PARTS=()
# 注意：set -e 下不能写 `[ cond ] && arr+=(...)`，条件为假时整行返回 1 会直接退出脚本
if [ $SKIP_BE -eq 0 ]; then ONLY_PARTS+=("jars"); fi
if [ $SKIP_FE -eq 0 ]; then ONLY_PARTS+=("dist"); fi
if [ ${#ONLY_PARTS[@]} -gt 0 ]; then
    step "Step 2.5 — 产物收口到 deploy/"
    ONLY_ARG="$(IFS=,; echo "${ONLY_PARTS[*]}")"
    node "$PROJECT_ROOT/deploy/collect-artifacts.js" --only "$ONLY_ARG"
    ok "deploy/dist/ 与 deploy/jars/ 已更新（不入库，供 upload-to-server.sh 取件）"
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

    # web 的上游地址**不再进镜像**：API_UPSTREAM / MSG_UPSTREAM 走**运行时环境变量**，
    # 由容器的 00-resolver.sh 在启动时渲染 nginx 配置。所以这里不传 --build-arg，
    # 换环境/换内网域名只要改控制台环境变量 + 重启实例，同一个镜像可复用。
    #
    # ⚠ 部署前必须在 云托管控制台 → 服务设置 → 环境变量 配好这两个，否则容器启动即失败：
    #   API_UPSTREAM = http://api-xxxxxxxx.<region>.internal-run.tcloudbase.com:8081
    #   MSG_UPSTREAM = http://message-service-xxxxxxxx.<region>.internal-run.tcloudbase.com:8090
    #   （内网域名从「内网访问」复制，带端口 8081/8090；公网兜底则 https 不带端口）
    # ❌ 绝不可用 <服务名>.<envid>.svc.cluster.local —— 微信云托管无此 DNS 记录（实测 NXDOMAIN）

    # 构建上下文 = cloudBased/frontend（Dockerfile 里的 COPY dist 依赖同目录的 dist/）。
    # 缺文件就在这一步炸，别等到 docker build 报 Dockerfile not found。
    [ -f "$CLOUD_WEB/Dockerfile" ]            || fail "缺少 $CLOUD_WEB/Dockerfile"
    [ -f "$CLOUD_WEB/default.conf.template" ] || fail "缺少 $CLOUD_WEB/default.conf.template"
    [ -d "$CLOUD_WEB/dist" ]                  || fail "缺少 $CLOUD_WEB/dist（先跑前端构建，别加 --skip-frontend）"
    ok "web 构建上下文就绪：cloudBased/frontend"

    echo "  🐳 booking-web:latest  (上游走运行时环境变量，构建不需 --build-arg) ..."
    (cd "$CLOUD_WEB" && docker build -t "booking-web:latest" .) || fail "web docker build 失败"
    ok "booking-web:latest"
    warn "别忘了在云托管控制台配 API_UPSTREAM / MSG_UPSTREAM 环境变量，缺失会导致容器启动失败"

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
echo "  统一收口：deploy/jars/（三个 jar，取最新版本） + deploy/dist/（镜像 frontend/dist）"
echo "            → deploy/upload-to-server.sh 优先从这里取件（两者均不入库）"
echo ""
echo "  下一步："
echo "    方式 A — 控制台「上传代码包 / Dockerfile」"
echo "    方式 B — 流水线：授权代码源 + container.config.json"
if [ -n "$ENV_ID" ]; then
    echo "    方式 C — 已推镜像：ccr.ccs.tencentyun.com/cb-$ENV_ID/<服务>:<tag>"
fi

ok "全部完成 ✨"
