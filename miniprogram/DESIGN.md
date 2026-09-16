# 微信小程序前端系统设计方案与落地路径

> 目标：在现有 `frontend/`（Web 多页前端）之外，新建一个**独立构建目录 `miniprogram/`** 的微信小程序前端，
> 复用现有布局与业务逻辑，**尽量共用公共代码**，降低双端维护成本。
> 本文先给出可行设计方案与落地路径，待评审后再进入逐页实现。

---

## 1. 背景与目标

- 现有 `frontend/` 是 vanilla JS 多页应用，已具备：登录/角色首页、课程排期浏览、预约下单、教师简介、消息中心、敏感词管理等完整能力。
- 需要一个小程序端作为**轻量补充渠道**（C 端学生/老师预约、消息查看为主），而不是重写管理后台。
- 约束：**尽量共用公共代码**、**单独目录构建**、可增量落地、不破坏现有 Web 前端。

---

## 2. 现状分析：现有 `frontend/` 公共代码能否直接复用

关键结论：**现有 `frontend/js/public/*` 是浏览器耦合的，不能在小程序里直接 `require` 字面复用**，但其中"纯逻辑"可以抽到共享核心。

| 现有模块 | 依赖的浏览器 API | 能否直接复用 | 处理 |
|---|---|---|---|
| `public/utility_request.js` | `axios`、`localStorage`、`window.location` | ❌ | 网络层用 `wx.request` 重写适配（`core/request.js`） |
| `public/api.js` | `window`、`document`、`localStorage`、`location`、`pageUrl`、`MutationObserver` | ❌ | 鉴权/导航/守卫在两端差异大，各写；纯函数（mask/escape）抽到 `shared/` |
| `public/auth.js` | `localStorage`、`document.cookie`、`window.request` | ❌ | 登录态改为 `wx` 存储（`core/storage.js`） |
| `public/terms.js` + `termsFunction.js` | `document`（DOM 替换）、`localStorage` | 部分 | **词典数据 + 纯函数**抽到 `shared/terms.js`；DOM 替换改为 WXML `{{term(key)}}` |
| `public/enumTerms.js` | 仅 `window` 挂载，逻辑纯 | 部分 | `courseTypeText`/`enumTermText` 抽到 `shared/terms.js` |
| `data-term` 机制 | DOM `querySelectorAll` | ❌ | 小程序用 WXML 绑定 `term(key)` 取代 |

**可原样抽出的"纯逻辑"**（零浏览器依赖）：术语词典 `TERM_DICT`、角色/状态常量、`normalizeUrl`、响应解包 `unwrapResult`、脱敏/转义 `maskPhone/maskEmail/escapeHtml`、API 端点路径。
这些已迁移到仓库根 `shared/`，Web 与小程**序同一份源**。

---

## 3. 两种技术路线对比

### 方案 1：原生小程序 + 共享核心（**推荐**）
- 新建 `miniprogram/`（原生 WXML/WXSS/JS），UI 用 WXML 重写；
- 抽出 `shared/`（ES Module 纯逻辑）作为唯一权威源；
- 各端只写一层**薄适配**：网络（`wx.request` vs `axios`）、存储（`wx` vs `localStorage`）、术语渲染（WXML 绑定 vs DOM）；
- 页面*逻辑*（拉数、状态、调接口）从现有 `js/*.js` 平移。

### 方案 2：Taro / uni-app 跨端框架
- 用 React/Vue 写一次，编译到小程序 + H5；
- 复用度最高，但要求**把现有 vanilla 页面整体改写为框架组件**（大改写），且 Web 端仍是原 `frontend/`，两套并存。

| 维度 | 方案 1（原生+共享核心） | 方案 2（Taro/uni-app） |
|---|---|---|
| 对现有 Web 影响 | 无 | 需把页面迁到框架（或并存） |
| 公共代码复用 | 纯逻辑/术语/常量/端点 100% 复用 | 全部逻辑+UI 复用 |
| 风险 | 低（增量） | 中（框架锁死、大改写） |
| 维护成本 | 适配层各写一份（薄） | 单一代码库 |
| 适合场景 | 小程序作补充渠道 | 小程序与 Web 长期收敛为一体 |

**推荐方案 1**：当前小程序定位是 C 端补充渠道，且现有 `frontend/` 是 vanilla 多页、不便整体框架化；方案 1 风险最低、可立即增量落地，真实复用落在"易变且易错"的术语/常量/脱敏/端点上。方案 2 留作未来若要做"一套代码多端"的演进选项。

---

## 4. 推荐架构：共享核心 + 平台适配层

```
                ┌─────────────────────────────┐
                │   shared/  (纯逻辑, 零浏览器API) │  ← 唯一权威源
                │  constants / terms / format /   │
                │  apiPaths (normalizeUrl/unwrap) │
                └──────────────┬──────────────────┘
                    │ import    │ import
        ┌───────────┴──────────┐   ┌──────────────┴───────────┐
        │  frontend/ (Web)      │   │  miniprogram/ (小程序)     │
        │  public/ 适配层:       │   │  core/ 适配层:             │
        │   utility_request.js  │   │   request.js (wx.request)  │
        │   auth.js (localStorage)│  │   storage.js (wx storage)  │
        │   termsFunction.js    │   │   term.js (WXML 绑定)       │
        │  HTML + 全局 script    │   │  WXML + Page/Component      │
        └───────────────────────┘   └────────────────────────────┘
```

### 目录结构
```
<repo>/
├── shared/                  # 跨端共享核心（本次已建）
│   ├── constants.js         # 角色/状态/运行配置
│   ├── terms.js             # TERM_DICT + 纯函数 termText/getOptions/courseTypeText...
│   ├── format.js            # maskPhone/maskEmail/escapeHtml
│   ├── apiPaths.js          # normalizeUrl / unwrapResult / ENDPOINTS
│   └── index.js             # barrel
└── miniprogram/             # 小程序工程（独立构建，本次已建骨架）
    ├── project.config.json  # appid/setting（urlCheck 关便于联调）
    ├── app.json / app.js / app.wxss
    ├── sync-shared.js       # npm run sync：把 ../shared 拷贝进 ./shared
    ├── shared/              # 由 sync 生成（不手写，保持单一源）
    ├── core/                # 平台适配层
    │   ├── request.js       # wx.request 版（对齐 utility_request 行为）
    │   ├── storage.js       # wx 存储版（对齐 localStorage）
    │   └── term.js          # 术语适配（WXML 用 term(key)）
    └── pages/
        ├── login/  home/  demo/   # 本次 proof-of-concept
        └── ...（后续业务页）
```

### 复用边界（明确的"共享 / 各写"）
- **共享（只维护一份）**：术语词典与多语言、角色/状态常量、脱敏与转义、API 路径与 `normalizeUrl`、响应解包约定、登录接口契约。
- **各写（薄适配，差异天然）**：网络实现（wx.request vs axios）、存储（wx vs localStorage）、导航/路由（`wx.navigateTo` vs `location`）、术语渲染（WXML 绑定 vs DOM 替换）、UI 布局（WXML/WXSS vs HTML/CSS）。
- **各写（不可避免）**：所有业务页面的视图层（WXML）需重写；但页面*逻辑*（请求、状态、术语调用）从 `frontend/js/*.js` 平移。

---

## 5. 页面映射（小程序页 ↔ 现有 frontend 页）

小程序作为 C 端渠道，v1 聚焦学生/老师/消息；管理后台（admin/platform_admin）暂不在小程序内。

| 小程序页 | 对应现有 frontend | 说明 |
|---|---|---|
| `pages/login` | `index.html` | 登录（tenantCode/角色），逻辑平移 |
| `pages/home` | `student.html`/`teacher.html` 入口 | 角色首页/工作台 |
| `pages/booking/list` | `student-bookingCards` / `teacher-courseAndScheduleBrowserCards` | 课程/排期浏览 |
| `pages/booking/detail` | `booking.html` | 排期详情 + 下单；深链 `?scdid=&tid=&sid=` 对齐 |
| `pages/booking/my` | `student-bookingBrowserCards` | 我的预约 |
| `pages/teacher/profile` | `teacherInfo.html` / `teacherPublishedProfile.html` | 教师简介查看/分享 |
| `pages/teacher/schedule` | `teacherInfo-edit` / `admin-schedule` | 我的排期管理 |
| `pages/message/inbox` | `messages-inbox` | 收件箱（**SSE→轮询/订阅消息**，见 §6） |
| `pages/message/detail` | `messages-inbox` 详情 | 消息详情/已读 |
| `pages/mine` | `api.js` 改密/登出 | 个人中心 |

---

## 6. 后端影响与对接

小程序调用**同一套 REST API**，后端基本不变：

1. **鉴权**：沿用 JWT `Bearer`；登录接口 `/auth/login` 不变；token 存 `wx` 存储（原 localStorage）。`core/request.js` 已实现 401 静默刷新，行为对齐 `utility_request.js`。
2. **域名白名单（非 CORS）**：小程序要求后端域名在**微信公众平台→开发设置→request 合法域名**中备案（HTTPS）。这不等同浏览器 CORS，是小程序平台自身的域名校验；联调用 `project.config.json` 的 `urlCheck:false` 临时关闭。**需把 `apiBase`(业务端) 与 `msgBase`(message-service) 两个域名都加白。**
3. **实时推送（重点差异）**：小程序**无 SSE / EventSource**。消息中心改：
   - v1：进入页面/下拉/定时（如 30s）**轮询** `/users/{uid}/inbox/unread-count` + 列表；
   - 后续：接入**微信订阅消息**（需模板审核 + 用户主动订阅）做新消息提醒。
4. **敏感词过滤自动生效**：后端 `MessageService.validateCommon` 已对明文做 DFA 拦截（REJECT/MASK），小程序发消息走同一接口，**无需任何改动即复用**。
5. **端点清单**（已在 `shared/apiPaths.js` 的 `ENDPOINTS` 声明）：登录/登出/刷新、术语 `term/map`、租户行业 `tenant/industry`、改密、消息 `messages/*`、敏感词 `sensitive/test` 等。

---

## 7. 构建与 CI（独立目录，与 Web 解耦）

- `frontend/build.js`（terser/clean-css）**只管 Web**，不碰小程序。
- 小程序构建：
  - 本地：微信开发者工具打开 `miniprogram/`（原生支持 ES Module，无需 webpack）；
  - 共享核心同步：`cd miniprogram && npm run sync`（把 `../shared` 拷入 `./shared`，保证单一源）；
  - CI/上传：用官方 **`miniprogram-ci`** 做预览/上传（需小程序私密密钥 + appid，配置到 CI 环境变量），不走 Web 的 `build.js`。
- 包体积：主包控制在 2MB 内，业务页按需分包（`subpackages`）；`shared/` 仅几 KB，无负担。

---

## 8. 落地路径（分阶段）

- **P0 立项与骨架（本次已完成）**：建 `shared/` + `miniprogram/` 骨架（config、`core` 三件套、`login/home/demo` 三页、`sync-shared`）。验证：开发者工具可编译、可 `import` 共享核心、登录链路跑通。
- **P1 基础能力补全**：`pages/mine`（改密/登出）、全局 `onAuthFail` 跳转、术语多语言切换（zh/en/fr）、租户品牌标题、错误统一 toast、`tabBar` 导航。
- **P2 核心业务 MVP**：`booking/list` + `booking/detail` + 下单（对齐 `booking.html` 深链 `scdid/tid/sid`）、`booking/my`（我的预约）。打通端到端预约闭环。
- **P3 消息中心**：`message/inbox` + `detail`，轮询实现已读/列表（订阅消息作为后续增强）；发送若需要则复用 `sensitive/test` 做输入预检。
- **P4 教师端**：`teacher/profile`（简介查看/分享）、`teacher/schedule`（我的排期）。
- **P5 打磨与上线**：`miniprogram-ci` 上传脚本 + CI、域名白名单配置、真机调试、包体积/分包优化、术语多语言联调。
- **（可选演进）方案 2**：若未来确定"一套代码多端"，再评估 Taro/uni-app 收敛，届时 `shared/` 纯逻辑可直接复用。

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 实时推送（无 SSE） | v1 轮询；后续订阅消息 |
| 域名白名单（HTTPS 备案） | 提前在公众平台加 `apiBase`/`msgBase`；联调 `urlCheck:false` |
| 共享核心双份漂移 | `shared/` 唯一源 + `npm run sync` 拷贝进小程序，禁止手写 `miniprogram/shared/` |
| Web 与小程序术语不一致 | 两端共用 `shared/terms.js`，`serverMap` 合并逻辑一致 |
| 登录态/刷新差异 | `core/request.js` 完整移植 401 队列刷新，与 Web 行为对齐 |
| 包体积超限 | 主包 <2MB，业务页分包 |

---

## 10. 本次已交付的骨架（可运行验证）

- `shared/`：5 个纯逻辑模块（已 `node` 实测 `termText/normalizeUrl/maskPhone` 正常）。
- `miniprogram/`：
  - 配置：`project.config.json`、`app.json`、`sitemap.json`、`package.json`、`sync-shared.js`；
  - 适配层：`core/request.js`（wx.request 版，含 401 刷新/解包）、`core/storage.js`、`core/term.js`；
  - 页面：`pages/login`（真实登录，复用 `request`+`storage`+`term`）、`pages/home`、`pages/demo`（证明共享术语渲染）；
  - 运行 `npm run sync` 已把 `shared/` 拷入 `miniprogram/shared/`，ESM 导入验证通过。
- 打开微信开发者工具 → 导入 `miniprogram/` 目录即可编译预览（appid 先用 `touristappid` 测试号）。

## 11. 下一步（待确认）

1. 确认小程序 **appid** 与两个 **HTTPS 域名**（业务端 / message-service）用于真机与上线；
2. 确认 v1 范围是否按 §5 的 C 端页（登录/首页/预约/我的/消息/个人中心），管理后台是否纳入；
3. 确认消息实时性要求（轮询即可 / 需订阅消息）；
4. 评审通过后进入 P1/P2 逐页实现。
