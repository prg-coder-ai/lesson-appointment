#!/usr/bin/env bash
# ==============================================================================
# 前端镜像运行期配置校验 —— 逐条验证「配置真的生效了」，不是「容器起来了」
#
#   bash verify.sh                                   # 校验 http://127.0.0.1:8080
#   bash verify.sh https://booking.example.com       # 校验宿主机 nginx 入口（推荐）
#   bash verify.sh http://127.0.0.1:8080 /admin.html # 自定义入口页
#   NO_VERIFY=1 bash verify.sh https://x.test        # 自签证书时跳过校验证书
#
# 每条断言都对应一个真实故障模式，失败时的提示直接说明「哪条配置写错了」。
# 退出码：0 全过；1 有硬失败（必须修）；2 只有提示级项未通过。
# ==============================================================================
set -uo pipefail

BASE=${1:-http://127.0.0.1:8080}
ENTRY_PAGE=${2:-login.html}
BASE=${BASE%/}

CURL_OPTS=(-sS -o /dev/null --max-time 10)
[ "${NO_VERIFY:-0}" = "1" ] && CURL_OPTS+=(-k)

PASS=0
FAIL=0
WARN=0
RED=$'\033[1;31m'; GRN=$'\033[1;32m'; YEL=$'\033[1;33m'; CYN=$'\033[1;36m'; RST=$'\033[0m'

ok()   { PASS=$((PASS+1)); printf '  %sOK  %s%s\n' "$GRN" "$RST" "$*"; }
bad()  { FAIL=$((FAIL+1)); printf '  %sFAIL%s %s\n' "$RED" "$RST" "$*"; }
warn() { WARN=$((WARN+1)); printf '  %sWARN%s %s\n' "$YEL" "$RST" "$*"; }
head_() { printf '\n%s── %s ──%s\n' "$CYN" "$*" "$RST"; }

command -v curl >/dev/null 2>&1 || { echo "需要 curl"; exit 1; }

# 取状态码
code() { curl "${CURL_OPTS[@]}" -w '%{http_code}' "$BASE$1" 2>/dev/null || echo 000; }
# 取响应头（小写，便于 grep）
hdr()  { curl -sS -D - -o /dev/null --max-time 10 ${NO_VERIFY:+-k} "$BASE$1" 2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z'; }
# 取 Content-Type 里的主类型
ctype() { hdr "$1" | grep -i '^content-type:' | head -1 | cut -d: -f2- | tr -d ' ' | cut -d';' -f1; }

printf '%s前端配置校验%s  目标 %s\n' "$CYN" "$RST" "$BASE"

# ==============================================================================
head_ "1. 容器自身"
# ==============================================================================
H=$(curl -sS --max-time 5 ${NO_VERIFY:+-k} "$BASE/healthz" 2>/dev/null || true)
[ "$H" = "ok" ] && ok "/healthz 返回 ok（nginx 活着、配置已渲染）" \
                || bad "/healthz 期望 ok，实际 [$H] —— 容器没起好，或宿主机反代指错了端口"

C=$(code /)
[ "$C" = "200" ] && ok "根路径 200（index 指令指向 $ENTRY_PAGE）" \
                 || bad "根路径返回 $C —— root / index 配错，或 dist 没进镜像"

# ==============================================================================
head_ "2. 静态资源与缓存策略"
# ==============================================================================
C=$(code "/$ENTRY_PAGE")
[ "$C" = "200" ] && ok "/$ENTRY_PAGE 200" || bad "/$ENTRY_PAGE 返回 $C —— dist 里缺这个入口页"

CC=$(hdr "/$ENTRY_PAGE" | grep -i '^cache-control:' | head -1)
case "$CC" in
    *no-cache*) ok "html 的 Cache-Control = no-cache（改版立刻生效）" ;;
    *) warn "html 没有 no-cache：${CC:-<无 Cache-Control>} —— 上线后用户可能仍看到旧页面" ;;
esac

# 从 dist 里挑一个真实存在的 js/css 来验 7 天缓存
ASSET=""
for cand in $(curl -sS --max-time 5 ${NO_VERIFY:+-k} "$BASE/$ENTRY_PAGE" 2>/dev/null \
        | grep -oE '(src|href)="[^"]+\.(js|css)"' | sed 's/^[a-z]*="//; s/"$//' | head -5); do
    case "$cand" in
        http*) continue ;;
        /*) ASSET="$cand" ;;
        *)  ASSET="/$cand" ;;
    esac
    [ "$(code "$ASSET")" = "200" ] && break
    ASSET=""
done

if [ -n "$ASSET" ]; then
    ACC=$(hdr "$ASSET" | grep -i '^cache-control:' | head -1)
    case "$ACC" in
        *max-age=604800*|*max-age=2592000*) ok "静态资源 $ASSET 命中 7d 缓存（$ACC）" ;;
        *no-cache*) warn "$ASSET 是 no-cache —— 静态正则 location 没命中，检查扩展名列表" ;;
        *) warn "$ASSET 的 Cache-Control 异常：${ACC:-<无>}" ;;
    esac
else
    warn "入口页没解析出可测的 js/css（可能全是内联），跳过静态缓存校验"
fi

C=$(code /build-info.json)
[ "$C" = "200" ] && ok "/build-info.json 200（可查线上版本）" \
                 || bad "/build-info.json 返回 $C —— 镜像里没有这个文件，构建不完整"

C=$(code /app-config.json)
case "$C" in
    200) ok "/app-config.json 200（小程序远程配置已挂载）" ;;
    404) warn "/app-config.json 404 —— 没挂裁这个文件，小程序会回落到 env.js 里的地址" ;;
    *)   warn "/app-config.json 返回 $C" ;;
esac

# ==============================================================================
head_ "3. 多页语义：错链必须真 404"
# ==============================================================================
C=$(code /no-such-page-verify-xyz)
[ "$C" = "404" ] && ok "不存在的页面返回真 404（错链不会被静默成首页）" \
                 || bad "不存在的页面返回 $C —— location / 里有 /index.html 或 /login.html 回退，必须改成 =404"

# ==============================================================================
head_ "4. 三服务分流"
# ==============================================================================
# 4.1 主服务 8081：system/info 是免登录接口
C=$(code /api/v1/system/info)
CT=$(ctype /api/v1/system/info)
if [ "$C" = "200" ] && [ "$CT" != "text/html" ]; then
    ok "/api/v1/system/info 200（→ 8081 booking 通）"
elif [ "$C" = "502" ] || [ "$C" = "504" ]; then
    bad "/api/v1/system/info $C —— 8081 上游连不上：后端没起，或 BOOKING_UPSTREAM 写错"
elif [ "$CT" = "text/html" ]; then
    bad "/api/v1/system/info 返回 HTML（$C）—— 请求没进反代，落到了静态 location"
else
    warn "/api/v1/system/info 返回 $C（非 200，但已到达后端）"
fi

# 4.2 消息服务 8090
C=$(code /msg-health)
[ "$C" = "200" ] && ok "/msg-health 200（→ 8090 消息服务通）" \
                 || bad "/msg-health 返回 $C —— 8090 上游连不上，或 MSG_UPSTREAM 写错"

# 4.3 ★ mp4 必须走课堂服务，不能被静态正则抢走
#     被抢走的表现：404 + text/html（静态根下找文件失败）
MP4=/api/v1/files/__verify_nonexistent__.mp4
C=$(code "$MP4"); CT=$(ctype "$MP4")
if [ "$CT" = "text/html" ]; then
    bad "$MP4 返回 HTML（$C）—— 被静态正则 location 抢走了！
        修法：把 /api/v1/files/ 那条 location 改成 location ^~ /api/v1/files/
        （正则 location 优先级高于普通前缀，只有 ^~ 能压住它）"
else
    ok "$MP4 走的是反代（$C，$CT）—— ^~ 前缀保护生效，课件/录播不会被静态正则吃"
fi

# 4.4 ★ 无子段的 /api/v1/admin/classrooms 必须精确命中课堂服务
#     漏掉的表现：落到 /api/v1/ → 8081 → denyAll 403「无权限访问该资源」
C=$(code /api/v1/admin/classrooms); CT=$(ctype /api/v1/admin/classrooms)
if [ "$CT" = "text/html" ] && [ "$C" = "404" ]; then
    bad "/api/v1/admin/classrooms（无子段）404 HTML —— 没有配 location = 精确匹配，
        请求落到了静态 location。这条端点是「创建临时课堂」，前端点了会「无权限」"
elif [ "$C" = "403" ] || [ "$C" = "401" ] || [ "$C" = "405" ]; then
    ok "/api/v1/admin/classrooms 返回 $C（已到达课堂服务，只是没带 token）"
elif [ "$C" = "200" ]; then
    warn "/api/v1/admin/classrooms 200 —— 未鉴权就能调，检查课堂服务的鉴权配置"
else
    warn "/api/v1/admin/classrooms 返回 $C（$CT）"
fi

# 4.5 单数 schedule → 8081；复数 schedules → 8092
#     都要求「JSON 而不是 HTML」，否则说明分流错了或被静态吃掉
for p in /api/v1/schedule/detail/__verify__ /api/v1/schedules/__verify__; do
    C=$(code "$p"); CT=$(ctype "$p")
    if [ "$CT" = "text/html" ]; then
        bad "$p 返回 HTML（$C）—— 分流没生效，落到了静态 location"
    else
        ok "$p 返回 $C（$CT）—— 已进入反代"
    fi
done

# ==============================================================================
head_ "5. WebSocket 入口"
# ==============================================================================
C=$(curl "${CURL_OPTS[@]}" -w '%{http_code}' \
        -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
        -H 'Sec-WebSocket-Version: 13' \
        -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
        "$BASE/ws/classrooms/__verify__" 2>/dev/null || echo 000)
case "$C" in
    101) ok "/ws/classrooms/ 握手成功 101" ;;
    400|401|403|404) ok "/ws/classrooms/ 返回 $C（已路由到课堂服务，仅业务层拒绝）" ;;
    426) ok "/ws/classrooms/ 426 Upgrade Required（已路由，未带完整握手头）" ;;
    000) bad "/ws/classrooms/ 无响应 —— 上游不可达，检查 CLASSROOM_UPSTREAM 与 proxy_read_timeout" ;;
    *)   warn "/ws/classrooms/ 返回 $C，确认是否为静态 location 兜底（应为 404+html 才算错）" ;;
esac

# ==============================================================================
head_ "6. 部署文件泄漏"
# ==============================================================================
LEAK=0
for p in /Dockerfile /container.config.json /nginx/default.conf.template /proxy_params /readme.md; do
    C=$(code "$p")
    if [ "$C" = "200" ]; then
        bad "GET $p → 200，部署文件泄漏到公网！镜像里的清理步骤失效了"
        LEAK=1
    fi
done
[ "$LEAK" = "0" ] && ok "常见部署文件全部 404（Dockerfile / nginx 模板 / readme 没有外泄）"

# ==============================================================================
head_ "7. 真实 IP 与协议透传（间接验证）"
# ==============================================================================
# 后端返回体里若带 clientIp，且不是 127.0.0.1/docker 网段，说明 X-Forwarded-For 生效。
BODY=$(curl -sS --max-time 10 ${NO_VERIFY:+-k} "$BASE/api/v1/system/info" 2>/dev/null || true)
if printf '%s' "$BODY" | grep -q '127\.0\.0\.1\|172\.1[6-9]\.\|172\.2[0-9]\.\|172\.3[01]\.\|10\.'; then
    warn "后端看到的客户端 IP 像内部地址 —— 检查代理链路是否少传 X-Real-IP / X-Forwarded-For
        （丢了不报错，但登录防刷、审计日志、限流全部退化成同一 IP）"
else
    ok "未在后端响应里发现内部网段地址"
fi

# ==============================================================================
printf '\n%s══════ 结果 ══════%s\n' "$CYN" "$RST"
printf '  通过 %d   %s失败 %d%s   %s提示 %d%s\n' "$PASS" "$RED" "$FAIL" "$RST" "$YEL" "$WARN" "$RST"

if [ "$FAIL" -gt 0 ]; then
    printf '\n%s有硬失败项，先修再上线。%s\n' "$RED" "$RST"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    printf '\n%s硬项全过，但有提示项值得看一眼。%s\n' "$YEL" "$RST"
    exit 2
fi
printf '\n%s全部通过。%s\n' "$GRN" "$RST"
