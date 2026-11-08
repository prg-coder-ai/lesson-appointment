#!/bin/sh
# ==============================================================================
# 00-resolver.sh —— 容器启动引导（nginx 官方 entrypoint 在启动 nginx 之前自动执行）
#
# 干三件事：
#   ① 用运行时环境变量 API_UPSTREAM / MSG_UPSTREAM 渲染 /etc/nginx/conf.d/default.conf
#   ② 从 /etc/resolv.conf 生成 nginx 的 resolver 指令（变量形式 proxy_pass 的硬前提）
#   ③ nginx -t 自检 + 把生效的上游打印到 stdout
#
# 为什么在**启动时**渲染，而不是构建期：
#   上游地址属于「部署环境」信息，不是「镜像」信息。运行时渲染后，换内网域名、换环境
#   只需要在控制台改环境变量 + 重启实例，同一镜像可复用；而内网域名随重新部署会变，
#   一旦烧进镜像必然过期（这正是 2026-11-08 那次 502 的成因）。
#
# 环境变量（云托管控制台 → 服务设置 → 环境变量）：
#   API_UPSTREAM  例：http://api-xxxxxxxx.ap-shanghai.internal-run.tcloudbase.com:8081
#   MSG_UPSTREAM  例：http://message-service-xxxxxxxx.ap-shanghai.internal-run.tcloudbase.com:8090
#
#   ⚠ 内网域名必须带端口，且端口只能等于该服务**发布时填写的容器端口**
#     （api=8081 / message-service=8090），其他端口不可用；内网是 http，不是 https。
#   ⚠ 公网域名则相反：https、不带端口。
#   ❌ 绝对不要用 <服务名>.<环境ID>.svc.cluster.local —— 微信云托管没有这套 K8s Service
#      DNS 记录。2026-11-08 实例内实测：该名字 NXDOMAIN，同命名空间短名 api 也是
#      NXDOMAIN，/etc/resolv.conf 只有 nameserver 127.0.0.1（平台本地 stub，不做服务发现）。
#
# 为什么失败就 exit 1（宁可容器起不来）：
#   配置错 / 变量缺 的表现如果只是「接口全 502」，排查成本极高；容器启动失败在云托管
#   日志面板里一眼能看到下面这些中文报错。
# ==============================================================================
set -eu

TPL=/opt/nginx/default.conf.template
OUT=/etc/nginx/conf.d/default.conf
RESOLVER_CONF=/etc/nginx/conf.d/00-resolver.conf

# ------------------------------------------------------------------------------
# ① 取变量 + 校验
# ------------------------------------------------------------------------------
API_UPSTREAM="${API_UPSTREAM:-}"
MSG_UPSTREAM="${MSG_UPSTREAM:-}"

die() { echo "[nginx-boot] ERROR: $*" >&2; exit 1; }

[ -f "$TPL" ] || die "模板不存在：$TPL（镜像构建有问题）"

[ -n "$API_UPSTREAM" ] || die "缺少环境变量 API_UPSTREAM
  例：http://api-xxxxxxxx.ap-shanghai.internal-run.tcloudbase.com:8081
  到 云托管控制台 → 服务设置 → 环境变量 里配置（内网域名从「内网访问」处复制）"
[ -n "$MSG_UPSTREAM" ] || die "缺少环境变量 MSG_UPSTREAM
  例：http://message-service-xxxxxxxx.ap-shanghai.internal-run.tcloudbase.com:8090
  到 云托管控制台 → 服务设置 → 环境变量 里配置"

# 去尾斜杠：proxy_pass 带尾斜杠会变成「前缀替换」，把 /api/v1/ 吃掉导致后端全 404
API_UPSTREAM="${API_UPSTREAM%/}"
MSG_UPSTREAM="${MSG_UPSTREAM%/}"

# 硬拦已被实测证伪的写法（见文件头）
case "$API_UPSTREAM" in
    *svc.cluster.local*)
        die "API_UPSTREAM 用了 svc.cluster.local —— 微信云托管无此 DNS 记录（实测 NXDOMAIN），必 502：$API_UPSTREAM" ;;
esac
case "$MSG_UPSTREAM" in
    *svc.cluster.local*)
        die "MSG_UPSTREAM 用了 svc.cluster.local —— 同上，必 502：$MSG_UPSTREAM" ;;
esac

# 防呆：两个上游填反是最常见的配置事故，表现是「接口全 404」而不是连不上
case "$API_UPSTREAM" in
    *message*) die "API_UPSTREAM 指向了消息服务：$API_UPSTREAM" ;;
esac
case "$MSG_UPSTREAM" in
    *message*) ;;
    *) echo "[nginx-boot] WARN: MSG_UPSTREAM 看起来不像消息服务：$MSG_UPSTREAM" >&2 ;;
esac

export API_UPSTREAM MSG_UPSTREAM

# ------------------------------------------------------------------------------
# ② 白名单渲染：只替换这两个变量，nginx 自己的 $host / $remote_addr 原样保留
#    （不能用官方 /etc/nginx/templates 机制：20-envsubst-on-templates.sh 会替换**所有** $VAR，
#      把 nginx 变量清成空串 —— 反代会丢真实 IP、Host 变空，排查成本极高）
# ------------------------------------------------------------------------------
envsubst '${API_UPSTREAM} ${MSG_UPSTREAM}' < "$TPL" > "$OUT"

grep -qF 'proxy_pass $api_upstream' "$OUT" \
    || die "渲染结果里找不到 proxy_pass \$api_upstream —— 模板或 envsubst 白名单有问题"
if grep -q 'API_UPSTREAM}' "$OUT" || grep -q 'MSG_UPSTREAM}' "$OUT"; then
    die "渲染结果里仍有未替换的占位符（envsubst 没生效）"
fi

# ------------------------------------------------------------------------------
# ③ 生成 resolver（变量形式 proxy_pass 的硬前提，缺了就是每请求 502）
#    nginx -t **不检查** resolver 是否存在（请求期行为），只能在这里兜底。
# ------------------------------------------------------------------------------
RAW=$(awk '/^nameserver/{print $2}' /etc/resolv.conf 2>/dev/null || true)

# 剔除会打环的本地 stub（systemd-resolved 127.0.0.53 / dnsmasq 127.0.0.51），
# 保留 127.0.0.1 —— 云托管的 stub 恰好就是它，不能用同一条规则误杀。
SERVERS=$(printf '%s\n' "$RAW" \
    | grep -vE '^(127\.0\.0\.51|127\.0\.0\.53)$' \
    | tr '\n' ' ' \
    | sed 's/ *$//' || true)

if [ -z "$SERVERS" ]; then
    echo "[nginx-boot] FATAL: /etc/resolv.conf 里没有可用的 nameserver。" >&2
    echo "  没有 resolver，proxy_pass 的变量形式会让所有接口 502。" >&2
    echo "  当前 /etc/resolv.conf 内容：" >&2
    cat /etc/resolv.conf >&2
    exit 1
fi

echo "resolver ${SERVERS} valid=10s ipv6=off;" > "$RESOLVER_CONF"

# ------------------------------------------------------------------------------
# ④ 自检 + 回显（云托管日志面板直接可见，排查 502 时第一眼看这几行）
# ------------------------------------------------------------------------------
echo "[nginx-boot] resolver   -> ${SERVERS}"
echo "[nginx-boot] API_UPSTREAM = ${API_UPSTREAM}"
echo "[nginx-boot] MSG_UPSTREAM = ${MSG_UPSTREAM}"
echo "[nginx-boot] 生效的上游配置："
grep -nE '_upstream "|proxy_pass' "$OUT" | sed 's/^/[nginx-boot]   /' || true
echo "[nginx-boot] /etc/resolv.conf："
sed 's/^/[nginx-boot]   /' /etc/resolv.conf

nginx -t || die "nginx 配置语法校验未通过（见上方 nginx 输出）"
echo "[nginx-boot] nginx -t OK，启动 nginx"
