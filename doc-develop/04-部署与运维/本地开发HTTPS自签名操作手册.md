# 本地开发 HTTPS 自签名操作手册

- 日期：2026-11-16
- 范围：`doc-develop/`（本地开发代理）→ 影响 `dev-frontend-local.js` / `dev-frontend-local-src.js`
- 结论一句话：**前端代码零改动，只把开发代理的「监听侧」从 HTTP 换成 HTTPS**；证书是自签 CA 签发的一组文件，放在 `doc-develop/certs/`，不入库。
- **2026-11-16 更新：默认已切成 HTTPS**——两个入口脚本启动即 HTTPS，不再需要 `DEV_TLS=1`；要退回 HTTP 用 `DEV_TLS=0`（仅供硬编码 `http://localhost:8080` 的测试脚本用）。下文凡写「`DEV_TLS=1`」处，按新默认值理解为「直接启动即可」。

---

## 1. 为什么需要它

浏览器有一条安全底线：**只有「安全上下文」才放行 `getUserMedia`**。安全上下文指 `https://` 或 `localhost`（等同受信源）。

于是局域网里那台电脑用 `http://192.168.1.7:8080` 打开课堂页时，麦克风与摄像头会被**直接禁用**，`navigator.mediaDevices` 甚至不暴露——表现就是"课堂能进，但点麦/摄像头没反应"。这不是权限没给，也不是代码问题，是协议不达标。

排查时先看地址栏：非 `localhost` 的 `http://` 一律先怀疑这条。

### 三种运行形态的现状

| 形态 | 当前协议 | 是否需要处理 |
|---|---|---|
| 公网服务器 `deploy/nginx/booking.conf` | **本来就是 HTTPS**：80 → 301 跳 https、certbot 证书、HSTS + 6 个安全响应头 | 不需要 |
| 微信云托管 `deploy/docker/frontend` | **对外就是 HTTPS**：云托管分发的 `*.sh.run.tcloudbase.com` 自带证书；容器内 nginx 反代内网 http 属于正常设计 | 不需要 |
| 本地 `doc-develop/90-tools/dev-proxy.js` | 已切 HTTPS（`https.createServer` 监听 8080，自签证书） | **本手册处理的就是这个** |

---

## 2. 原理

### 2.1 为什么"前端不用改"

三项代码事实（改造前已核实，改造后仍然成立）：

| 位置 | 依据 |
|---|---|
| `frontend/js/public/api.js` | baseURL 用 `location.origin`，接口一律同源相对路径 `/api/v1/...` |
| `frontend/js/public/classroom-ws.js#wsOrigin()` | `location.protocol === 'https:' ? 'wss' : 'ws'` |
| 全项目 | 无硬编码 `http://` / `ws://`（仅注释里提到） |

所以协议跟着**页面地址**走：只要代理对外提供 HTTPS，接口自动 https、WebSocket 自动 wss（`server.on('upgrade')` 的转发逻辑对 https server 同样有效，TLS 由 Node 处理，事件里的 `req`/`socket` 与 http 下一致）。

### 2.2 为什么要"自签 CA + 服务器证书"两层，而不是直接一张自签证书

只签一张自签服务器证书也能用，但**每次换网络重签都会让所有机器重新点一次"继续前往"**。两层结构把稳定性和易变性分开了：

```
        ca.crt / ca.key   （根证书，10 年，长期不变）
                │  签发
                ▼
        dev.crt / dev.key （服务器证书，825 天，含 SAN）
                │  被浏览器校验的正是它
                ▼
    https://localhost:8080 / https://192.168.1.7:8080
```

- **其他电脑只需导入一次 `ca.crt`**（放进「受信任的根证书颁发机构」），之后所有由它签发的服务器证书都会被自动信任。
- **换网络只需重签叶子证书**（`dev.crt`），根证书不动 → 其他电脑不必重新导入。

### 2.3 SAN 必须写 IP，且这是"连不上"而不是"警告"

现代浏览器**不再看 CN**，只校验 Subject Alternative Name（SAN）里有没有你访问的那个主机名/IP。所以：

- SAN 里没有 `192.168.1.7` → 用这个地址访问时，TLS 握手阶段就判定主机名不匹配，浏览器给的是**"无法访问此网站 / ERR_CERT_COMMON_NAME_INVALID"**，点不进"继续前往"。
- 因此换网络、本机 IP 变了之后，**必须重签**（`gen-dev-cert.sh` 会自动把当前所有非回环 IPv4 写进 SAN）。

### 2.4 有效期为什么是 825 天

Chrome 对**叶子证书**的有效期上限是 825 天（≈27 个月），超过直接不信任（与是否自签无关）。根证书给 3650 天（10 年），因为它要长期稳定。

### 2.5 只换监听侧，上游后端完全不动

```
浏览器 ──HTTPS(自签)──► dev-proxy:8080 ──HTTP(明文回环)──► booking:8081 / message:8090 / classroom:8092
                         ↑ 只在这里加 TLS               ↑ 内网回环，无需证书
```

后端仍是 http，不需要改任何东西；代理转发时已经会带 `x-forwarded-proto`（按 `req.socket.encrypted` 判断），后端若需要区分协议也能拿到真实值。

### 2.6 两个刻意的取舍

| 取舍 | 原因 |
|---|---|
| **默认 HTTPS，要 `DEV_TLS=0` 才退回 http** | 局域网另一台电脑要用摄像头/麦克风是常态诉求，默认就该是安全上下文。代价：`tests/` 下十来个前端校验脚本和 `deploy/run-all.bat` 硬编码 `http://localhost:8080`，跑这些前须显式 `DEV_TLS=0` 启动代理，否则打红 |
| **证书缺失时启动直接失败，不静默退回 http** | 静默降级后的现象是"页面能开、摄像头还是被禁"，与没改几乎一样，排查成本极高。宁可启动报错并打印生成命令 |

---

## 3. 过程（本次实际改动）

### 3.1 生成证书

自动化（推荐，换网络重跑一次即可）：

```bash
bash doc-develop/04-部署与运维/gen-dev-cert.sh            # 复用已有 CA，仅重签服务器证书
bash doc-develop/04-部署与运维/gen-dev-cert.sh --new-ca   # 连根证书一起重建（其他电脑要重新导入 ca.crt）
```

脚本行为：枚举本机非回环 IPv4 → 拼 `subjectAltName=DNS:localhost,IP:127.0.0.1,IP:<每个IP>` → CA 不存在才建 CA → 重签 `dev.crt` → 清理中间文件 → 打印 SAN 与下一步。

手工等价命令（理解原理用）：

```bash
cd doc-develop && mkdir -p certs

# 1) 根证书（只需一次）
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/ca.key -out certs/ca.crt \
  -days 3650 -subj "/CN=WorkBuddy Dev CA"

# 2) 服务器私钥 + CSR
openssl req -newkey rsa:2048 -nodes -keyout certs/dev.key -out certs/dev.csr \
  -subj "/CN=localhost"

# 3) 写 SAN（IP 换成你本机局域网地址，换网络要改这里）
printf "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.7\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" > certs/san.ext

# 4) 用 CA 签发服务器证书
openssl x509 -req -in certs/dev.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
  -out certs/dev.crt -days 825 -extfile certs/san.ext

rm -f certs/dev.csr certs/san.ext certs/ca.srl
```

产物（`doc-develop/certs/`）：

| 文件 | 用途 | 是否可分发 |
|---|---|---|
| `ca.crt` | 根证书，导入到"受信任的根证书颁发机构"即可免警告 | 可（其他电脑要用） |
| `ca.key` | 根私钥 | **绝不外发** |
| `dev.crt` | 服务器证书（浏览器校验的就是它） | 可 |
| `dev.key` | 服务器私钥 | **绝不外发** |

`.gitignore` 已加 `doc-develop/certs/`（第 166 行），整个目录不入库——私钥一旦进 git 历史就等于永久泄露。

### 3.2 代理支持 HTTPS（`doc-develop/90-tools/dev-proxy.js`）

改造点三处：

1. **新增 `resolveTls(o.tls)`**：`true` 时读 `certs/dev.crt|dev.key`（可传 `{certPath,keyPath}` 覆盖），读不到就 `throw` 并打印生成命令。
2. **把请求处理段抽成 `handler`**：原来直接写在 `http.createServer((req,res)=>{...})` 里，现在先定义 `const handler = (req, res) => { ... }`。
3. **按证书创建 server**：

```js
const tls = resolveTls(o.tls);
const scheme = tls ? 'https' : 'http';
const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
```

启动横幅同步按 `scheme` 打印地址，并列出所有局域网 IP（`lanAddresses()`）与证书说明。

### 3.3 入口脚本加开关

`dev-frontend-local.js` 与 `dev-frontend-local-src.js` 各加开关（2026-11-16 起默认 HTTPS）：

```js
// 默认 HTTPS；DEV_TLS=0 才退回 HTTP（给硬编码 http://localhost:8080 的测试脚本）
const DEV_TLS = process.env.DEV_TLS !== '0' && process.env.DEV_TLS !== 'false';
// ...
startProxy({ ..., tls: DEV_TLS, ... });
```

---

## 4. 使用

```bash
# 停掉当前 8080 上的旧代理，然后（默认即 HTTPS，无需加开关）：
node doc-develop/90-tools/dev-frontend-local.js                   # dist 产物模式
node doc-develop/90-tools/dev-frontend-local-src.js               # 源码直出模式

# 换端口（多个环境并行时）
DEV_PORT=8443 node doc-develop/90-tools/dev-frontend-local-src.js

# 跑 tests/ 或 deploy/run-all.bat 前需退回 HTTP：
DEV_TLS=0 node doc-develop/90-tools/dev-frontend-local.js
```

访问地址：

- 本机：`https://localhost:8080`
- 局域网：`https://192.168.1.7:8080`（启动横幅会把本机所有 IP 都列出来）

后端 8081 / 8090 / 8092 无需任何改动。

### 其他电脑的证书信任

| 方式 | 效果 | 操作 |
|---|---|---|
| 不处理 | 每次或首次弹警告 | 点「高级 → 继续前往」。**页面仍是安全上下文，摄像头麦克风可用**（安全上下文只看 scheme，与证书链是否被信任无关） |
| 导入 `ca.crt` | 永久免警告 | 双击 `ca.crt` → 安装证书 → 当前用户/本地计算机 → 「受信任的根证书颁发机构」 |

如果只导入到「当前用户」，Chrome / Edge 也认可（它们读系统存储）。

---

## 5. 验证清单

```bash
# 1) 端口起没起、证书加载成功（横幅会打印 https:// 地址）
DEV_PORT=8443 NO_PROBE=1 node doc-develop/90-tools/dev-frontend-local-src.js

# 2) TLS 能握手、静态页可访问（-k 跳过校验）
curl -k -s -o /dev/null -w "%{http_code}\n" https://127.0.0.1:8443/          # 期望 200

# 3) 证书链是否被自签 CA 认可
openssl s_client -connect 127.0.0.1:8443 -servername localhost \
  -CAfile doc-develop/certs/ca.crt </dev/null 2>/dev/null | grep "Verify return code"
# 期望：Verify return code: 0 (ok)

# 4) IP SAN 是否包含目标地址
openssl s_client -connect 127.0.0.1:8443 -servername localhost \
  -verify_ip 192.168.1.7 -CAfile doc-develop/certs/ca.crt </dev/null 2>/dev/null | grep "Verify return code"
# 期望：0 (ok)

# 5) 证书里到底有哪些地址
openssl x509 -in doc-develop/certs/dev.crt -noout -ext subjectAltName

# 6) WSS 是否穿过代理到达课堂服务（响应带后端 X-Trace-Id 即证明转发成功，
#    404 是因为探测用了不存在的 scheduleId）
curl -k -i -s -m 5 -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://127.0.0.1:8443/ws/classrooms/probe-test" | head -5
```

> ⚠ **验证证书别用 Windows 自带 curl**。它编译时用的是 Schannel 后端，`--cacert` 不被支持，会报 `schannel: CertGetCertificateChain trust error CERT_TRUST_REVOCATION_STATUS_UNKNOWN`。那是**后端限制**，不是证书链有问题——请用 `openssl s_client` / `openssl verify` 验证。

本次实测结果：静态页 200、`Verify return code: 0 (ok)`、`-verify_ip 192.168.1.7` 也是 `0 (ok)`、WSS 升级收到后端 `X-Trace-Id`。

---

## 6. 排错表

| 现象 | 原因 | 处理 |
|---|---|---|
| 浏览器"无法访问此网站 / ERR_CERT_COMMON_NAME_INVALID"，点不进继续 | 访问的 IP 不在证书 SAN 里（换过网络） | 重跑 `bash doc-develop/04-部署与运维/gen-dev-cert.sh` |
| 浏览器"您的连接不是私密连接"，可以点继续 | 自签 CA 未被信任（正常现象） | 点「继续前往」，或导入 `ca.crt` |
| 页面能开但摄像头/麦克风仍被禁 | 打开的还是 `http://`，或地址栏不是 `localhost` | 确认地址是 `https://`；`navigator.mediaDevices` 是否为 undefined 可作为判据 |
| 启动报"DEV_TLS=1 但缺少证书" | `certs/` 没生成或被清掉 | 跑 `gen-dev-cert.sh`（报错信息里也带了命令） |
| 页面开得了但接口 4xx/5xx | 证书没问题，是后端没起 | 查 8081 / 8090 / 8092 是否 LISTENING |
| 课堂白板/聊天不动、WS 报错 | WS 未升级成功 | 看代理日志是否有 upgrade 转发；确认 8092 在跑 |
| `curl --cacert` 报 `CERT_TRUST_REVOCATION_STATUS_UNKNOWN` | Windows curl 用 Schannel，不支持 `--cacert` | 改用 `openssl s_client` 验证，不影响浏览器 |

---

## 7. 换网络后的固定动作

本机 IP 变了以后：

```bash
bash doc-develop/04-部署与运维/gen-dev-cert.sh   # 自动把新 IP 写进 SAN，复用 CA
# 然后重启代理（默认即 HTTPS）
node doc-develop/90-tools/dev-frontend-local.js
```

其他电脑不需要重新导入 `ca.crt`（CA 没变）；只是访问地址要换成新 IP。

---

## 8. 与生产环境的区别

生产不走自签。公网部署用 `deploy/nginx/booking.conf` 里现成的配置：80 端口只做 ACME 校验与 301 跳转，443 用 certbot（Let's Encrypt）签发的真实证书，并带 HSTS 与安全头。自签只用于**本地开发与局域网演示**，两者不要混用——把自签证书装到公网服务器上只会让访客全部报警告。

需要上线公网时按该文件头部的注释执行（`certbot --nginx -d 你的域名`，然后 `nginx -t && systemctl reload nginx`）。
