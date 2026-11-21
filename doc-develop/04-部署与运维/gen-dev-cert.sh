#!/usr/bin/env bash
# ==============================================================================
# 生成本地开发用的 HTTPS 证书（自签 CA + 服务器证书）
#
# 为什么需要：浏览器只在「安全上下文」（https / localhost）里放行
# getUserMedia，局域网另一台电脑用 http://192.168.x.x 打开课堂页时
# 摄像头、麦克风会被直接禁用。项目里的做法是给开发代理加 TLS
# （DEV_TLS=1），证书就由本脚本生成。
#
# 什么时候要重跑：
#   1. 第一次启用 DEV_TLS（certs/ 不存在）；
#   2. 换了网络/路由器，本机 IP 变了 —— 旧证书 SAN 里没有新 IP 时，
#      浏览器是「直接连不上」（不是弹警告让你点继续），必须重签。
#
# 用法：
#   bash doc-develop/04-部署与运维/gen-dev-cert.sh            # 复用已有 CA（其他电脑不必重新信任）
#   bash doc-develop/04-部署与运维/gen-dev-cert.sh --new-ca   # 连 CA 一起重建（其他电脑要重新信任）
#
# 依赖：openssl。Windows 下 Git Bash 自带的 openssl 即可。
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

CERT_DIR="certs"
CA_CRT="$CERT_DIR/ca.crt"
CA_KEY="$CERT_DIR/ca.key"
DEV_CRT="$CERT_DIR/dev.crt"
DEV_KEY="$CERT_DIR/dev.key"
DAYS_CA=3650
DAYS_LEAF=825          # Chrome 对叶子证书有效期上限 825 天，超了直接不信任
NEW_CA=0
[ "${1:-}" = "--new-ca" ] && NEW_CA=1

command -v openssl >/dev/null 2>&1 || { echo "✗ 找不到 openssl，请先安装（Windows 可用 Git Bash 自带版本）"; exit 1; }
mkdir -p "$CERT_DIR"

# ---- 1. 收集本机 IPv4（写进 SAN，缺了就访问不了）----------------------------
IPS=""
if command -v powershell >/dev/null 2>&1; then
  IPS=$(powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | ForEach-Object { \$_.IPAddress }" 2>/dev/null \
        | tr -d '\r' | grep -vE '^127\.' || true)
fi
if [ -z "$IPS" ]; then
  IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -vE '^127\.|^$' || true)
fi

SAN="DNS:localhost,IP:127.0.0.1"
for ip in $IPS; do
  SAN="$SAN,IP:$ip"
done
echo "SAN = $SAN"

# ---- 2. CA：默认复用（避免其他电脑已导入的根证书失效）-------------------------
if [ "$NEW_CA" = "1" ] || [ ! -f "$CA_CRT" ] || [ ! -f "$CA_KEY" ]; then
  echo "→ 生成 CA（自签根证书）..."
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CA_KEY" -out "$CA_CRT" -days "$DAYS_CA" \
    -subj "/CN=WorkBuddy Dev CA" >/dev/null 2>&1
  echo "  ✓ $CA_CRT"
else
  echo "→ 复用已有 CA：$CA_CRT（其他电脑已导入过就不必再导入）"
fi

# ---- 3. 服务器证书：每次重签，保证 SAN 跟得上当前网络 -------------------------
echo "→ 签发服务器证书（SAN 覆盖上面列出的地址）..."
openssl req -newkey rsa:2048 -nodes \
  -keyout "$DEV_KEY" -out "$CERT_DIR/dev.csr" \
  -subj "/CN=localhost" >/dev/null 2>&1

printf "subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" \
  "$SAN" > "$CERT_DIR/san.ext"

openssl x509 -req -in "$CERT_DIR/dev.csr" \
  -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$DEV_CRT" -days "$DAYS_LEAF" -extfile "$CERT_DIR/san.ext" >/dev/null 2>&1

rm -f "$CERT_DIR/dev.csr" "$CERT_DIR/san.ext" "$CERT_DIR/ca.srl"

# ---- 4. 结果与下一步 --------------------------------------------------------
echo "  ✓ $DEV_CRT"
echo
echo "证书 SAN："
openssl x509 -in "$DEV_CRT" -noout -ext subjectAltName | tail -n +2 | sed 's/^ */  /'
echo
echo "启动 HTTPS 代理："
echo "  DEV_TLS=1 node doc-develop/90-tools/dev-frontend-local.js      # 或 dev-frontend-local-src.js"
echo
echo "其他电脑访问时若不想看到警告，把下面这个文件导入「受信任的根证书颁发机构」："
echo "  $(pwd)/$CA_CRT"
echo "（Windows 双击 → 安装证书 → 本地计算机/当前用户 → 放入「受信任的根证书颁发机构」）"
echo "不导入也能用：浏览器提示「高级 → 继续前往」后，页面仍是安全上下文，摄像头可用。"
