# 课堂独立 App · local 模式配置指南

## 两种模式速览

| 模式 | WebView 加载 | API/WS 地址 | 后端改动 | 适用场景 |
|---|---|---|---|---|
| **server**（默认） | `server.url` 线上同源前端 | 三套全留空，走同源 nginx 分流 | 无 | 日常使用、上架首选、零 CORS |
| **local** | 本地打包的 `www/`（`capacitor://localhost`） | 三套绝对地址，由桥接层改写 | booking 需放行 CORS | 离线启动、无同源代理、定制外壳 |

> 课堂有三套地址，不能混为一谈（详见方案 §7.2）：
> ① `apiOrigin` → booking（登录/排期/预约）　② `classroomApiOrigin` → classroom-service API
> ③ `classroomWsOrigin` → classroom-service WS

## 一、切换到 local 模式

### 1) 设置环境变量并构建

```bash
# Windows Git Bash（在仓库根执行）
APP_MODE=local \
API_ORIGIN=https://booking.example.com \
CLASSROOM_API_ORIGIN=https://classroom.example.com/api/v1 \
CLASSROOM_WS_ORIGIN=wss://classroom.example.com \
node classroom-app/scripts/build.js
```

- `CLASSROOM_API_ORIGIN` / `CLASSROOM_WS_ORIGIN`：填到 **classroom-service 的根**（不含 `/ws/classrooms`，WS 根会自动拼）。
- 三套地址缺一不可，缺任一个构建脚本会**直接报错终止**（防止运行时打错地址）。
- 构建产物：`www/app-config.js`（三套地址已注入）、`capacitor.config.json` 不再含 `server.url`。

### 2) 后端 CORS 放行（仅 booking 需要）

三个后端服务的 CORS 策略**不同**，这是最容易踩的坑：

| 服务 | 配置项 | local 模式是否需要改 |
|---|---|---|
| booking（8081） | `APP_CORS_ORIGIN_PATTERNS`（`CorsConfig.java:39`） | **需要**：追加 `capacitor://localhost` |
| classroom-service（8092） | `allowedOriginPatterns("*")`（`WebMvcConfig.java:33`） | 不需要，已全放行 |
| message-service（8090） | `allowedOriginPatterns("*")`（`WebMvcConfig.java:31`） | 不需要，已全放行 |

booking 的放行值（逗号分隔，与现有值并列）：
```bash
APP_CORS_ORIGIN_PATTERNS=https://yourdomain.com,capacitor://localhost
```
本地调试 Android 时，Webview origin 可能是 `http://localhost`（视 `androidScheme`），一并加入：
```bash
APP_CORS_ORIGIN_PATTERNS=...,capacitor://localhost,http://localhost,https://localhost
```

> ⚠️ 只改仓库配置 ≠ 改服务器。云端要在控制台改环境变量并重启实例；
> nginx 侧若设了 `proxy_set_header Origin ""`，同源语义下无需动 CORS（`cloudBased/frontend/default.conf.template:117` 有说明）。

### 3) WS 特殊注意

- `classroom-ws.js` 默认取 `location.host` 同源——local 模式下 `capacitor://localhost` 不是后端，必须靠桥接层覆盖 `getClassroomWsBaseUrl`。
- 桥接层已做**双保险**（P0 修复）：① 把绝对地址写进 `localStorage.eclassroomConfig`（不依赖脚本加载顺序）；② 函数层 `getClassroomWsBaseUrl` 每次 install 重覆盖。
- `CLASSROOM_WS_ORIGIN` **不要带 `/ws/classrooms`**，否则会拼出 `/ws/ws/classrooms/...`。
- 生产必须 `wss://`，Android 需 `androidScheme: https` 且后端 TLS 有效（自签证书见下方坑）。

## 二、验证是否配置正确

构建后用自检面板（`verify.html`）检查（必须用预览服务器打开）：

```bash
cd classroom-app
node scripts/serve.js 8098
# 浏览器打开 http://localhost:8098/verify.html
```

local 模式下应看到：
- `运行时 · 三套地址模式一致` → 显示 `local 模式：api=... / classApi=...`
- `运行时 · 课堂 API 双基址覆盖生效` → 绿色，值为 `classroomApiOrigin`

或用环境变量跑一次桥接层桩测试（无需真机）：
```bash
APP_MODE=local API_ORIGIN=https://a CLASSROOM_API_ORIGIN=https://b/api/v1 CLASSROOM_WS_ORIGIN=wss://c node classroom-app/scripts/build.js
```

## 三、常见坑（已知）

1. **双基址被反向盖掉**：`app-bridge.js` 在 head，`feature-flags.js` 在 body 且末尾重新赋值 `getClassroomApiBaseUrl/WsBaseUrl`。桥接层已改为存储层 + 函数层双保险，勿回退成单次覆盖。
2. **回环地址归一**：`isLoopbackBase`（feature-flags.js）把 `127.0.0.1/localhost/::1` 归一为空串，**隐含假设"同源代理存在"**——server 模式成立，local 模式失效。这也是双基址必须注入的根因。
3. **音视频异常先查 Permissions-Policy，不是证书**：`camera=()` 空 allowlist 连页面自身都禁；自签 HTTPS 下 Chromium 的 `getUserMedia` 按设计是放行的。全仓已有 `check:headers` 守卫（6 文件 8 处）。
4. **Android 混内容**：`allowMixedContent: false`，local 模式所有资源必须 HTTPS/WSS，否则 WebView 拦截。

## 四、切回 server 模式

```bash
node classroom-app/scripts/build.js   # 不带 APP_MODE，默认 server
```

`capacitor.config.json` 会重新写入 `server.url`，三套地址清空。

## 五、当前状态说明（P2）

- 桥接层的三套地址覆盖、local 前置校验、模式开关均已就位，**纯前端侧已可构建出 local 产物**。
- 真正跑通 local 模式的**外部前提**仍需人工准备：可用的 HTTPS 后端域名、booking 的 CORS 放行、真机签名打包（`cap add ios/android` 尚未执行）。
- 因此本阶段验收以"构建产物配置正确 + 自检面板绿"为准，真机联调留到原生壳建立之后。
