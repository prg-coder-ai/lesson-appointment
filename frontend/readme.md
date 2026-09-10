# 前端程序（frontend）

> 面向「程序理解与维护」的说明文档。覆盖：前端结构、与后端（api / message-service）的关系、端口与路由模型、构建机制、Nginx 配置、术语与多语言体系、常见维护坑。
> 详细部署步骤见 `doc-develop/前端部署与维护手册.md`；多模块服务器部署见 `doc-develop/预约系统云服务器部署和维护手册.md`。

---

## 1. 定位与技术形态

- **纯静态前端**：原生 HTML + CSS + 原生 JS（vanilla），**不依赖框架、不引入打包器（webpack/vite 等）**。各文件以 `<script>` 顺序加载，靠**全局函数/全局变量**互相引用（如 `request`、`API_BASE_URL`、`applyTerms`）。
- **源码 vs 产物分离**：
  - 源码根：`frontend/`（含 `node_modules/`、`target/`、`pom.xml`、测试目录，**不入库、不上线**）
  - 部署产物：`frontend/dist/`（由构建脚本压缩混淆生成，结构镜像源码、文件名不变）
  - `frontend/.gitignore` 已忽略 `dist/`、`node_modules/`、`target/`。**线上发布的是 `dist/`，不是源码 `frontend/`**。
- **运行方式**：Nginx 静态托管 `dist/` 并同源反代 `/api/v1/`（**无跨域**）。监听端口由 Nginx 站点决定：本地开发代理默认 `:8080`，生产通常 `:80`/`:443`。**前端代码不感知端口**——跳转一律 `location.origin`，请求一律相对路径。

---

## 2. 目录结构

```
frontend/
├── index.html              # 落地/登录页（SPA 兜底页，所有未知路径回退到此）
├── student.html            # 学生端
├── teacher.html            # 教师端
├── booking.html            # 预约端
├── admin.html              # 租户管理端
├── auditLog.html           # 审计日志子页
├── css/                    # 样式：admin.css / student.css / teacher.css / scheduleTable.css
├── js/
│   ├── public/             # 公共依赖（所有页面共享，先加载）
│   │   ├── api.js            # 全局常量与跨源导航：API_BASE_URL / ADMIN_ORIGIN / FRONTEND_ORIGIN、登录分发
│   │   ├── utility_request.js# 全局 request（axios 封装）、baseURL=API_BASE_URL、统一拦截
│   │   ├── auth.js           # 登录/鉴权/token
│   │   ├── terms.js          # 本地术语兜底字典 TERM_DICT（按行业）
│   │   ├── termsFunction.js  # applyTerms() 行业词替换、语言切换下拉注入、/term/map 拉取
│   │   ├── dataFunctions.js  # 通用数据函数
│   │   ├── courseAndBooking.js / appointmentNotes.js / pagefoot.js / datamaintain_delete.js
│   ├── admin-*.js           # 租户管理端业务脚本（约 8 个）
│   ├── student-bookingCards.js / student-bookingBrowserCards.js
│   ├── teacher-courseAndScheduleBrowserCards.js
│   ├── auditLog.js
│   ├── messages-inbox.js     # 消息收件箱（对接 message-service）
│   └── test/testData.js      # 批量造数工具（发行版隐藏菜单，不进 dist 构建）
├── images/                 # 图标等静态资源
├── tools/
│   └── check-origin.js      # 站点地址硬编码检查（构建前自动跑，见第 6.2 节）
├── build.js                # 压缩混淆构建脚本（terser + clean-css + html-minifier-terser）
├── package.json            # 含 build / lint:origin 脚本；.npmrc 锁定官方 registry
└── pom.xml                 # packaging=pom，frontend-maven-plugin 自动下载 Node/npm 并触发构建
```

> 注意（**2026-09-09 已变更**）：`platform_admin.html` 套件（含 `logBrowser.html`、`js/platform-admin-*.js`、`js/main.js`、`js/logBrowser.js`）**已迁入本前端**，随 `dist/` 一起构建、由 Nginx `:8080` 伺服；后端 `:8081` 的 jar **不含任何页面**。
> 前端 `admin.html` 是「租户管理端」，`platform_admin.html` 是「平台管理端」，两者是不同页面、但**现在都在本前端**，且共用 `css/admin.css`。

---

## 3. 页面与角色 / 端口模型

| 角色 | 页面所在 | 访问地址 |
|------|----------|----------|
| 平台管理员 | 前端 `:8080` | `http://<host>:8080/platform_admin.html?tCode=platform` |
| 租户管理员 | 前端 `:8080` | `http://<host>:8080/admin.html?tCode=<tenantCode>` |
| 学生 / 教师 / 预约 | 前端 `:8080` | `http://<host>:8080/{student,teacher,booking}.html` |
| 所有 API | 统一前缀 | `/api/v1/*`（经 Nginx `:8080` 反代，或直连 `:8081`） |

跨源导航常量在 `js/public/api.js` 中定义（后端 `static/` 已删除，**现仅此一份，无需再同步**）：

```js
// 2026-09-10 起：默认同源。需要独立子域部署管理端时，由页面显式注入同名变量覆盖即可
window.ADMIN_ORIGIN    = window.ADMIN_ORIGIN    || location.origin;
window.FRONTEND_ORIGIN = window.FRONTEND_ORIGIN || location.origin;
```

> **地址约定（务必遵守）**：前端**不拼接任何主机 + 端口**。同源用 `location.origin`，接口用相对路径或 `window.API_BASE_URL`（默认为空=同源）。
> 旧的 `'http://' + location.hostname + ':8080'` 写法在本地 dev 代理下正常、生产会跳到未开放端口
> （2026-09-09 平台管理员注册后跳 `:8080` 即由此引起）。构建前会自动检查，见第 6.2 节。

登录分发逻辑（`api.js`，2026-09-09 起 `platform_admin` 也走 `FRONTEND_ORIGIN`）：
- `platform_admin` 角色 → `FRONTEND_ORIGIN + '/platform_admin.html?tCode=platform'`
- `admin` 角色 → `FRONTEND_ORIGIN + '/admin.html?tCode=' + tenantCode`

---

## 4. 与后端的关系（通信约定）

### 4.1 后端服务清单

| 服务 | 端口 | 作用 | 在 SaaS 仓库位置 |
|------|------|------|------------------|
| booking（api） | `:8081` | 主业务 API：预约/课程/用户/租户/术语（**纯后台，无静态页**） | `api/` 模块，产出 `booking_api-2.0.0.jar` |
| message-service | `:8090` | 消息中心：收件箱/模板/SSE 推送/投递追踪（**纯后台，无静态页**） | `message-service/` 模块，独立库 `message_center` |
| 前端（Nginx） | `:8080` | 静态托管 `dist/`，同源反代 `/api/v1` | 本目录构建产物 |

### 4.2 API 基址推导

`js/public/api.js` 中：

```js
const API_SERVER_HOST = '';   // 留空 = 与前端同源（默认部署方式）
const API_SERVER_PORT = '';
const API_BASE_URL = (API_SERVER_HOST || API_SERVER_PORT)
  ? `${API_SERVER_HOST}:${API_SERVER_PORT}${API_BASE_PATH}` : API_BASE_PATH;
window.API_BASE_URL = API_BASE_URL;
```

- **默认空串** → 所有请求走相对路径 → 与前端**同源**，由 Nginx 反代到后端。这样无论后端换端口都不会出现"一半接口好、一半坏"。
- **前后端分离部署**时，只需填 `API_SERVER_HOST`/`API_SERVER_PORT`（任一非空即按 `host:port` 拼绝对地址），然后重新构建 `dist`。

### 4.3 `/api/v1` 路由分流（Nginx 反代）

所有前端请求统一前缀 `/api/v1`。Nginx（见第 7 节）按子路径分流：

| 路径 | 转发目标 | 说明 |
|------|----------|------|
| `/api/v1/message` | `:8090` | 消息中心业务 |
| `/api/v1/sse` | `:8090` | SSE 单向推送（**必须关缓冲** `proxy_buffering off`） |
| `/api/v1/users/` | `:8090` | 消息接收人 scope 相关 |
| `/api/v1/*`（其余） | `:8081` | 主业务 API |

> 前端 `messages-inbox.js` 单独定义 `MSG_BASE`：默认同源（`window.API_BASE_URL || ''`），由 Nginx / dev 代理把 `/api/v1/{message,sse,users}` 分流到 `:8090`；跨域直连场景才用 `window.MESSAGE_API_BASE_URL` 覆盖。注意**不要**用 `'http://'+host+':8090'` 作默认——会绕过代理直连本机/外部 8090，被防火墙拒绝（ERR_CONNECTION_REFUSED）。

### 4.4 请求封装

`utility_request.js` 暴露全局 `request`（基于 axios，`baseURL = API_BASE_URL`），统一做 token 注入与错误处理。业务 JS 中以 `${API_BASE_URL}/xxx` 拼接 URL 调用，例如 `admin-user.js`：`${API_BASE_URL}/user/updateInfo`、`/user/updateStatus`、`/user/add`。

---

## 5. 术语与多语言体系（sys_term）

行业词/多语言切换由 `terms.js` + `termsFunction.js` 实现：

- **标记驱动替换**：
  - `data-term="key"` → 元素文本替换为行业词（`el.textContent = terms[key]`）
  - `data-term-placeholder="key"` → 输入框 `placeholder` 替换为行业词（建议用独立后缀 key 如 `xxxSearch`，不抢 label 词）
- **词典来源**：
  - 本地兜底：`terms.js` 的 `TERM_DICT[行业]`（education / legal / counseling / exercise）
  - 服务端覆盖：`/term/map` 三级合并词表（租户词 > 行业词 > 平台词）；`loadTermMapFromServer()` 拉取后再次 `applyTerms()`
- **生命周期**：静态页 `DOMContentLoaded` 调 `applyTerms()`；登录后/切语言再调一次。动态注入内容在渲染末尾补 `applyTerms(container)`。
- **语言切换**：头部下拉菜单（`#lang-switch-dropdown`，自注入到退出按钮 `<i class="fa fa-sign-out-alt">` 左侧），`localStorage.lang` 记录 zh/en/fr，`setLang()` 派发 `langchange` 事件刷新 UI；登录页无 header 时回退右上角固定。

---

## 6. 构建机制

- **构建脚本** `build.js`（Node 脚本）：
  - `buildJs()`：terser 压缩 `js/**/*.js`，**仅混淆局部变量**，顶层全局函数/const（如 `request`、`ADMIN_ORIGIN`）保留原名，跨文件引用不断。
  - `buildCss()`：clean-css 压缩 `css/`。
  - `buildHtml()`：html-minifier-terser 压缩 HTML 结构与内联 CSS，**内联 JS 不压缩**（`minifyJS:false`，避免误伤跨文件全局引用）。
  - `copyAssets()`：拷贝 `images/` 等；跳过 `node_modules/`、`dist/`、`target/`、`js/test/`、`pom.xml` 等。
- **Maven 驱动**（`pom.xml`，`packaging=pom`）：`frontend-maven-plugin` 在 `prepare-package` 阶段**自动下载 Node v20.11.1 + npm 10.2.4**，执行 `npm install` + `npm run build`（`build.js`）。本机无需预装 Node/npm。
- **产物**：`frontend/dist/`（结构镜像源码，文件名不变，HTML 直接 `src` 引用）。

### 6.1 构建命令

```bash
# 标准（系统 mvn 正常）
cd frontend
mvn package

# 系统 mvn 损坏时，用 Maven launcher 直启
unset CLASSPATH
M2='C:\Program Files\apache-maven-3.9.11'
cd 'C:\Users\Administrator\WorkBuddy\2026-08-30-17-19-24\frontend'
java -classpath "$M2\boot\plexus-classworlds-2.9.0.jar" \
  -Dclassworlds.conf="$M2\bin\m2.conf" \
  -Dmaven.home="$M2" \
  -Dmaven.multiModuleProjectDirectory="$PWD" \
  org.codehaus.plexus.classworlds.launcher.Launcher -B package -DskipTests
```

> 仅改业务前端（如 `admin-user.js`、`termsFunction.js`）只需重打 **frontend 模块**；API jar 不含业务前端，无需重打。

### 6.2 构建前的地址硬编码检查（origin lint）

`build.js` 在构建**之前**自动执行 `tools/check-origin.js`，扫描源码（跳过 `js/test/`、`node_modules/`、`dist/`、`tools/`）中的 4 类写法：

| 规则 ID | 命中写法 | 为什么禁 |
|---|---|---|
| `HOSTNAME_PORT` | `'http://' + location.hostname + ':8080'` | 生产没有该 dev 端口，跳转/请求必失败 |
| `PROTO_HOSTNAME` | `'http://' + location.host`（拼绝对地址） | 同上，且绕过 Nginx 同源反代 |
| `LOCALHOST_URL` | `'http://localhost:8081'` | 该地址指向**访客自己的机器**，生产必错 |
| `IP_URL` | `'http://152.136.254.127:8081'` | 服务器 IP/域名会变，写死必漂移 |

- **默认发现即中止构建**（不会删已有 dist），请先修正；确属说明文案（如界面上的"业务后台（:8081）"）就在该行加注释 `/* ORIGIN-LINT-DISABLE */` 豁免。
- 单独执行：

```bash
cd frontend
npm run lint:origin          # 只看告警，不阻断
npm run lint:origin:strict   # 发现即 exit 1（CI / 发版前推荐）
```

- 紧急发版临时跳过：`SKIP_ORIGIN_LINT=1 node build.js`（**不建议常态化**）。

---

## 7. Nginx 配置

### 7.1 本地开发（前端 `:8080` 托管 dist，反代 `:8081`）

要点：
- `listen 8080;`、`root <frontend/dist 绝对路径>;`、`index index.html;`
- `location / { try_files $uri $uri/ /index.html; }` —— 未知路径 SPA 兜底
- `location /api/v1/ { proxy_pass http://<后端host>:8081; ... }` —— 同源反代，浏览器无跨域
- Windows 坑：必须用原生 `C:/` 路径；启动带 `-p <前缀目录> -c <配置文件>`，否则 Nginx 找不到配置

### 7.2 服务器多子域（含 HTTPS，摘录自部署手册）

业务前端 `booking.example.com`：静态资源 `root /var/www/frontend`；`/api/v1/message`、`/api/v1/sse`、`/api/v1/users/` → `:8090`，其余 `/api/v1/` → `:8081`；SSE 必须 `proxy_buffering off`。

平台管理端 `admin.example.com`：**与业务前端同一份 `dist`**，`root` 指向同一个目录，`/api/v1/` → `:8081`。不再需要把整站反代到 `:8081`（平台管理页已在 dist 内）。

```nginx
# admin.example.com 关键片段
server {
    listen 443 ssl http2;
    server_name admin.example.com;
    root /var/www/frontend;                 # 与业务前端同一份 dist
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/v1/ { proxy_pass http://127.0.0.1:8081; include /etc/nginx/proxy_params; proxy_read_timeout 120s; }
}
```

```nginx
# booking.example.com 关键片段
server {
    listen 443 ssl http2;
    server_name booking.example.com;
    root /var/www/frontend;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/v1/message   { proxy_pass http://127.0.0.1:8090; include /etc/nginx/proxy_params; }
    location /api/v1/sse       { proxy_pass http://127.0.0.1:8090; include /etc/nginx/proxy_params; proxy_buffering off; proxy_read_timeout 3600s; }
    location /api/v1/users/   { proxy_pass http://127.0.0.1:8090; include /etc/nginx/proxy_params; }
    location /api/v1/         { proxy_pass http://127.0.0.1:8081; include /etc/nginx/proxy_params; proxy_read_timeout 120s; }
}
```

无域名只有 IP 时：`root` 仍指向 dist，监听 `:8080`；后端 `:8081`/`:8090` 经反代。`platform_admin` 直接访问 `http://<IP>:8080/platform_admin.html`（与业务前端同域同端口，无需额外开放 8081 给管理员）。

---

## 8. 常见维护坑

1. **API 基址不一致**：若历史代码把 `API_BASE_URL` 写死成 `http://localhost:8081`，会与 `utility_request.js` 的同源实例冲突，表现为"部分接口坏、随页面切换变化"。保持 `api.js` 中 `API_SERVER_HOST/PORT` 为空（同源）即可；构建前的 `lint:origin` 会拦截这类写法。
2. **改了前端却没生效**：记得发布的是 `dist/`，改完源码必须重跑 `mvn package` 重建 dist 并上传到 Nginx `root`。
3. **SSE 收不到推送**：Nginx 未关缓冲 → 在 `/api/v1/sse` 加 `proxy_buffering off;`。
4. **术语/语言不切换**：确认元素带 `data-term`/`data-term-placeholder` 标记，且 key 在 `terms.js` 或 `/term/map` 中存在；动态内容渲染后须调 `applyTerms(container)`。
5. **管理端 vs 租户端混淆**：`platform_admin.html`（平台端，系统级）≠ `admin.html`（租户端，租户级）。二者**现在都在本前端 `:8080`**（平台端于 2026-09-09 迁入），共用 `css/admin.css` —— 改该 CSS 会同时影响两页。
6. **登录后跳错端口（2026-09-09 真实事故）**：`api.js` 曾把 `FRONTEND_ORIGIN` 兜底成 `'http://'+location.hostname+':8080'`，生产未注入该变量 → 平台管理员注册后跳到未开放的 8080。**现已改为默认 `location.origin`**；新增的规则会被 `lint:origin` 拦住。需要跨站部署时，在页面里 `<script>window.FRONTEND_ORIGIN='https://admin.example.com'</script>` 注入即可。
7. **后端根路径不再是页面**：`http://<host>:8081/` 与 `http://<host>:8090/` 只返回「缺省自我标识页」（程序名/版本/服务器时间/时区/已运行时长），用于确认进程存活；页面一律走前端。
8. **本机 mvn 损坏**：用第 6.1 节的 Maven launcher 直启命令，不要依赖系统 `mvn`。

---

## 9. 相关文档

- `doc-develop/前端部署与维护手册.md` —— 本地/服务器前端部署、Nginx、本地开发代理（连远程 API）
- `doc-develop/预约系统云服务器部署和维护手册.md` —— 三模块云端部署、systemd、HTTPS、多子域
- `doc-develop/test_lang_switch.js` / `doc-develop/test_admin_user.js` —— 语言切换、用户编辑的无浏览器（jsdom）集成测试
