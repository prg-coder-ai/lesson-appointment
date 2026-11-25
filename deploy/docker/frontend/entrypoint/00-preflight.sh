#!/bin/sh
# ==============================================================================
# 00-preflight.sh —— 前端容器启动引导（nginx 官方 entrypoint 在起 nginx 之前执行）
#
# 四件事：
#   ① 校验三个上游环境变量（缺 / 填反 / 用了不存在的写法 → 当场 exit 1）
#   ② 白名单 envsubst 渲染 /opt/nginx/default.conf.template → /etc/nginx/conf.d/default.conf
#   ③ 渲染结果体检（占位符残留、proxy_pass 段数）
#   ④ 把生效配置打到 stdout（docker logs 直接可查）+ nginx -t 自检
#
# 为什么「错就 exit 1」而不是「带病启动」：
#   配置错的典型表现是「容器 Running、页面能打开、接口全 502/404」。运维看不到
#   任何报错，只能一层层试 nginx -t、curl、比配置，排查成本极高。让容器起不来，
#   故障就直接暴露在 docker ps / docker logs 的第一屏。
#
# 为什么在**启动时**渲染而不是构建期：
#   上游地址属于「部署环境」，不属于「镜像」。启动时渲染后，同一镜像可以跑在
#   8081/9081 不同端口、可以跑在「后端同机」或「后端在另一台」两种拓扑，
#   换环境只改 compose 的 environment 并重启容器，不重建镜像、不重新分发。
# ==============================================================================
set -eu

TPL=/opt/nginx/default.conf.template
PROXY_PARAMS=/opt/nginx/proxy_params
OUT=/etc/nginx/conf.d/default.conf
WEB_ROOT=/var/www/frontend

die() {
    echo "[frontend-boot] ERROR: $*" >&2
    exit 1
}
say() { echo "[frontend-boot] $*"; }

# ------------------------------------------------------------------------------
# ① 变量校验
# ------------------------------------------------------------------------------
BOOKING_UPSTREAM="${BOOKING_UPSTREAM:-}"
MSG_UPSTREAM="${MSG_UPSTREAM:-}"
CLASSROOM_UPSTREAM="${CLASSROOM_UPSTREAM:-}"

[ -f "$TPL" ] || die "模板不存在：$TPL（镜像构建有问题，重新 build）"
[ -f "$PROXY_PARAMS" ] || die "proxy_params 不存在：$PROXY_PARAMS（镜像构建有问题）"

[ -n "$BOOKING_UPSTREAM" ] || die "缺少环境变量 BOOKING_UPSTREAM
  例：http://127.0.0.1:8081
  在 docker-compose.yml 的 environment 里配置；后端不在本机时填 http://<内网IP>:8081"

[ -n "$MSG_UPSTREAM" ] || die "缺少环境变量 MSG_UPSTREAM
  例：http://127.0.0.1:8090"

[ -n "$CLASSROOM_UPSTREAM" ] || die "缺少环境变量 CLASSROOM_UPSTREAM
  例：http://127.0.0.1:8092"

# 去尾斜杠：proxy_pass 带尾斜杠会变成「前缀替换」，把 /api/v1/ 从 URI 里吃掉，
# 后端收到 /classrooms/xxx，全站 404，而且日志里看着像是前端拼错了路径。
BOOKING_UPSTREAM="${BOOKING_UPSTREAM%/}"
MSG_UPSTREAM="${MSG_UPSTREAM%/}"
CLASSROOM_UPSTREAM="${CLASSROOM_UPSTREAM%/}"

# 协议与主机名基本格式（防止填成 127.0.0.1:8081 少了 http:// 这种，
# 那种写法 nginx -t 会过，运行期报 "invalid URL prefix"）
case "$BOOKING_UPSTREAM" in
    http://*|https://*) ;;
    *) die "BOOKING_UPSTREAM 必须以 http:// 或 https:// 开头，当前：$BOOKING_UPSTREAM" ;;
esac
case "$MSG_UPSTREAM" in
    http://*|https://*) ;;
    *) die "MSG_UPSTREAM 必须以 http:// 或 https:// 开头，当前：$MSG_UPSTREAM" ;;
esac
case "$CLASSROOM_UPSTREAM" in
    http://*|https://*) ;;
    *) die "CLASSROOM_UPSTREAM 必须以 http:// 或 https:// 开头，当前：$CLASSROOM_UPSTREAM" ;;
esac

# 已被实测证伪的写法：微信云托管没有 K8s 服务发现，这个域名恒 NXDOMAIN。
# 自建 CVM 上没人会这么写，但同一份 compose 常被两处复用，拦一下省事。
case "$BOOKING_UPSTREAM$MSG_UPSTREAM$CLASSROOM_UPSTREAM" in
    *svc.cluster.local*) die "上游用了 svc.cluster.local —— 该名字无 DNS 记录，必 502" ;;
esac

# 防呆：两个上游填反是最常见的配置事故，症状是「接口全 404」而不是连不上
case "$BOOKING_UPSTREAM" in
    *message*|*classroom*) die "BOOKING_UPSTREAM 指向了别的服务：$BOOKING_UPSTREAM" ;;
esac
case "$MSG_UPSTREAM" in
    *message*) ;;
    *) say "WARN: MSG_UPSTREAM 看起来不像消息服务：$MSG_UPSTREAM" ;;
esac
case "$CLASSROOM_UPSTREAM" in
    *classroom*) ;;
    *) say "WARN: CLASSROOM_UPSTREAM 看起来不像课堂服务：$CLASSROOM_UPSTREAM" ;;
esac

export BOOKING_UPSTREAM MSG_UPSTREAM CLASSROOM_UPSTREAM

# ------------------------------------------------------------------------------
# ② 白名单渲染
#
#   只替换这三个，nginx 自己的 $host / $uri / $remote_addr 原样保留。
#   不能用官方 /etc/nginx/templates 机制：20-envsubst-on-templates.sh 替换**所有**
#   $VAR，会把 nginx 变量清成空串 —— 反代丢真实 IP、Host 变空，且它替换后不做
#   nginx -t 就直接起服务。
#
#   envsubst 来自 gettext，nginx 官方 alpine 镜像保留了该二进制（在
#   /usr/local/bin/envsubst）。换成别的 base 镜像时必须自己装，否则走到这里
#   会静默产生一份「全是空地址」的配置。
# ------------------------------------------------------------------------------
command -v envsubst >/dev/null 2>&1 \
    || die "envsubst 不存在（来自 gettext）。nginx 官方 alpine 镜像自带；换了 base 镜像请 apk add gettext"

envsubst '${BOOKING_UPSTREAM} ${MSG_UPSTREAM} ${CLASSROOM_UPSTREAM}' < "$TPL" > "$OUT" \
    || die "envsubst 渲染失败"

# ------------------------------------------------------------------------------
# ③ 渲染结果体检
# ------------------------------------------------------------------------------
# 残留占位符 = envsubst 白名单和模板对不上（改了模板忘了加变量）
if grep -q '\${[A-Z_]*}' "$OUT"; then
    echo "[frontend-boot] 渲染后有未替换的占位符：" >&2
    grep -n '\${[A-Z_]*}' "$OUT" >&2
    die "模板占位符与 envsubst 白名单不一致"
fi

# 三条分流必须都在：少一条意味着整类接口落到 8081 变 403/404
N_BOOKING=$(grep -c "proxy_pass ${BOOKING_UPSTREAM}" "$OUT" || true)
N_MSG=$(grep -c "proxy_pass ${MSG_UPSTREAM}" "$OUT" || true)
N_CLASSROOM=$(grep -c "proxy_pass ${CLASSROOM_UPSTREAM}" "$OUT" || true)
[ "${N_BOOKING:-0}" -ge 1 ]   || die "渲染结果里没有指向 BOOKING_UPSTREAM 的 proxy_pass"
[ "${N_MSG:-0}" -ge 1 ]       || die "渲染结果里没有指向 MSG_UPSTREAM 的 proxy_pass"
[ "${N_CLASSROOM:-0}" -ge 1 ] || die "渲染结果里没有指向 CLASSROOM_UPSTREAM 的 proxy_pass"

# 静态资源必须真的在（dist 没拷进来 / COPY 路径写错时，nginx 会回 403，
# 排查时很像权限问题）
[ -f "$WEB_ROOT/index.html" ] || die "静态站点缺少 $WEB_ROOT/index.html —— 镜像构建时 dist 没拷进来"
[ -f "$WEB_ROOT/login.html" ] || die "静态站点缺少 $WEB_ROOT/login.html"

# 小程序远程配置：从挂载目录拷进站点根（不是直接挂到站点根那个文件上）
#
# 为什么挂目录再拷，而不是 `-v /host/app-config.json:/var/www/frontend/app-config.json`：
#   单文件挂载时，宿主机那个路径**不存在** docker 会顺手建一个**同名目录**，
#   容器里 app-config.json 就成了目录 → 请求它返回 403/500，而且报错完全不提
#   「挂载建了目录」这件事，排查方向全偏。挂目录 + 条件拷贝就不存在这个问题：
#   目录空着就跳过，站点该 404 就 404（小程序回落 env.js）。
if [ -f /app-config/app-config.json ]; then
    cp /app-config/app-config.json "$WEB_ROOT/app-config.json"
    say "app-config.json   = 已从 /app-config 拷入站点根"
else
    say "app-config.json   = 未提供（小程序会回落到 env.js 里的地址）"
fi

# ------------------------------------------------------------------------------
# ④ 回显 + 自检
# ------------------------------------------------------------------------------
say "BOOKING_UPSTREAM   = ${BOOKING_UPSTREAM}  (${N_BOOKING} 段)"
say "MSG_UPSTREAM       = ${MSG_UPSTREAM}  (${N_MSG} 段)"
say "CLASSROOM_UPSTREAM = ${CLASSROOM_UPSTREAM}  (${N_CLASSROOM} 段)"

say "生效的分流规则："
grep -nE '^\s*location|proxy_pass' "$OUT" | sed 's/^/[frontend-boot]   /'

nginx -t || die "nginx 配置语法校验未通过（见上方输出）"
say "nginx -t OK，交给 nginx 启动"
