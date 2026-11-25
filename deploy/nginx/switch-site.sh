#!/usr/bin/env bash
# ==============================================================================
# 安全切换 nginx 站点形态（五选一）
#
# 为什么需要它：五份站点**同一时间只能启用一份**，而其中两份依赖证书文件
# （域名版依赖 Let's Encrypt、IP 自签版依赖 /etc/nginx/ssl/selfsigned）。
# 手工 `ln -sfn` 时最常见的两个事故：
#   ① 启用了证书还不存在的形态 → `nginx -t` 报
#      cannot load certificate ".../fullchain.pem": BIO_new_file() failed
#      （2026-11-22 真实发生过：误启 booking-https 且未替换 your.domain.com 占位）
#   ② 摘链接时连带删了 sites-available 里的文件，回滚时没得回。
# 本脚本把「前置校验 → 切换 → nginx -t → 失败自动回滚」串起来，避免上面两种。
#
# 用法（root）：
#   sudo bash deploy/nginx/switch-site.sh            # 只列出当前启用了什么 + 可选形态
#   sudo bash deploy/nginx/switch-site.sh http       # 纯 HTTP（booking-ip.conf）
#   sudo bash deploy/nginx/switch-site.sh https-ip   # 纯 HTTPS + 80 跳转（自签）
#   sudo bash deploy/nginx/switch-site.sh dual       # HTTP + HTTPS 双栈（自签）
#   sudo bash deploy/nginx/switch-site.sh https-domain  # 域名 + 受信任证书（需已签证书）
#   sudo bash deploy/nginx/switch-site.sh --no-reload dual   # 只改配置不 reload
#
# 退出码：0 成功；1 前置校验不通过或 nginx -t 失败（此时**什么都没改**）
# ==============================================================================
set -uo pipefail

AVAIL=/etc/nginx/sites-available
ENABLED=/etc/nginx/sites-enabled
SELFSSL=/etc/nginx/ssl/selfsigned
KNOWN=(booking booking-ip booking-https booking-ip-https booking-ip-dual default)

DO_RELOAD=1
FORM=""
for a in "$@"; do
  case "$a" in
    --no-reload) DO_RELOAD=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    http|https-ip|dual|https-domain) FORM="$a" ;;
    *) echo "✗ 未知参数：$a（可选 http | https-ip | dual | https-domain）"; exit 2 ;;
  esac
done

[ "$(id -u)" = "0" ] || { echo "✗ 请用 root 执行（sudo bash $0 <形态>）"; exit 1; }

err() { echo "  ✗ $*"; }
ok()  { echo "  ✓ $*"; }

# 形态 → 目标文件
declare -A TARGET=(
  [http]=booking-ip
  [https-ip]=booking-ip-https
  [dual]=booking-ip-dual
  [https-domain]=booking-https
)

show_state() {
  echo "=== 当前 $ENABLED ==="
  ls -l "$ENABLED" 2>/dev/null | sed 's/^/  /' || echo "  (空)"
  echo
  echo "=== 可选形态 ==="
  printf "  %-14s %-22s %s\n" "http"         "booking-ip.conf"       "仅 HTTP（无证书依赖）"
  printf "  %-14s %-22s %s\n" "https-ip"     "booking-ip-https.conf" "仅 HTTPS + 80 跳转（自签证书）"
  printf "  %-14s %-22s %s\n" "dual"         "booking-ip-dual.conf"  "HTTP + HTTPS 双栈（自签证书）"
  printf "  %-14s %-22s %s\n" "https-domain" "booking-https.conf"    "域名 + Let's Encrypt/云厂商证书"
  echo
  echo "=== 证书现状 ==="
  if [ -f "$SELFSSL/server.crt" ]; then
    ok "自签：$SELFSSL/server.crt"
    openssl x509 -in "$SELFSSL/server.crt" -noout -ext subjectAltName 2>/dev/null | tail -n +2 | sed 's/^ */     /'
    echo "     $(openssl x509 -in "$SELFSSL/server.crt" -noout -enddate 2>/dev/null)"
  else
    err "自签证书不存在（https-ip / dual 需要它）→ sudo bash $(dirname "$0")/gen-selfsigned-cert.sh <公网IP>"
  fi
  if compgen -G "/etc/letsencrypt/live/*/fullchain.pem" >/dev/null 2>&1; then
    ok "Let's Encrypt：$(ls -d /etc/letsencrypt/live/*/ 2>/dev/null | sed 's#.*/live/##; s#/$##' | tr '\n' ' ')"
  else
    err "Let's Encrypt 证书不存在（https-domain 需要它）"
  fi
}

if [ -z "$FORM" ]; then show_state; exit 0; fi

TGT="${TARGET[$FORM]}"
SRC="$AVAIL/$TGT"
echo "==> 目标形态：$FORM  →  $SRC"

# ---------- 前置校验（任一条不过就不动任何东西）----------
[ -f "$SRC" ] || { err "文件不存在：$SRC（先 sudo cp deploy/nginx/$TGT.conf $AVAIL/$TGT）"; exit 1; }

# 占位符残留检查：域名版没替换 your.domain.com 就启用，必然 cannot load certificate
if grep -q 'your\.domain\.com' "$SRC"; then
  err "$TGT 里还有占位符 your.domain.com（证书路径/域名没替换）"
  echo "    先替换：sudo sed -i 's/your\\.domain\\.com/实际域名/g' $SRC"
  exit 1
fi

# 证书存在性检查
CERTS=$(grep -oE '^\s*ssl_certificate\s+\S+;' "$SRC" | awk '{print $2}' | tr -d ';')
if [ -n "$CERTS" ]; then
  miss=0
  while read -r c; do
    [ -z "$c" ] && continue
    if [ ! -f "$c" ]; then err "证书文件不存在：$c"; miss=1; fi
  done <<< "$CERTS"
  # 私钥
  KEYS=$(grep -oE '^\s*ssl_certificate_key\s+\S+;' "$SRC" | awk '{print $2}' | tr -d ';')
  while read -r k; do
    [ -z "$k" ] && continue
    if [ ! -f "$k" ]; then err "私钥文件不存在：$k"; miss=1; fi
  done <<< "$KEYS"
  [ "$miss" = "0" ] || { echo "    自签证书生成：sudo bash $(dirname "$0")/gen-selfsigned-cert.sh <公网IP>"; exit 1; }

  # SAN 覆盖检查：证书里没有该 IP/域名时，浏览器是「连不上」而不是「点继续」
  C0=$(echo "$CERTS" | head -1)
  SAN=$(openssl x509 -in "$C0" -noout -ext subjectAltName 2>/dev/null | tail -n +2 | tr -d ' ')
  if [ -n "$SAN" ]; then
    while read -r name; do
      name=$(echo "$name" | sed 's/#.*//' | tr -d ' ')
      [ -z "$name" ] && continue
      case "$SAN" in
        *"IPAddress:$name"*|*"DNS:$name"*) ok "证书 SAN 覆盖 $name" ;;
        *) err "证书 SAN **不包含** $name（浏览器会报 ERR_CERT_COMMON_NAME_INVALID，且点不进「继续前往」）"
           echo "    SAN 现为：$SAN"
           echo "    修法：重跑证书脚本并传入该地址 → sudo bash $(dirname "$0")/gen-selfsigned-cert.sh $name"
           exit 1 ;;
      esac
    done < <(grep -oE '^\s*server_name\s+[^;]+;' "$SRC" | sed 's/server_name//; s/;//' | sort -u)
  fi
fi

# ---------- 快照现有启用状态（失败要能原样退回）----------
SNAP="$(mktemp)"
for n in "${KNOWN[@]}"; do
  [ -e "$ENABLED/$n" ] || [ -L "$ENABLED/$n" ] && echo "$n" >> "$SNAP"
done
echo "==> 现有启用：$(tr '\n' ' ' < "$SNAP")(将全部摘除，只留目标)"

restore() {
  echo "==> 回滚：恢复原来的启用状态"
  for n in "${KNOWN[@]}"; do rm -f "$ENABLED/$n"; done
  while read -r n; do
    [ -z "$n" ] && continue
    if [ -L "$ENABLED/$n" ] || [ ! -e "$AVAIL/$n" ]; then continue; fi
    ln -sfn "$AVAIL/$n" "$ENABLED/$n"
  done < "$SNAP"
  rm -f "$SNAP"
  echo "    （sites-available 里的文件未受影响，可继续排查）"
}

# ---------- 切换 ----------
for n in "${KNOWN[@]}"; do
  if [ -f "$ENABLED/$n" ] && [ ! -L "$ENABLED/$n" ]; then
    echo "  ⚠ $ENABLED/$n 是真实文件而非软链，将被移动到 $ENABLED/$n.bak.$(date +%s)"
    mv "$ENABLED/$n" "$ENABLED/$n.bak.$(date +%s)"
  else
    rm -f "$ENABLED/$n"
  fi
done
ln -sfn "$SRC" "$ENABLED/$TGT"
ok "已启用 $ENABLED/$TGT → $SRC"

# ---------- 校验（失败自动回滚）----------
echo "==> nginx -t ..."
if ! nginx -t 2>&1 | sed 's/^/    /'; then
  err "nginx -t 失败，本次切换已回滚，线上仍跑切换前的配置"
  restore
  rm -f "$SNAP"
  exit 1
fi
ok "nginx -t 通过"

if [ "$DO_RELOAD" = "1" ]; then
  if systemctl reload nginx; then ok "已 reload（旧 worker 平滑退出，连接不中断）"
  else err "reload 失败 —— 旧配置仍在跑，站点未中断；先看 journalctl -u nginx -n 50"; exit 1; fi
else
  echo "  (--no-reload：配置已改但未生效，记得手动 sudo systemctl reload nginx)"
fi
rm -f "$SNAP"

echo
echo "=== 验证 ==="
case "$FORM" in
  http)         echo "  curl -I  http://<IP>/         期望 200" ;;
  https-ip)     echo "  curl -kI https://<IP>/        期望 200"
                echo "  curl -I  http://<IP>/         期望 301" ;;
  dual)         echo "  curl -kI https://<IP>/        期望 200"
                echo "  curl -I  http://<IP>/         期望 200（不是 301）" ;;
  https-domain) echo "  curl -I  https://<域名>/      期望 200（无 -k，证书受信任）" ;;
esac
echo "  openssl s_client -connect 127.0.0.1:443 -CAfile $SELFSSL/ca.crt </dev/null 2>/dev/null | grep 'Verify return code'"
