#!/usr/bin/env bash
# ==============================================================================
# 生成**服务器自签 HTTPS 证书**（两级：自签 CA + 服务器证书）
#
# 用途：云服务器**没有域名、只有公网 IP** 时，让站点跑起 HTTPS。
#   为什么非做不可：浏览器只在「安全上下文」（https）放行 getUserMedia，
#   课堂要开摄像头/麦克风就必须 https；http 下按钮点了没反应。
#
# 为什么两层而不是一张自签证书：
#   · 叶子证书（server.crt）被浏览器校验；换 IP / 到期只重签它；
#   · 根证书（ca.crt）10 年不变，客户端**只需导入一次**；
#   · 只签一张的话，每次重签都要逐台重新点"继续前往"。
#
# 用法（必须 root，因为要写 /etc/nginx/ssl 并把 key 设成 600）：
#   sudo bash deploy/nginx/gen-selfsigned-cert.sh 152.136.254.127
#   sudo bash deploy/nginx/gen-selfsigned-cert.sh 152.136.254.127 10.0.0.8   # 多个地址
#   sudo bash deploy/nginx/gen-selfsigned-cert.sh --new-ca 152.136.254.127   # 连 CA 重建
#
#   不给 IP 参数时会自动探测本机非回环 IPv4（云服务器上通常能拿到内网 IP，
#   公网 IP 走 NAT 不在网卡上，**所以建议显式传**公网 IP）。
#
# 产物：/etc/nginx/ssl/selfsigned/{ca.crt,ca.key,server.crt,server.key}
#   同时在 /var/www/frontend/ca.crt 放一份副本，方便客户端下载导入（仅公钥证书，安全）。
#
# ⚠️ 私钥（ca.key / server.key）绝不外发、绝不入 git；脚本会把它们设为 600 root。
# ==============================================================================
set -euo pipefail

SSL_DIR="/etc/nginx/ssl/selfsigned"
CA_CRT="$SSL_DIR/ca.crt"
CA_KEY="$SSL_DIR/ca.key"
SRV_CRT="$SSL_DIR/server.crt"
SRV_KEY="$SSL_DIR/server.key"
DAYS_CA=3650
DAYS_LEAF=825          # 叶子证书 825 天（沿用项目既有口径，见本地开发HTTPS自签名操作手册 §2.4）
CA_CN="Lesson Appointment Self-Signed CA"

NEW_CA=0
IPS=()
for a in "$@"; do
  case "$a" in
    --new-ca) NEW_CA=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) IPS+=("$a") ;;
  esac
done

# ---- 0. 前置检查 ------------------------------------------------------------
[ "$(id -u)" = "0" ] || { echo "✗ 请用 root 执行（sudo bash $0 ...）"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "✗ 找不到 openssl，请先 apt install openssl"; exit 1; }

# 自动补探测到的 IP（显式传的优先，去重）
if [ "${#IPS[@]}" -eq 0 ]; then
  echo "→ 未指定 IP，自动探测本机非回环 IPv4 ..."
  mapfile -t DETECTED < <(hostname -I 2>/dev/null | tr ' ' '\n' | grep -vE '^$|^127\.' || true)
  IPS=("${DETECTED[@]}")
fi
[ "${#IPS[@]}" -gt 0 ] || { echo "✗ 没有可用 IP。请显式传入，例如：sudo bash $0 152.136.254.127"; exit 1; }

# 拼 SAN：localhost + 127.0.0.1 + 传入的每个 IP
SAN="DNS:localhost,IP:127.0.0.1"
SEEN=" 127.0.0.1 "
for ip in "${IPS[@]}"; do
  [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "✗ '$ip' 不是合法 IPv4"; exit 1; }
  case "$SEEN" in *" $ip "*) continue ;; esac
  SEEN="$SEEN$ip "
  SAN="$SAN,IP:$ip"
done

echo "→ SAN = $SAN"
mkdir -p "$SSL_DIR" && chmod 700 "$SSL_DIR"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ---- 1. 根证书：默认复用 ----------------------------------------------------
if [ "$NEW_CA" = "1" ] || [ ! -f "$CA_CRT" ] || [ ! -f "$CA_KEY" ]; then
  echo "→ 生成根证书（自签 CA，${DAYS_CA} 天）..."
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 \
    -keyout "$TMP/ca.key" -out "$TMP/ca.crt" -days "$DAYS_CA" \
    -subj "/CN=$CA_CN/O=Lesson Appointment/C=CN" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
  mv "$TMP/ca.key" "$CA_KEY"; mv "$TMP/ca.crt" "$CA_CRT"
  echo "  ✓ $CA_CRT"
  CA_REBUILT=1
else
  echo "→ 复用已有根证书：$CA_CRT（客户端不必重新导入）"
  CA_REBUILT=0
fi

# ---- 2. 叶子证书：每次都重签，保证 SAN 跟得上当前 IP ------------------------
echo "→ 签发服务器证书（${DAYS_LEAF} 天，SAN 覆盖上述地址）..."
openssl req -newkey rsa:2048 -nodes -sha256 \
  -keyout "$TMP/server.key" -out "$TMP/server.csr" \
  -subj "/CN=${IPS[0]}/O=Lesson Appointment" >/dev/null 2>&1

cat > "$TMP/san.ext" <<EOF
subjectAltName=$SAN
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF

openssl x509 -req -sha256 -in "$TMP/server.csr" \
  -CA "$CA_CRT" -CAkey "$CA_KEY" -CAserial "$SSL_DIR/ca.srl" -CAcreateserial \
  -out "$TMP/server.crt" -days "$DAYS_LEAF" -extfile "$TMP/san.ext" >/dev/null 2>&1

mv "$TMP/server.key" "$SRV_KEY"; mv "$TMP/server.crt" "$SRV_CRT"

# ---- 3. 权限：私钥 600 root，证书 644（nginx master 以 root 读，worker 不读私钥）----
chmod 600 "$CA_KEY" "$SRV_KEY"
chmod 644 "$CA_CRT" "$SRV_CRT"
chown root:root "$CA_KEY" "$CA_CRT" "$SRV_KEY" "$SRV_CRT" 2>/dev/null || true   # 非 root 环境（如本地验证）跳过

# ---- 4. 公钥证书放一份到站点目录，方便客户端下载导入 ------------------------
WEBROOT="/var/www/frontend"
if [ -d "$WEBROOT" ]; then
  install -m 644 "$CA_CRT" "$WEBROOT/ca.crt"
  echo "→ 已放置客户端导入用的根证书：$WEBROOT/ca.crt（仅公钥，安全；ca.key 仍只在 $SSL_DIR）"
else
  echo "→ 跳过站点目录副本（$WEBROOT 不存在）"
fi

# ---- 5. 自检 ----------------------------------------------------------------
echo
echo "=== 产物 ==="
ls -l "$CA_CRT" "$CA_KEY" "$SRV_CRT" "$SRV_KEY" | sed 's/^/  /'

echo
echo "=== SAN（必须包含你访问用的那个 IP，否则浏览器给的是「连不上」而不是「点继续」）==="
openssl x509 -in "$SRV_CRT" -noout -ext subjectAltName | tail -n +2 | sed 's/^ */  /'

echo
echo "=== 有效期 ==="
openssl x509 -in "$SRV_CRT" -noout -dates | sed 's/^/  /'

echo
echo "=== 证书链自检 ==="
if openssl verify -CAfile "$CA_CRT" "$SRV_CRT" >/dev/null 2>&1; then
  echo "  ✓ 由本 CA 签发，链完整"
else
  echo "  ✗ 链校验失败，请重跑"
  exit 1
fi

cat <<EOF

=== 下一步 ===
1) 启用站点（三选一，只启用一份）：
     纯 HTTP : booking-ip.conf
     纯 HTTPS: booking-ip-https.conf      （80 → 301 到 https）
     HTTP+HTTPS 双栈: booking-ip-dual.conf
   sudo cp deploy/nginx/booking-ip-dual.conf /etc/nginx/sites-available/booking-ip-dual
   sudo rm -f /etc/nginx/sites-enabled/{booking,booking-ip,booking-https,booking-ip-https,default}
   sudo ln -sfn /etc/nginx/sites-available/booking-ip-dual /etc/nginx/sites-enabled/booking-ip-dual
   sudo nginx -t && sudo systemctl reload nginx

2) 安全组放通 443（80 视所选形态保留）。

3) 验证（本机）：
   curl -kI https://127.0.0.1/ -H "Host: ${IPS[0]}"
   openssl s_client -connect 127.0.0.1:443 -servername ${IPS[0]} </dev/null 2>/dev/null | grep -E "Verify return code|subject="

4) 客户端免警告（可选，逐台做；不做也能用，只是每次要点"继续前往"）：
   Windows : 双击 ca.crt → 安装证书 → 本地计算机 → 受信任的根证书颁发机构
   macOS   : 双击 → 钥匙串"系统" → 始终信任
   Linux   : sudo cp ca.crt /usr/local/share/ca-certificates/lesson-ca.crt && sudo update-ca-certificates
   Android : 设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书
   iOS     : AirDrop/邮件安装描述文件 → 设置 → 通用 → 关于本机 → 证书信任设置 → 打开"完全信任"
   浏览器可直接下载：https://${IPS[0]}/ca.crt （HTTP 双栈时 http://${IPS[0]}/ca.crt 也行）

⚠️ 自签证书的边界（不是配置问题，是证书体系决定的）：
   · 微信内置浏览器没有"继续前往"入口 → 打不开；
   · 微信小程序不允许用 IP 做请求域名，也不信任自签 → 小程序端课堂在此形态下不可用；
   · 换公网 IP 后必须重跑本脚本（SAN 里没有新 IP 就变成"连不上"）；
   · ${DAYS_LEAF} 天后到期，届时重跑本脚本（复用 CA 即可，客户端无需重新导入）。
EOF

if [ "$CA_REBUILT" = "1" ]; then
  echo
  echo "⚠️ 本次重建了根证书，已导入旧 ca.crt 的客户端需要重新导入。"
fi
