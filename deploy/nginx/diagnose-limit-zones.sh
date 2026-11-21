#!/usr/bin/env bash
# ==============================================================================
# 诊断 nginx 限流 zone 配置（在服务器上以 root 运行）
#
#   sudo bash deploy/nginx/diagnose-limit-zones.sh
#
# 解决的报错：
#   nginx: [emerg] zero size shared memory zone "api_zone"
#   nginx: [emerg] unknown limit_req_zone "api_zone"
#   nginx: [emerg] the shared memory zone "api_zone" is already declared for a different use
#
# 三个报错含义完全不同，别混：
#   · zero size      → 有地方**引用**了这个 zone，但没有任何 `limit_req_zone` 给它尺寸
#                      （本次就是这个）。注意它**不带文件名行号**，所以看着像无头案。
#   · unknown        → 引用存在、定义不存在（通常带 文件:行号，好查）
#   · already ...    → 同名 zone 被 limit_conn_zone / proxy_cache_path 占用了
#
# 本脚本不修改任何文件，只读。
# ==============================================================================
set -uo pipefail

NGX_DIR=${NGX_DIR:-/etc/nginx}
NGX_CONF=${NGX_CONF:-$NGX_DIR/nginx.conf}
CONF_D=${CONF_D:-/etc/nginx/conf.d}
SITES=${SITES:-/etc/nginx/sites-enabled}

HR='──────────────────────────────────────────────────────────────'
say()  { printf '\n%s\n%s\n%s\n' "$HR" "$*" "$HR"; }
note() { printf '  %s\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "需要 root（要读 /etc/nginx）：sudo bash $0" >&2; exit 1; }

# ------------------------------------------------------------------------------ 0. 基本事实
say "0. 环境"
note "nginx 版本：$(nginx -v 2>&1 | sed 's/^nginx version: //')"
note "主配置：$NGX_CONF"
note "扫描根：$NGX_DIR"
note "conf.d：$CONF_D（$(ls -1 "$CONF_D" 2>/dev/null | wc -l) 个文件）"
note "sites-enabled：$SITES"
ls -1 "$CONF_D" 2>/dev/null | sed 's/^/     /' || note "    (目录不存在)"
printf '\n'
ls -1 "$SITES" 2>/dev/null | sed 's/^/     /' || note "    (目录不存在)"

# ------------------------------------------------------------------------------ 1. nginx -t 全文
say "1. nginx -t 完整输出（第一行 emerg 就是根因）"
nginx -t 2>&1 | sed 's/^/  /'

# ------------------------------------------------------------------------------ 2. include 链
say "2. include 是否真的把 conf.d 装进来了"
# 去掉注释行后再找，避免把 "# include /etc/nginx/conf.d/*.conf;" 当成生效
if grep -vE '^\s*#' "$NGX_CONF" | grep -qE 'include\s+.*conf\.d/\*\.conf'; then
    note "OK  nginx.conf 里 include conf.d/*.conf 处于生效状态"
else
    note "!!  nginx.conf 里没有生效的 'include /etc/nginx/conf.d/*.conf;'"
    note "    → conf.d 下的 zone 定义根本不会被加载，引用它的地方必然报错"
fi
grep -nE '^\s*include\s+' "$NGX_CONF" | sed 's/^/     /'

# ------------------------------------------------------------------------------ 3. zone 定义
say "3. 所有 limit_req_zone / limit_conn_zone 定义（含尺寸）"
DEFS=$(grep -rnsE '^\s*(limit_req_zone|limit_conn_zone)\s' "$NGX_DIR" 2>/dev/null)
if [ -z "$DEFS" ]; then
    note "!! 一条定义都没找到 —— 这就是 zero size / unknown 的直接原因"
else
    printf '%s\n' "$DEFS" | while IFS= read -r l; do
        f=${l%%:*}; rest=${l#*:}; ln=${rest%%:*}; body=${rest#*:}
        zname=$(printf '%s' "$body" | grep -oE 'zone=[^[:space:];]+' | head -1 | sed 's/^zone=//')
        note "$f:$ln  →  ${zname:-<没写 zone=，语法问题>}"
    done
fi

# ------------------------------------------------------------------------------ 4. zone 引用
say "4. 所有 limit_req / limit_conn 引用（谁在用它）"
REFS=$(grep -rnsE '^\s*(limit_req|limit_conn)\s+zone=' "$NGX_DIR" 2>/dev/null)
if [ -z "$REFS" ]; then
    note "没有引用（那 zero size 就不该出现，检查是否有别的模块用了同名 zone）"
else
    printf '%s\n' "$REFS" | while IFS= read -r l; do
        f=${l%%:*}; rest=${l#*:}; ln=${rest%%:*}; body=${rest#*:}
        zname=$(printf '%s' "$body" | grep -oE 'zone=[^[:space:];]+' | head -1 | sed 's/^zone=//')
        note "$f:$ln  →  zone=$zname"
    done
fi

# ------------------------------------------------------------------------------ 5. 交叉比对
say "5. 交叉比对：被引用但没有尺寸定义的 zone（就是这批在报错）"
# 定义侧：取 zone=名字:尺寸 里的「名字」
printf '%s\n' "$DEFS" 2>/dev/null \
  | grep -oE 'zone=[^[:space:];]+' | sed 's/^zone=//' | cut -d: -f1 | sort -u > /tmp/.ngx_zones_defined
# 引用侧：取 zone=名字
printf '%s\n' "$REFS" 2>/dev/null \
  | grep -oE 'zone=[^[:space:];]+' | sed 's/^zone=//' | cut -d: -f1 | sort -u > /tmp/.ngx_zones_used

note "已定义（$(wc -l < /tmp/.ngx_zones_defined) 个）：$(tr '\n' ' ' < /tmp/.ngx_zones_defined)"
note "被引用（$(wc -l < /tmp/.ngx_zones_used) 个）：$(tr '\n' ' ' < /tmp/.ngx_zones_used)"

MISSING=$(comm -13 /tmp/.ngx_zones_defined /tmp/.ngx_zones_used)
if [ -z "$MISSING" ]; then
    note "OK  没有「引用了但没定义」的 zone"
else
    printf '\n'
    for z in $MISSING; do
        note "!! zone「$z」被引用但没有尺寸定义 —— 就是 zero size shared memory zone 的成因"
        note "   引用它的位置："
        printf '%s\n' "$REFS" | grep "zone=$z" | sed 's/^/       /'
        note "   修法二选一："
        note "     ① 补定义（推荐，恢复限流）：在 ${CONF_D}/00-limit-req-zone.conf 里加"
        note "        limit_req_zone \$binary_remote_addr zone=${z}:20m rate=100r/s;"
        note "     ② 临时去掉引用（放弃限流先恢复服务）：把引用它的 limit_req 行注释掉"
    done
fi

# ------------------------------------------------------------------------------ 6. 尺寸合法性
say "6. 尺寸写法检查（size 为空 / 为 0 / 单位写错都会出事）"
ZPAIRS=$(printf '%s\n' "$DEFS" 2>/dev/null | grep -oE 'zone=[^[:space:];]+' | sed 's/^zone=//' | sort -u)
if [ -z "$ZPAIRS" ]; then
    note "（没有可检查的 zone 定义，见第 3 节）"
else
    printf '%s\n' "$ZPAIRS" | while IFS= read -r zs; do
        name=${zs%%:*}
        if [ "$zs" = "$name" ]; then size=""; else size=${zs#*:}; fi
        case "$size" in
            '')              note "!! $name 没写尺寸（zone=$zs）→ 会被当成 0，引用它就是 zero size" ;;
            *[!0-9kKmMgG]*)  note "!! $name 尺寸含非法字符：[$size]" ;;
            0)               note "!! $name 尺寸为 0：[$size]" ;;
            0*)              note "!! $name 尺寸以 0 开头：[$size]" ;;
            *)               note "OK  $name = $size" ;;
        esac
    done
fi

# ------------------------------------------------------------------------------ 7. 生效配置里到底有没有
say "7. 用 nginx -T 看「生效配置」里有没有这些 zone（最靠得住的证据）"
if nginx -T >/tmp/.ngx_dump 2>/tmp/.ngx_dump_err; then
    for z in api_zone login_zone public_zone sms_zone; do
        n=$(grep -cE "limit_req_zone.*zone=${z}:" /tmp/.ngx_dump || true)
        note "$z 在生效配置里的定义条数：$n$([ "${n:-0}" = "0" ] && echo '  ← 缺失！')"
    done
    note "（nginx -T 成功说明当前配置其实是通的，报错可能来自另一次未生效的修改）"
else
    note "nginx -T 也失败（与 nginx -t 同因），跳过。错误："
    head -3 /tmp/.ngx_dump_err | sed 's/^/     /'
fi

rm -f /tmp/.ngx_zones_defined /tmp/.ngx_zones_used /tmp/.ngx_dump /tmp/.ngx_dump_err

# ------------------------------------------------------------------------------ 结论
say "怎么用这份输出"
cat <<'EOF'
  1. 先看第 6 节里有没有「!! zone ... 被引用但没有尺寸定义」：
     有 → 补定义或去掉引用，二选一（第 6 节给了模板）。
  2. 没有孤儿引用，但 nginx -t 仍报 zero size：
     → 说明那个 zone 不是 limit_req_zone 用的（可能被 limit_conn_zone /
       proxy_cache_path 占用了同名），看第 5 节的「已定义」清单里有没有它。
  3. 第 2 节 OK、第 3 节为空：
     → conf.d 里那份文件不在了（被删/改名/被包管理器覆盖），
       从仓库补：scp deploy/nginx/conf.d/00-limit-req-zone.conf \
                    root@server:/etc/nginx/conf.d/

  ⚠ reload 失败不影响正在服务的 nginx（旧 worker 继续跑），
    但**你的配置改动也没有生效**。修好后务必再跑 nginx -t 确认，然后 reload。
EOF
