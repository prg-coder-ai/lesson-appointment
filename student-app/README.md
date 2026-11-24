# 学生端一码多端框架（student-app）

一套 Web 代码，运行在 **浏览器 / iOS / Android** 三端。基于 **Capacitor 套壳**，复用主前端已验证的学生端业务代码（登录、注册、预定、课堂），不重写业务逻辑。

当前分支：`student-crossplatform`（从 `auto_deploy` 拉出）。

---

## 1. 设计思路

主前端 `frontend/` 是原生 vanilla JS 多页应用（无 Vue/React/构建工具），学生端逻辑是「`student.html` 共享页面 + 6 个 `student-*.js` + 公共脚本」的混合体，且大量依赖 `window.*` 全局与 `shared/` 领域逻辑。

因此采用**最贴合现状、改动最小**的路线：

- **不重写**：业务 JS/CSS 从 `frontend/` 按白名单机械同步到 `www/`，主前端修 bug 后重跑 `npm run build` 即可同步，永不产生第二份分叉实现。
- **只加薄适配层**：`app-config.js`（运行时配置）+ `app-bridge.js`（平台探测 / API 基址 / 课堂内嵌 / 返回键）。
- **Capacitor 套壳**：Web 产物打进原生 WebView，装 `android/` `ios/` 壳即可上架。

### 目录结构

```
student-app/
├── config/
│   └── environments.js        # 环境配置（地址改这里，单一权威源）
├── scripts/
│   ├── sync.js                # 从 frontend/ 按白名单抽取学生端资源到 www/
│   ├── build.js               # 构建：同步 + 注入配置/桥接 + 生成 capacitor 配置
│   └── serve.js               # 本地预览服务器（浏览器端验证）
├── src/
│   ├── core/
│   │   ├── app-config.js      # 运行时配置模板（构建时替换占位符）
│   │   └── app-bridge.js      # 适配桥（核心）
│   ├── pages/index.html       # 一码多端启动页（探测平台 + 透传 tCode + 跳转）
│   └── styles/app.css         # 课堂内嵌层 + 安全区样式
├── www/                       # 构建产物（gitignore，不入库）
├── capacitor.config.json      # 构建时生成（gitignore 视需要）
└── README.md
```

---

## 2. 两种运行模式

改 `config/environments.js` 的 `frontendOrigin` 即可切换。

### 模式 A：`server`（默认，推荐）

`frontendOrigin` 填线上前端域名，WebView 直接加载 `https://域名/index.html`。

- **优点**：页面与后端**同源**，`/api/v1/*` 相对路径、课堂 WebSocket、登录跳转全部零改动可用；无 CORS 问题；发版只改服务端，App 不用重打包。
- **缺点**：依赖网络，首屏受网速影响。
- 此时 `apiOrigin` / `wsOrigin` 留空。

### 模式 B：`local`（本地打包）

`frontendOrigin` 留空，前端静态包进 App，页面跑在 `capacitor://localhost`。

- **优点**：首屏快、可离线展示骨架。
- **必须**：设置 `apiOrigin`（后端 API 源），`app-bridge.js` 会把 `/api/v1/*` 改写为绝对地址。
- **注意**：跨域需后端 CORS 放行（见第 6 节）；课堂若走独立服务需设 `wsOrigin`。

---

## 3. 四大功能映射

| 功能 | 复用来源 | 三端表现 |
|------|----------|----------|
| 注册 | `frontend/login.html` 内联 `submitRegister`（`POST /user/register`，待审核不发 token） | 同主前端，无改动 |
| 登录 | `frontend/js/public/auth.js`（`POST /auth/login`）+ token 自动续期 | 同主前端，无改动 |
| 预定 | `student-bookingCards.js` + `courseAndBooking.js`（`BOOKING_CREATE` 等） | 同主前端，无改动 |
| 课堂 | `classroom.html` + `js/classroom/*`，入口 `student-joinClassroom.js` / `my-classroom-core.js` | App 端经 `app-bridge` 覆盖 `RouterAdapter.openUrl`，用**应用内 WebView**（Capacitor Browser 插件）内嵌；插件不可用时降级为全屏 iframe |

多租户 `tCode` 在启动页透传，登录态 `guardEntryPage` / 行业术语全部沿用主前端，行为一致。

---

## 4. 构建与打包

### 4.1 构建 Web 产物

```bash
cd student-app
npm run build
```

产出 `www/`：58 个同步文件 + 注入后的 4 个页面 + 适配层。

### 4.2 浏览器验证（最快）

```bash
node scripts/serve.js 8099
# 打开 http://localhost:8099
```

> 浏览器验证建议用模式 B（配 `apiOrigin`），否则启动页会跳到 `frontendOrigin`。

### 4.3 打包 iOS / Android

```bash
npm install
npx cap add android     # 或 ios
npm run build           # 改配置后重新生成 www
npx cap sync            # 把 www + 插件同步到原生工程
# Android: 用 Android Studio 打开 android/ 构建 APK
# iOS: 用 Xcode 打开 ios/App/App.xcworkspace Archive
```

首次 `cap add` 需要本机有 Android Studio / Xcode 及对应 SDK。`android/`、`ios/` 由 CLI 生成，已 gitignore。

---

## 5. dev / prod 差异

| 项 | dev | prod |
|----|-----|------|
| `APP_ENV` | `APP_ENV=dev npm run build` | 默认 prod |
| `frontendOrigin` | 本机/局域网 IP（如 `http://192.168.1.10:8080`） | 线上 HTTPS 域名 |
| WebView 调试 | 自动开启 | 关闭 |
| `allowMixedContent` | 若用 http 后端需手动改配置开启 | 保持 false（全 HTTPS） |

环境变量也可直接覆盖：`FRONTEND_ORIGIN=... API_ORIGIN=... WS_ORIGIN=... npm run build`。

---

## 6. 常见坑（务必看）

1. **axios 忽略 baseURL**：主前端注释明确——以 `/` 开头的 url 会忽略 axios `baseURL`。所以 local 模式**不能**靠设 baseURL 解决，本框架通过 patch `window.ApiPaths.normalizeUrl` 改写，主请求实例与刷新令牌实例都覆盖。
2. **CORS**：local 模式跨域时，后端 `APP_CORS_ORIGIN_PATTERNS` 需放行 `capacitor://localhost`（iOS）与 `http://localhost`（Android）；或改走 server 模式彻底规避。
3. **自签证书 + 音视频**：若用自签 HTTPS 部署课堂，先查 nginx `Permissions-Policy` 是否误设 `camera=()` / `microphone=()`（空 allowlist 会禁掉页面自身），详见主项目记忆/排障文档；证书本身通常不是原因。
4. **WebSocket 地址**：课堂 ws 若为独立服务，local 模式必须设 `wsOrigin`，否则相对 ws 路径会指向 `capacitor://localhost` 而连不上。
5. **Android 返回键**：已监听 `App.addListener('backButton')` 与 `backbutton` 事件——课堂层开着先关层，否则 `history.back()`。要退出 App 需在配置里开 `exitOnBack`。
6. **白名单漏文件**：若主前端新增学生端依赖的 JS/CSS，需同步加进 `scripts/sync.js` 白名单，否则 App 内缺脚本。构建日志会打印每个分组的复制数量，可作为核对依据。
7. **tCode 丢失**：启动页已透传 URL 上的 `tCode`；任何新增跳转都应走主前端 `window.pageUrl()`，禁止手写 `?tCode=`。

---

## 7. 验证清单

构建产物验证（已通过）：

- [x] `npm run build` 成功，58 个文件同步 + 4 页面注入
- [x] 所有新增 JS 通过 `node --check`
- [x] 预览服务器：首页 / app-config / app-bridge / student.html / 业务脚本 / 字体均 HTTP 200
- [x] 适配桥桩测试：Android/iOS 平台探测正确、API 基址改写正确、绝对 URL 不误改、路由拦截生效
- [ ] 真机：server 模式下登录 → 预定 → 进课堂全流程
- [ ] 真机：Android 返回键在课堂内/外行为
- [ ] 真机：local 模式 CORS 与 WebSocket 连通性

> 按项目习惯，代码写完直接交付；上述真机项需在配好实际域名与后端后验证。
