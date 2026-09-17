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

- **P0 立项与骨架（已完成）**：建 `shared/` + `miniprogram/` 骨架（config、`core` 三件套、`login/home/demo` 三页、`sync-shared`）。验证：开发者工具可编译、可 `import` 共享核心、登录链路跑通。
- **P1 基础能力补全（已完成）**：三入口登录（教师/学生/管理 + `tCode` 绑定）、三角色首页工作台 + `role-tabbar` 按角色底部导航、`pages/mine`（改密/登出/多语言切换/租户信息）、全局 `onAuthFail` 跳转、术语多语言切换（zh/en/fr）、错误统一 toast。
- **P2 核心业务 MVP（已完成）**：学生端 `booking/list`+`booking-detail`+下单+`my-booking`（我的预约/取消）；教师端 `courses`（我的课程）+`profile`（简介）；管理端 `dashboard`（概览+租户用量）。预约闭环端到端打通（依赖后端字段见 §12）。
- **P3 消息中心（已完成）**：`pages/message/inbox` + `detail`。轮询（20s，未读数变化才重载列表）+ 手动刷新按钮（🔄 旋转动画）+ 下拉刷新；分类树筛选、仅看未读；打开即标记已读、收藏/取消、删除。三个首页与个人中心均接入「消息中心」入口并带未读角标（`onShow` 拉未读数）。小程序无 SSE，故以轮询实现即时更新；订阅消息作为后续增强。
- **P4 教师排期编辑（已完成）**：`pages/teacher/schedule`（我的排期列表，支持新增/编辑/删除/启停 `active↔frozen`）+ `pages/teacher/schedule-edit`（表单：课程/名称/日期/时段/重复方式/名额/状态，字段对齐 `ScheduleCreateDTO`）。教师首页新增「排期管理」入口。后端端点：`/api/v1/schedule/{listByTeacher,detail,create,update,delete/{id},updateStatus}`。
- **P5 打包/上线（已完成）**：`app.json` 分包（student/teacher/admin/message 四分包 + `preloadRule` 预下载）；`miniprogram-ci` 上传脚本 `scripts/upload.js` + `npm run upload`（密钥经 `MINI_PRIVATE_KEY` 注入）；`域名白名单与上线说明.md` 列出 request 合法域名（`apiBase`/`msgBase`）、无 socket 域名（因无 SSE）、占位符替换与上线检查清单。
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

---

## 12. P1 / P2 落地说明（2026-09-16，已按"原生小程序 + 共享核心"实现）

### 12.1 三入口 + tCode 绑定（用户确认项）
- **登录页 `pages/login`**：租户编码 `tCode` 输入框 + 教师端/学生端/管理端 三个分段入口。
  - 管理端：租户管理员填真实 `tCode`；平台管理员 `tCode` 固定为 `platform`（输入框禁用）。
  - **tCode 与小程序绑定**：登录成功后把 `tCode` 写入 `boundTenantCode`（持久化）；再次进入自动回填；「我的 → 切换租户」可解绑并回登录页。
  - 登录按角色路由：`student→pages/student/home`、`teacher→pages/teacher/home`、`admin/platform_admin→pages/admin/home`（`homePageForRole` 在 `shared/constants.js` 统一定义）。
- **底部导航 `components/role-tabbar`**：按当前角色渲染对应导航项（`TAB_ITEMS` 在 `shared/constants.js`），`bind:change` 由各页 `wx.redirectTo` 处理，避免页面栈堆积。

### 12.2 占位符约定（待实际确定）
- `project.config.json` 的 `appid` = `touristappid`（微信开发者工具"测试号"占位符，上线前替换为真实 appid）。
- `app.js` 的 `globalData.apiBase` / `msgBase` = `https://api.example.com` / `https://msg.example.com`（上线前替换为真实 HTTPS 域名，并到微信公众平台配置 request 合法域名）。
- 联调期 `project.config.json` 的 `urlCheck:false` 已关闭域名校验，便于本地对接。

### 12.3 目录新增（相对 P0）
```
miniprogram/
├── core/auth.js                # 登录态/切换租户助手（login/logout/requireAuth/switchTenant）
├── components/role-tabbar/     # 按角色的底部导航组件
├── pages/student/{home,booking,booking-detail,my-booking}
├── pages/teacher/{home,courses,profile}
├── pages/admin/{home,dashboard}
└── pages/mine/                 # 个人中心（改密/登出/语言/租户，三端共用）
```
`shared/` 新增端点：`COURSE_*`、`BOOKING_*`、`TEACHER_PUBLISHED_*`、`DASHBOARD_*`；新增 `TAB_ITEMS`/`tabGroupForRole`/`roleLabel`/`homePageForRole`（三角色）。

### 12.4 后端字段依赖与待确认点
小程序按现有 `frontend/` 的调用契约平移，但以下字段名需联调时按真实响应校准：
- 课程列表：`COURSE_PAGE`（POST，body `{pageNum,pageSize,...}`）返回 `list/records`；课程字段用 `courseId/title/teacherName/subject`。
- 课程详情含 `schedules[]`（`scheduleId/startTime/remainSites/totalSites`）用于下单时段选择。
- 下单 `BOOKING_CREATE`（POST）请求 `scheduleId/courseId/studentId/studentName`；`BOOKING_UPDATE_STATUS` 用 `{id,status}`。
- 改密 `CHANGE_PWD`（POST）请求 `oldPassword/newPassword`（若后端字段为 `oldPwd/newPwd` 需对齐）。
- 管理端 `DASHBOARD_OVERVIEW` / `DASHBOARD_TENANT_USAGE(tenantId)` 返回字段按 `overview.*` / `usage.*` 渲染（看板字段名以真实响应为准）。
- **敏感词过滤自动生效**：小程序发消息走 `validateCommon`，无需改动（P3 消息发送时复用 `sensitive/test` 预检）。

### 12.5 验证状态
- `npm run sync` 已把 `shared/` 拷入 `miniprogram/shared/`，`node` 实测 `ENDPOINTS`、`homePageForRole`、`TAB_ITEMS`、`roleLabel` 全部正确。
- 各页为原生小程序代码，开发者工具导入 `miniprogram/` 即可编译预览；登录态/401 刷新/`term` 渲染适配层与 Web 端行为对齐。

---

## 13. P3 / P4 / P5 落地说明（2026-09-16，已完成）

### 13.1 P3 消息中心（轮询 + 手动刷新 + 下拉刷新）
- **入口**：`pages/message/inbox`（列表）+ `pages/message/detail`（详情）。三个首页「消息中心」入口 + `mine` 页「消息中心」行均带未读角标（`onShow` 调 `getUnreadCount`）。
- **即时更新三件套**：
  1. **定时轮询**：`inbox.js` 启动 `setInterval(20s)`，仅当未读数变化才静默重载列表（避免无谓刷新闪烁）；`onHide/onUnload` 清理定时器。
  2. **手动刷新按钮**：右上角 🔄，点击 `refresh()` 并带旋转动画。
  3. **下拉刷新**：`inbox.json` 开 `enablePullDownRefresh`，`onPullDownRefresh` 收尾 `stopPullDownRefresh`。
- **筛选**：分类树（三级，`/api/v1/message-categories/tree` 展平）+ 仅看未读（`unreadOnly=1`）。
- **详情**：打开即 `POST .../read` 标记已读；收藏/取消（`star/unstar`）、删除（`DELETE`）。
- **后端端点**（走 `msgBase`，`resolveBase` 已把 `/api/v1/users|messages|message-categories` 路由到 msgBase）：`/users/{uid}/inbox`、`/users/{uid}/inbox/unread-count`、`/users/{uid}/messages/{id}`、`/read`、`/star`、`/unstar`、`DELETE`。
- **服务封装**：`core/message.js`（`getUnreadCount/getInbox/getDetail/setRead/toggleStar/deleteMessage/getCategories/previewText/fmtTime`），与 Web `messages-inbox.js` 取数逻辑对齐。

### 13.2 P4 教师排期编辑
- **列表** `pages/teacher/schedule`：`GET /api/v1/schedule/listByTeacher?teacherId=` → 渲染名称/时段区间/重复方式/余位/约满/状态；操作：新增、编辑、删除、启停（`updateStatus` 的 `active↔frozen`）。
- **编辑** `pages/teacher/schedule-edit`：表单字段对齐 `ScheduleCreateDTO`：
  - `repeatType`：0 不重复 / 1 每天 / 2 每周 / 3 每月（`ScheduleCreateDTO` 的 `@JsonSetter` 同时接受 int 与 `none/day/week/month` 字符串，本端统一传 int）。
  - 每周 `repeatDays`：多选 周一..周日（数组）；每月 `repeatDays`：单个日期。
  - 日期+时段分别用 `startDate/startTime/endDate/endTime`（DTO 为 `LocalDate`+`LocalTime`）；列表展示的 `CourseSchedule.startTime` 为合并串 `YYYY-MM-DD HH:mm:ss`，编辑时按 `slice` 拆回。
  - `availableSites`、`status`（active/frozen 由 switch 控制）。
  - `teacherId` 不传：后端由 `Authorization` 令牌解析（`ScheduleController` 已 `checkTeacherOrAdmin`）。
- 课程下拉：`GET /api/v1/course/list` 取 `courseId/courseName`；排期名称默认取课程名。

### 13.3 P5 分包 / CI / 域名白名单
- **分包**（`app.json`）：主包保留 `login / 三个首页 / mine / demo`（6 页）；深页分包 `pages/student`、`pages/teacher`、`pages/admin`、`pages/message`（4 分包）。`preloadRule` 在首页/个人中心进入时预下载对应分包。
- **跨包引用**：`core/`、`shared/` 在主包，分包页用相对路径 `../../` 引用主包模块（已验证允许）。
- **CI 上传**：`scripts/upload.js`（`miniprogram-ci`），`npm run upload <version> <desc>`；密钥经环境变量 `MINI_PRIVATE_KEY` 注入，不入库。
- **域名白名单**：见 `域名白名单与上线说明.md` —— request 合法域名 `apiBase`/`msgBase`（HTTPS 备案）；无 socket 域名（小程序无 SSE，消息靠轮询）；占位符 `touristappid` / `*.example.com` 上线前替换；联调 `urlCheck:false`。

### 13.4 验证
- `npm run sync` 已同步 `shared/`；`node` 校验 `ENDPOINTS`（消息中心 + 排期共 18 项）+ `homePageForRole` + `core/message` 导出，全部通过。
- `app.json` 解析通过（6 主包页 / 4 分包 / 4 preload）。
- 开发者工具导入 `miniprogram/` 即可编译预览；消息轮询、排期增删改、分包跳转待真机/联调验证。
