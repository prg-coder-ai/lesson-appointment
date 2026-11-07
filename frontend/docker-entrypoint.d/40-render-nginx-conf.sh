#!/bin/sh
# ==============================================================================
# 40-render-nginx-conf.sh —— 容器启动时渲染 nginx 配置
#
# 为什么放在启动时而不是构建时：
#   上游地址属于「部署环境」信息，不是「镜像」信息。构建时烧进去，换环境就得重新
#   构建一遍（云托管每个服务独立构建，代价不小）。改成运行时读环境变量，同一个
#   镜像可以在 dev / prod / 不同 envid 之间直接复用。
#
# 为什么不用 nginx 官方镜像的 /etc/nginx/templates 机制：
#   官方 entrypoint 的 20-envsubst-on-templates.sh 默认替换**所有** $VAR，
#   而我们模板里有大量 nginx 自己的变量（$host / $remote_addr / $proxy_add_x_forwarded_for
#   …），被 envsubst 替换成空串后，反代请求会丢掉真实 IP、Host 变成空，问题极难排查。
#   这里用自定义脚本 + envsubst 白名单，只替换明确列出的两个变量。
#
# 本脚本由 nginx 官方 entrypoint 在启动 nginx 之前按文件名顺序自动执行，
# 失败即 exit 1 → 容器起不来 → 云托管日志里能直接看到下面的中文报错，不会
# 出现「容器 Running 但全站 502」这种半死状态。
# ==============================================================================
set -eu

TPL=/opt/nginx/default.conf.template
OUT=/etc/nginx/conf.d/default.conf

if [ ! -f "$TPL" ]; then
    echo "[nginx-config] ERROR: 模板不存在：$TPL" >&2
    exit 1
fi

if [ -z "${API_UPSTREAM:-}" ]; then
    echo "[nginx-config] ERROR: 缺少环境变量 API_UPSTREAM" >&2
    echo "  例：http://api.<envid>.svc.cluster.local:8081" >&2
    echo "  或：https://api-<envid>.sh.run.tcloudbase.com" >&2
    exit 1
fi

if [ -z "${MSG_UPSTREAM:-}" ]; then
    echo "[nginx-config] ERROR: 缺少环境变量 MSG_UPSTREAM" >&2
    echo "  例：http://message-service.<envid>.svc.cluster.local:8090" >&2
    echo "  或：https://message-service-<envid>.sh.run.tcloudbase.com" >&2
    exit 1
fi

# proxy_pass 带尾斜杠会变成「前缀替换」，把 /api/v1/ 吃掉导致后端全 404 —— 统一去掉
API_UPSTREAM="${API_UPSTREAM%/}"
MSG_UPSTREAM="${MSG_UPSTREAM%/}"
export API_UPSTREAM MSG_UPSTREAM

# 防呆：两个上游填反是最常见的配置事故，表现是「接口全 404」而不是连不上
case "$API_UPSTREAM" in
    *message*) echo "[nginx-config] ERROR: API_UPSTREAM 指向了消息服务：$API_UPSTREAM" >&2; exit 1 ;;
esac
case "$MSG_UPSTREAM" in
    *message*) ;;
    *) echo "[nginx-config] WARN: MSG_UPSTREAM 看起来不像消息服务：$MSG_UPSTREAM" >&2 ;;
esac

# 白名单替换：只动这两个，nginx 自己的 $host / $remote_addr 原样保留
envsubst '${API_UPSTREAM} ${MSG_UPSTREAM}' < "$TPL" > "$OUT"

echo "[nginx-config] API_UPSTREAM=$API_UPSTREAM"
echo "[nginx-config] MSG_UPSTREAM=$MSG_UPSTREAM"
grep -n 'proxy_pass' "$OUT" | sed 's/^/[nginx-config] /'
