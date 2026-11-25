# 课堂深链契约与 frontend 迁移边界裁定（系统架构师版 v1）

> 事实基线：classroom-app（Capacitor，server/local 双模式）+ frontend 原生页；深链既有约定见 `classroom-app/src/core/role-router.js`。本文只做契约与边界裁定，不含实现代码。

## 0. 一页结论

| 议题 | 裁决 |
|---|---|
| 深链形态 | **D-1 = A 的 URL 契约 + C 的唤起增强**：URL 永远 `https://{origin}/{page}.html?...`，自定义 scheme 仅作为站点内"用 App 打开"按钮的本地兜底 |
| 否决 | B 独立子域；C-only 纯 scheme |
| classroom-app/www | **必须同域同根路径部署为 web 站点**，不只是 App 包 |
| 深链基址 | 只有一个公开站点根 `publicWebOrigin`；**取消 `CLASSROOM_APP_ORIGIN`**（不存在"第二个 origin"） |
| 不出壳 | 靠**结构**保证：站内跳转恒相对路径；`isInApp()` 不得影响 URL 形态 |
| URL 稳定性 | host + 根路径 + `.html` 文件名**永久不可变** |
| role 参数 | 禁止入链（FP-001 已定案，不许回退） |
| token | 禁止入链，永不 |
| 过渡期 frontend 课堂页 | 全部保留、一字不改（server 模式下 App 直接加载线上前端，删页 = App 白屏） |
| shared 收敛 | 扩展现有 `classroomLink`，不新增第二个构造器 |

## 1. 目标形态（对应问题 a）

**裁决 D-1。** 三个问题逐条回答：

- **纯浏览器打开落到哪里**：落到 `https://{origin}/classroom.html?scheduleId=...`，即 web 课堂页，功能完整可用。收敛后该页由 `classroom-app/www` 产物提供（同一 URL、同一文件名），frontend 源码里的同名页下线。**这是产品底线：课堂是交付核心，不允许出现"没装 App 就进不去教室"。**
- **装了 App 怎么进 App**：Android App Links（`intent-filter autoVerify` + `/.well-known/assetlinks.json`）+ iOS Universal Links（AASA + Associated Domains），声明路径 `/classroom.html`、`/classroom-prep.html`、`/index.html`、`/my-classroom.html`；App 内 `App.addListener('appUrlOpen')` 解析 `scheduleId` 后路由。**注意 iOS 限制：从同域页面内点链接不会唤起 App**，所以站内入口配一个显式"用 App 上课"按钮走 scheme（带 1.5s 超时回退 https）。
- **未装 App**：同一 URL 直接在浏览器上课，无第二套实现、无二次跳转。这也是选 A 契约的根本原因——降级是天然免费的。
- **App 内不出壳**：不做"检测到在 App 就特殊处理"的运行时判断，而是把规则收到构造器结构里——`href()` 恒返回相对路径，所以无论跑在 `https://域名` 还是 `capacitor://localhost`，都自然留在当前 WebView。`isInApp()` 只允许控制"要不要显示『用 App 打开』按钮"，不参与 URL 拼接。这样即使 Capacitor 桥在 server 模式下是否注入尚未实测，跳转正确性也不受影响。

**否决 B（独立子域 classroom.{domain}）**：① 跨域 localStorage 不共享 → 用户点链接后必须重新登录，或把 token 塞 URL（安全红线）；② server 模式下 `server.url` 需改指子域，与后端不同源，`apiOrigin/classroomApiOrigin/classroomWsOrigin` 三套地址全要配 + 后端 CORS 放行 + WS 跨域鉴权；③ 历史通知/二维码/收藏夹/小程序分享里已发出的旧 URL 全部失效，需长期双份部署。三条成本都换不来相应收益。

**否决 C-only（纯自定义 scheme）**：未装 App 时链接彻底失效（消息中心、二维码、短信、微信内全废）；且 `messages-inbox.js:safeJumpUrl` 只放行 `http(s)` 与单段 `*.html`，scheme 会被白名单拦下，为它放宽白名单等于削弱消息中心的安全边界。

**附带硬约束（由 safeJumpUrl 正则反推）**：深链路径必须是**根目录下单段 `[A-Za-z0-9_-]+.html`**，不能是 `/classroom/index.html` 这类多段路径，否则消息中心"进入课堂"按钮直接渲染不出来。这条同时封死了"用子路径部署规避子域成本"的折中方案。

## 2. 参数契约（对应问题 b）

| 场景 | URL 形态 | 必带 | 可选（untrusted 展示元数据） |
|---|---|---|---|
| 直接上课 | `/classroom.html?scheduleId={key}&tCode={code}` | scheduleId, tCode | `src`（埋点来源）、`from` |
| 课前检测 | `/classroom-prep.html?scheduleId={key}&tCode={code}` | 同上 | `mode=student`、`start/end/state/idx/total` |
| 统一入口（未登录/角色未知） | `/index.html?scheduleId={key}&intent=classroom\|prep&tCode={code}` | 同上 | `src` |
| 回放 | `/replay.html?scheduleId={key}&tCode={code}` | 同上 | — |

规则：
- **R1** `scheduleId` 是唯一业务键：第 1 课次 `<id>`，第 2 课次起 `<id>~N`，沿用现约定，不改。
- **R2** `tCode` 必带。缺失则登录页无法锁定机构，多租户下会锁错租户（`api.js:790-798` 已记录该坑）。
- **R3** `role` **禁止入链**。FP-001 已把课堂页 role 收敛为只认登录态；任何"为了按角色分流而恢复 role 参数"的做法都会重新打开越权口（`classroom-main.js` 的 `role` 一旦可覆盖，前端越权 UI 立刻回归）。角色分流由 `index.html → my-classroom.html` 按登录态完成。
  - 落地补充：`frontend/js/classroom/ops.js:511-512` 现以 `_classroomLink(sid, { role: 'teacher' })` 生成"教师链接"，实际与学生会话下发的链接**完全等价**——这是必须清掉的"假分流"。参数删除，同时**两个复制按钮合并为一个「复制课堂链接」**（保留两套文案会继续误导运营）；文案措辞需产品确认。
- **R4** `token` / `tenantId`（数字 ID）/ `userId` / 手机号 **禁止入链**。Token 走 URL 会被 Referer、日志、截图、转发泄漏。
- **R5** `mode`、`start/end/state/idx/total` 一律标注**不可信、仅首屏渲染**，接口返回后必须覆盖。它们只影响文案，绝不影响鉴权。
- **R6** 深链 host 与路径不可变（见 §5 风险 9）。

**tCode 与登录态冲突的优先级（必须按此实现，不许自创）：**

1. 未登录：URL `tCode` 作为**租户预选**传给登录页锁定输入框；登录成功后按 `back=` 回跳原深链。
2. 已登录 且 URL `tCode` == 登录态 `tenantCode`：直接进。
3. 已登录 且 不一致：**不静默切租户、不覆盖本地登录态**，跳 `login.html?reason=tenant_mismatch&back=<原深链>`，由用户显式确认"退出当前机构并切换"。理由：静默覆盖等于跨租户串号，`app-entry-guard.js` 的 `TENANT_MISMATCH` 已经守这条线，前端不能绕过。
4. `platform_admin`：`tCode` 恒为 `platform`（与 `resolveTenantCode` 一致）。
5. 无 `tCode`：沿用 `resolveTenantCode()` 现状，不附加。

**前端因此要遵守的约束（可直接转成 code review checklist）：**

- C1 所有课堂跳转必须过单一构造器 `window.ClassroomLink`，**禁止**再出现 `'./classroom.html?scheduleId='` 字面量（现有 7 处点位全部替换）。
  - **v1.3 位置修订：构造器并入 `js/public/api.js`（紧随 `pageUrl` 定义），不新建文件。** 理由：它的唯一依赖是同文件的 `pageUrl`/`resolveTenantCode`；独立成文件会同时引入两类事故——① 不在 `sync.js` 的 `PUBLIC_JS` 白名单 → local 模式（真正打包的 App）里 `window.ClassroomLink` 为 undefined；② 需要在 `student.html`/`teacher.html`/`admin.html`/`classroom-ops.html` 四个页面各加一行 `<script>` 且必须排在入口 JS 之前 → 漏一处就是运行时空指针。并入 `api.js` 后：白名单天然覆盖、加载顺序天然正确、**零 HTML 改动**，代价只是 api.js 增大约 130 行（同一职责域，可接受）。**落地时该段必须自带 IIFE，见 C12。**
- C2 两个语义分开的 API：`href(spec)` 返回站内相对地址（本页跳转用）、`shareUrl(spec)` 返回绝对可分享地址（复制链接/发通知/二维码用）。禁止用同一个函数糊两种场景。
- C3 `href/shareUrl` 内部必须委托 `window.pageUrl` / `resolveTenantCode`，以保证 tCode 规则与全局一致；**不得**在 `extra` 里塞 `tCode` 期望覆盖——`pageUrl` 最后 set `tCode`，传了也无效（`api.js:837-840`）。
- C4 构造器签名里**没有 role 字段**（从类型层面杜绝）。
- C5 `messages-inbox.js` 的 `safeJumpUrl` **不改**。payload 里永远放 https 深链；scheme 由前端点击时本地转换（`httpsToScheme()`），不落库、不进 payload。
- C6 改完入口 JS 后必须重跑 `classroom-app && npm run build` 并回归 3 个 App 内点位（`my-classroom-core.js`、`student-joinClassroom.js`、`messages-inbox.js` 均在 sync 白名单内，会连带进入 www）。
- C7 **`href()` 恒相对、`shareUrl()` 恒绝对**（见 §1）。现有 7 处点位里，站内跳转用 `href()`，复制链接/发通知/二维码用 `shareUrl()`；两者混用即视为 bug。
- C8 **基址只有一个 `publicWebOrigin`**，取消 `CLASSROOM_APP_ORIGIN`。server 模式下 `publicWebOrigin` 恒等于 `FRONTEND_ORIGIN`（`server.url` 加载的就是线上前端，出现第二个 origin 必然跨源加载 + 课堂 API 同源假设破裂）；local 模式下 `app-config.js.frontendOrigin` 为**空**，`shareUrl()` 无基址可拼，因此必须**新增 `publicWebOrigin` 字段并在构建期断言非空**。`pickOrigin()` 校验：必须 `https`、不含路径段、不得为 `capacitor://localhost`、不得为空（local 模式）。
- C9 **`safeJumpUrl` 已放行任意 `http(s)://`**（`shared/domain/message.js:232`、`frontend/js/messages-inbox.js:61`），所以 https 深链在消息中心**零改动**可用。**不要**为深链去动 `shared/domain/message.js`、不要走四步同步。仅当引入自定义 scheme 才需要放宽白名单——本方案不引入，故 §4 的 shared 改动只限 `classroom.js`。
- C10 **非安全深链不得进入持久化通道**。基址校验：生产环境必须 `https`；**判定 `insecure` 的三个条件取"或"**——① 目标非 https；② 目标 host 为 localhost/回环/私网（`10./172.16-31./192.168.`）；③ 来源页自身非 https。允许 `insecure` 结果存在（否则 dev 环境 `http://192.168.1.10:8080` 会让 `shareUrl()` 全部退到兜底分支、反而掩盖问题），但**只允许本地复制与调试**：任何落库通道**必须检查 `insecure` 并拒绝**。**已完成核实**：课堂侧落库点位当前只有 `js/classroom/ops.js:701`（消息 payload）一处，`:731` 是通知结果**回显输入框**、非生成；全仓 `QRCode` 仅用于 `login.html`（微信登录码）与 `js/public/promo.js`（推广码），**课堂侧无二维码生成**——故落库闸门按"当前 1 处 + 未来新增需登记"管理，不要凭想象加校验点。理由：私网 IP 深链一旦发出去，收件人点开必然失败，且不可召回。
  - **v1.4 通道归属（与 C2/C11 对齐）**：`insecure` 只由 `shareUrlSafe()` 返回。**候选有效性**与 **`insecure` 判定必须解耦**——候选有效性只判 4 项（非空 / `^https?://` / host 合法即无 path、无 `..`、端口 2~5 位 / 非 `capacitor:`），**不判是否私网**。生产用 `http://192.168.x.x` 打开时，候选有效但 `insecure=true` → payload 被拒；local 模式 `capacitor://localhost` 被判"非 http(s)"→ 无效候选 → 继续走 `PUBLIC_WEB_ORIGIN`。fail-closed 方向正确：宁可复制不可用，也不发坏链接。
- C11 **无可用基址时禁止静默降级**：`shareUrl()` 显式返回空串 + 禁用对应复制按钮，**禁止**降级为相对路径——相对路径被复制出去就是坏链接，比空串更难排查。（local 模式下 `window.FRONTEND_ORIGIN === location.origin === 'capacitor://localhost'`，会被 C10 校验拦掉，此时唯一可用来源是 `APP_CONFIG.publicWebOrigin`。）
- C12 **并入 `api.js` 的新增段必须自带 IIFE**：`(function () { 'use strict'; … })();`，只通过 `window.*` 对外暴露。
  - 为什么必须（**已实测，非经验判断**）：`api.js` 是扁平脚本、**全文无 IIFE 包裹**。用括号深度扫描（`node` 脚本，深度 0 判定，忽略缩进）得到 **35 条真实顶层声明**：`var _storageBackend`(:12)、`var STORE`(:15)、`const API_SERVER_HOST`(:58)、`const API_SERVER_PORT`(:59)、`const API_BASE_PATH`(:60)、`const API_BASE_URL`(:64)、`let courseList/scheduleObject/…`(:68-77)、`const userTimeZone`(:80)、`const mo`(:85)、以及 `observe`/`InitUserInfo`/`fetchUserList`/`getToken`/`getCurrentUserInfo`/`redirectToUserPage`/`isJwtExpired`/`autoLoginCheck`/`escapeHtml`(:703)/`toastMsg`(:715)/`escapeAttr`(:723)/`tenantStatusText`(:732)/`maskPhone`(:741)/`maskEmail`(:744) 等一批**全局函数声明**；`const ClassroomAPI`(:1116) 同样是**顶层词法绑定**（该行前括号深度 0，只是缩进了 2 格）。因此往里加任何顶层 `const/let`，都会直接扩大全局词法绑定面 → 一旦撞上同页另一文件的顶层 `var`/`function`，**整个 api.js 在解析期抛 SyntaxError，一个函数都不注册**，页面表现为"模块未加载"（这正是 `tools/check-global-collide.mjs` 头部记录的 2026-10-09 真实故障形态）。
  - 反例约束（**同样重要**）：**禁止把整个 `api.js` 包进 IIFE**。它的全局函数被至少 40 个文件直接调用（`platform-admin-dataMaintain.js` 40 处、`teacherInfo-publish.js` 36 处、`platform-admin-user.js` 12 处…），整体包裹会一次性打断全部调用方。**只包新增段，不动既有声明。**
  - 新增名字占用已核实为空：全仓无 `ClassroomLink` / `buildShare` / `shareUrl` / `shareUrlSafe` / `resolvePublicOrigin` 的既有声明，经 `window.ClassroomLink` 属性挂载不产生词法绑定。
- C13 **双函数契约（v1.4 定稿，取代"只返回对象"的早期表述）**：内部只有 `buildShare(spec)` 一个构造实现；对外两个出口——`shareUrl()` 返回**字符串**（保持既定约定，6 处调用点零返工）、`shareUrlSafe()` 返回 `{ url, insecure }`。硬规则：**即时 UI（只读 input 渲染、复制按钮）走 `shareUrl()`；落库/外发（payload、通知正文、未来二维码）走 `shareUrlSafe()` 且必须查 `insecure`**。两者共用同一构造，不得各自实现（防漂移）。
  - 同理，`href()` 与 `shareUrl()` 也共用构造，仅基址策略不同（C2/C7）。

## 3. frontend 课堂页去留与兼容义务（对应问题 c）

**分两阶段，过渡期一刀不动。**

- **P0 过渡期（本次改造，App 仍 server 模式）**：四个课堂页**能力与结构**一字不改。原因：server 模式下 `capacitor.config.json` 的 `server.url` 指向线上前端，WebView 加载的是**线上原页**，`www/` 里的补丁只对 local 模式生效。此时删页 = App 白屏。
  - **"不改"的准确口径（v1.2 明确）**：指"不改课堂能力与页面结构"，**不含**入口链接构造与链接分发展示。后者是本次改造对象。
  - **允许改（P0 改动面，共 8 个 JS = `api.js` + 7 个调用点，零 HTML 改动）**：`js/public/api.js`（新增 `ClassroomLink` 构造器）、`js/admin-schedule.js:2635-2641`、`js/admin-booking.js:382-386`（+250 按钮）、`js/teacher-courseAndScheduleBrowserCards.js:457-463`、`js/student-bookingBrowserCards.js:592-596`（+293）、`js/public/my-classroom-core.js:184/190/196/209`、`js/student-joinClassroom.js:234`、`js/classroom/ops.js:394-399/419-430/425-426/511-512` 与 `js/classroom/ops.js:701`（payload 落库闸门，同文件计一次）。另需改 `tools/check-classroom-link` grep 守卫白名单（不计入业务文件）。
  - **v1.3 撤销**：`classroom-ops.html` 不再需要新增 `<script>` 引用（构造器已并入 `api.js`，该页第 366 行已引）→ **"页面文件一律不动"的纪律完整保住**。
  - **不改（推到 P1/P2）**：`classroom-prep.js:376`（课前页内"进入课堂"）、`classroom-main.js:774/834`（回放与站内返回）、`admin.html:399-404`（运营台→`classroom-ops.html`，路径 P2 前不变故无需改）。
  - `js/classroom/ops.js` **不在 `sync.js` 白名单**（白名单 `CLASSROOM_JS` 不含它，App 用自有的 `ops-lite.js`），因此改它不会波及 www，回归面仅限 frontend 运营台。本阶段只做**入口链接收敛**（C1~C9）。
- **P1 收敛期（App 切 local 模式 + www 同域部署）**：
  - `classroom.html` / `classroom-prep.html` 两个文件名由 `classroom-app/www` 产物在同一 URL 上提供，`frontend/` 源码中同名页删除。
  - **`replay.html` 不进 classroom-app 白名单，永久留在 frontend 同源**（裁决）。理由：回放是点播播放，不需要摄像头/麦克风/屏幕共享/WS 长连接，在 App 内打开**无收益**；纳入白名单需补 JS 白名单 + 全屏/画中画回归，成本全花在没人受益的地方。代价是 local 模式下 App 内点回放会 404，因此定一条规则：**`replay.html` 是唯一合法的"出壳"例外**——local 模式下改用 `@capacitor/browser` 打开 `publicWebOrigin/replay.html?...`；server 模式相对跳转即可（本来就没出壳）。
  - **`classroom-ops.html` 留在 frontend 到 P2**（裁决）。App 内 `ops.html` 是轻运营版，巡课/强结/链接分发能力与 `classroom-ops.html` 不等价，能力未补齐前不做重定向。P2 补齐后 `classroom-ops.html` → `ops.html` 做 301/JS 重定向（内部页、无外部分发，改名风险最低）。
  - **推论（防误删）**：`frontend/js/classroom/*` **不能被整目录删除**——`ops.js`（classroom-ops.html 依赖）与 `classroom-main.js`（replay/课堂依赖链）仍被引用的页面还在 frontend。删减顺序必须是「删页面 → Grep 确认零引用 → 再删 JS」，逐个来，禁止目录级删除。

**必须永久履行的兼容义务：**

1. 已发出的历史深链（通知 payload.url、线下二维码、海报、用户收藏夹、小程序分享、微信群转发）**必须长期有效**。靠"同域同路径"天然满足——这是选 A 契约的最主要理由。
2. 因此**禁止**在迁移后删除旧路径或直接改 host；如未来必须换域，旧域必须保留重定向至少 12 个月【待确认：产品/法务对历史链接有效期的要求】。
3. `replay.html` 历史链接同等对待。
4. 迁移期两套实现并存时，课堂页行为必须等价（同一份 www 产物 vs frontend 原页），需一次差分回归【待确认：验收样本范围】。

## 4. shared 层收敛（对应问题 d）

**裁决：扩展现有 `shared/domain/classroom.js:256-270` 的 `classroomLink(webBase, key, tenantCode, extra)`，不新增第二个构造器。**

- 理由：它已经是"课堂 URL 的唯一事实源"（小程序 `miniprogram/core/classroom.js` + `frontend/js/shared-domain-bridge.js:2133/2570` 都指向它）。再开一个 web 专用构造器会造成双写，且每次改 shared 都要走 **四步同步**（`sync-miniprogram-shared → check-shared-sync → gen-shared-bridge → frontend/build.js`），bridge 是全量再生成，diff 噪音大、回归成本高。
- 动作：`classroomLink` 增加第 5 个可选 options 参数 `{ target: 'classroom'|'prep'|'entry', mode }`，前 4 个参数位置与语义**完全不变**（向后兼容，小程序无需同步改造）。约定 `extra` 中 `role` 被显式丢弃。
- 前端 `classroom-link.js` 优先委托 `window.SharedDomain.classroomLink`，bridge 缺失时用内置兜底（保证 frontend 单跑可用）。**双实现必须防漂移**：在 `frontend/build.js` 加一条断言，对同一输入比较两实现输出字符串是否相等，不等则构建失败。
- 对小程序的影响：分享链接格式不变（仍 `webBase + /classroom.html?scheduleId=&tCode=`），已发出去的旧分享继续有效；新增能力（prep/entry 目标）小程序可渐进采用，不阻塞。
- 代价估计：shared 改动 + 一次四步同步 + bridge 全量 diff 复核，约 0.5 人日【待确认：负责人档期】。

## 5. 风险登记（对应问题 e）

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| 1 | `pageUrl` 自动附 `tCode`，与登录态冲突 | 深链点开被 entry-guard `TENANT_MISMATCH` 踢回登录页 | §2 优先级 1~5 + `reason=tenant_mismatch` 显式提示 |
| 2 | `safeJumpUrl` 拦自定义 scheme | 消息中心"进入课堂"按钮失效 | payload 只放 https；scheme 仅前端点击时转换（C5） |
| 3 | **WebView 与系统浏览器 localStorage 不共享**（Android WebView ≠ Chrome，iOS WKWebView ≠ Safari） | "浏览器唤起 App"后大概率要重新登录，体验断崖；这是最容易被忽略的坑 | App 内独立登录态 + URL 带 `tCode` 做租户预选 + 登录页 `back=` 回跳原深链；文案上不承诺"免登" |
| 4 | 两套登录态并存 | token 过期策略不同步、投诉"点进去让你登录" | 同上；课堂页首屏必须能友好承接未登录态（登录后回跳，不能丢 `scheduleId`） |
| 5 | Universal Link 平台限制 | iOS 同域页面内链接不唤起；开发 LAN IP 无法验证 AASA/assetlinks；Android 12+ `autoVerify` 失败退化为浏览器 | 站内场景改走 scheme 按钮；正式环境必须 HTTPS 域名 + 签名指纹绑定；开发环境**不验收**唤起，只验 URL 契约 |
| 6 | 微信内置浏览器屏蔽 scheme / Universal Link | 微信内只能开 web 课堂页 | 再次确认 www 必须部署为 web 站点；微信内入口不做 scheme 尝试 |
| 7 | `replay.html` **不在 sync 白名单** | local 模式 App 内回放 404（`my-classroom-core.js:190`、`classroom-main.js:774` 都会跳） | **裁决：replay 永久留 web**，local 模式用 `@capacitor/browser` 出壳打开绝对地址——唯一合法出壳例外 |
| 8 | `classroom-ops.html` 不在白名单 | App 内巡课走 `ops.html` 轻运营版，能力不等价 | **裁决：留 frontend 到 P2**，能力补齐后再重定向；`js/classroom/*` 因此不可整目录删 |
| 9 | 深链 host 变更 | 二维码/海报断裂，不可回收 | host 视为不可变资源，变更须重定向 ≥12 个月 |
| 10 | 恢复 role 参数 | 立刻重开越权口（FP-001 回退） | 构造器签名不含 role；entry-guard 继续按登录态校验 |
| 11 | 改 frontend 入口 JS 后 sync/patch 锚点漂移 | 构建失败或 App 内行为不一致 | 每次改完必跑 `npm run build` + 3 点位回归（C6） |
| 12 | local 模式 `frontendOrigin` 为空 → `shareUrl()` 无基址 | App 内复制/发通知得到坏链接 | 新增 `publicWebOrigin` 并在 `build.js` 构建期断言非空（C8） |
| 13 | server 模式下 Capacitor 桥是否注入未实测 | `isInApp()` 判断可能失真 | 已由 C7 结构性规避（URL 形态不依赖检测）；`isInApp()` 仅影响按钮显隐，失真只损失增强不损失功能【建议 App 工程实测确认】 |
| 14 | **新增前端公共 JS 未进 `sync.js` 白名单 / 未加 `<script>`** | 仅 local 模式（真机）炸，浏览器与 server 模式全正常 → 上线前发现不了 | **通过设计消灭**：构造器并入已在白名单的 `api.js`（C1 v1.3），不新增需要单独挂载的公共文件。后续如需再拆文件，必须同步改 `sync.js` 的 `PUBLIC_JS` + 4 个页面 script 顺序 + 回归 local 模式 |
| 15 | **`check-global-collide.mjs` 存在结构性漏报：它用"缩进 0"当作顶层判据，而 `api.js` 从 :749 起全部顶层声明都带缩进** | 守卫**通过 ≠ 安全**。若新增段漏写 IIFE 且按文件风格缩进，守卫会静默放行，真实碰撞仍会在解析期炸掉整个 `api.js`（全站 40+ 文件一起失效） | ① C12 强制自带 IIFE；② **不依赖守卫**：改完 `api.js` 后加一条运行期探针断言（对比改动前后 `Object.getOwnPropertyNames(window)` 增量只应包含 `ClassroomLink`）；③ 守卫改进（缩进判据改为括号深度判据）**另开任务**，不在本次 P0 范围 |
| 16 | **既有"同名顶层函数静默覆盖"实例（守卫漏报的实证，非本次引入）** | `login.html`(:545/:550) 与 `promo.html`(:150/:154) 都先加载 `api.js` 再加载 `promo.js`，两文件各有一个顶层 `function goBack()`（`api.js:749` 跳 referrer/`admin.html`；`promo.js:622` 走 `redirectByRole(currentUser())`）→ 后加载的 `promo.js` **静默覆盖** `api.js` 版本 | 属存量缺陷，**本次不改**（改它要动两个页面的兼容行为，超出迁移边界）。登记为技术债：优先级 P2，与守卫升级同批处理。对本方案的直接影响：它证明了"顶层声明带缩进"在 `api.js` 里是常态，C12 的 IIFE 要求不可当形式主义跳过 |

## 6. 边界外（本任务不做，交实现清单任务）

- 具体文件级 diff、函数实现、单测用例 → 任务 #2。
- `assetlinks.json` / AASA 生成、AndroidManifest / Xcode 配置、`appUrlOpen` 监听 → 归 App 工程任务。
- 数据建模、接口字段定义 → 交数据建模与后端。

## 7. 待确认

1. 是否已有正式 HTTPS 域名与 Android 签名指纹（决定 Universal Link / App Links 能否在本次上线）。
2. 历史深链的有效期承诺（12 个月是否够）。
3. `publicWebOrigin` 的正式取值（是否就是 `FRONTEND_ORIGIN`，有无 CDN/多域名情形）。
4. P1 收敛期的时间点与由谁执行 www 同域部署（是否与 frontend 发布流水线合并）。
5. 运营台"教师链接/学生链接"合并后的文案措辞（产品确认）。
6. server 模式下 Capacitor 桥是否注入（App 工程实测，不阻塞本方案）。

## 8. 变更记录

- **v1.4（IIFE 与守卫漏报收口，前端可进入实现）**：新增 C12（并入 `api.js` 的新增段必须自带 IIFE，并附**括号深度实测**的 35 条顶层声明清单；同时禁止整体 IIFE 化 `api.js`，因其全局函数被 40+ 文件直接调用）；新增 C13（双函数契约 `shareUrl()`→string / `shareUrlSafe()`→`{url,insecure}`，共用 `buildShare(spec)`，并给出调用点纪律）；C10 补齐"候选有效性 4 项判定与 `insecure` 三条件**解耦**"，明确 fail-closed 方向；风险登记新增 15（`check-global-collide.mjs` 以"缩进 0"为顶层判据，对 `api.js:749+` 结构性漏报，须靠运行期探针兜底）与 16（`api.js:749` 与 `promo.js:622` 同名顶层 `goBack`，在 `login.html`/`promo.html` 静默覆盖——存量技术债，P2 处理）。**P0 改动面最终确认：8 个业务 JS（`api.js` + 7 个调用点，`ops.js` 同文件计一次）+ 1 个守卫脚本、0 HTML 改动**，禁区不变。
- v1.3（可落地性收口）：构造器位置从"独立文件 `classroom-link.js`"改为"并入 `js/public/api.js`"——独立文件不同时引入 sync 白名单缺失（local 模式 undefined）与 4 个 HTML 加载顺序两类事故；因此 `classroom-ops.html` 的 script 改动撤销，P0 达到**零 HTML 改动**。核实并更正落库点位：课堂侧仅 `ops.js:701`，`:731` 为回显、非生成，课堂无二维码生成。采纳 `window.PUBLIC_WEB_ORIGIN` 作为注入变量名。
- v1.2（口径澄清）：明确 P0「课堂页一字不改」= 不改**能力与结构**，入口链接构造与分发展示属改造对象；给出 P0 精确改动面（6 JS + `classroom-ops.html` 一行 script）与"不改清单"；新增 C10（insecure 深链禁止落库，三个判据取或）、C11（无基址禁止静默降级为相对路径）；追认 dev 环境 http 私网放行，但收紧为"允许存在、禁止落库"。
- v1.1（前端侧 6 条核实反馈后）：新增 C7/C8/C9（不出壳靠结构、单一 `publicWebOrigin`、`safeJumpUrl` 已放行 https 故消息中心零改动）；裁定 `replay.html` 永久留 web 且为唯一合法出壳例外；裁定 `classroom-ops.html` 留 frontend 到 P2 且 `js/classroom/*` 不可整目录删；明确 `ops.js:511-512` 的 `role:'teacher'` 必须删除并合并复制按钮。
