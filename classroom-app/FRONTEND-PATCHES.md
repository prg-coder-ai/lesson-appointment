# 前端改动记录（不动原前端程序）

> 配套方案：`doc-develop/08-电子课堂/课堂独立一码多端解决方案-20261124.md`
> 机器可读事实源：`config/frontend-patches.js`
> 补丁应用器：`scripts/patch.js`

## 纪律

**原 `frontend/` 目录一个字节都不改。** 所有需要的改动分两类处理：

| 类别 | mode | 处理方式 | 谁执行 |
|---|---|---|---|
| 构建期自动补丁 | `rewrite` / `inject` | 只打到 `classroom-app/www/` 的副本 | `scripts/patch.js`（`npm run build` 自动调用） |
| 仅记录待上游 | `record-only` | 只在此登记，不改任何文件 | 上游开发者人工修改 |

补丁锚点漂移（上游改了代码导致匹配不到）会**立即报错终止构建**，不会静默失效。

## 改动清单

### FP-001 · 课堂 role 只认登录态 `P0` `active`

- **目标**：`js/classroom/classroom-main.js:87`（www 副本）
- **原文**：`role: this._getParam('role') || user.role,`
- **改为**：`role: user.role,`
- **原因**：原逻辑允许 `?role=admin` 覆盖登录态，攻击者可冒充管理员。后端 `accessGuard` 兜底但前端不应给出越权 UI。
- **验证**：补丁后 classroom-main.js 不再出现 `this._getParam('role') || user.role`。

### FP-002 · 课堂页注入入口守卫 `P0` `active`

- **目标**：`classroom.html` 的 `</head>` 前（www 副本）
- **注入**：`<script src="app-entry-guard.js"></script>`
- **原因**：原课堂页只有 `guardClassroom()` 查租户开关，缺 token / 角色 / tCode 一致性校验。守卫脚本是新工程文件，此处只加一行引用。
- **验证**：www/classroom.html 含 `app-entry-guard.js` 引用。

### FP-007a/b · 课堂/课前页注入 App 权限引导 `P1` `active`

- **目标**：`classroom.html`、`classroom-prep.html` 的 `</head>` 前（www 副本）
- **注入**：`<script src="app-permissions.js"></script>`
- **原因**：原 `media-devices.js` 权限提示是浏览器文案（"点地址栏锁图标"），在 App WebView 里不适用。注入的引导脚本包装 `getUserMedia` 捕获 `NotAllowedError` 弹系统设置提示，并在 iOS WebView 下给屏幕共享按钮打降级标记。
- **验证**：补丁后两个页面均含 `app-permissions.js` 引用；app.css 含 `.app-no-display-capture` 降级样式。

### FP-003 · 课堂端点登记进 apiPaths.js `P1` `deferred`

- **目标**：`shared/apiPaths.js`（**仅记录，不改**）
- **原因**：`/classrooms/{sid}/start`、`/enter`、`monitorClassrooms`、`remoteEndClass` 目前是 `api.js:1123/1136` 的字面量，端点守卫扫不到。涉及 shared 跨端共享（小程序镜像 + bridge 白名单），需走四步同步。
- **动作**：上游修改后执行 `sync-miniprogram-shared → check-shared-sync → gen-shared-bridge → frontend/build.js`。

### FP-004 · 课堂双基址覆盖 `P0` `deferred`（新工程桥接层承担）

- **目标**：新工程 `src/core/app-bridge.js`（**不改原前端**）
- **原因**：现有 `app-bridge.js` 只 patch 了 `ApiPaths.normalizeUrl`，未覆盖 `getClassroomApiBaseUrl` / `getClassroomWsBaseUrl`。local 模式下回环归一返回空串会打错地址。
- **动作**：在 classroom-app 桥接层覆盖这两个函数，见方案 §7.3。

### FP-005 · 引入能力表收口角色 UI `P1` `deferred`

- **目标**：`classroom-controls.js` 等（**仅记录，不改**）
- **原因**：教师/学生模块在每个课堂页都 init，仅靠 CSS 隐藏，误触面大且包体浪费。涉及课堂本体结构，风险高，不在首期自动 patch。

### FP-006 · admin 管理动作前端 role 校验加固 `P1` `deferred`

- **目标**：`classroom-admin.js`（**仅记录，不改**）
- **原因**：`forceEnd` 的 `ctx.role !== 'admin'` 是纯前端判断可绕过。独立 App 保留后端 `accessGuard` 作为最终边界即可。

### FP-008 · 轻运营端点已登记（无需新增 patch） `P2` `resolved`

- **目标**：无（端点已存在于 `shared/apiPaths.js`，无需改原前端）
- **背景**：P2 轻运营三件套（巡课/强结/发通知）所需端点均已在 `shared/apiPaths.js` 登记：
  `CLASSROOM_ADMIN_CLASSROOMS:366`、`CLASSROOM_ADMIN_END:374`、`MSG_SEND:166`、
  `CLASSROOM_STATUS:340`、`CLASSROOM_MEMBERS:343`、`USER_BRIEFS:120`。
- **动作**：新工程 `src/core/ops-lite.js` 直接引用 `window.ApiPaths.ENDPOINTS` 常量，
  不新增字面量端点。仅 `api.js:1233-1238` 的 `monitorClassrooms` / `remoteEndClass`
  字面量仍未单独登记（与 FP-003 同类，同路径登记名已存在，功能不受影响）。
- **边界**：只做三件套，未纳入 `ops.js` 的报表/对账/审核/契约联调五个重后台 tab。

### FP-009 · 租户管理员登录后走教师工作台 `P0` `active`（2026-11-26）

- **目标**：`js/public/api.js` 的 `redirectToUserPage()`（www 副本）
- **原文**：`window.location.href = pageUrl('admin.html', null, true, user);`
- **改为**：`window.location.href = pageUrl('teacher.html', null, false, user); // [FP-009] ...`
- **原因**：`www/` 只同步了 `teacher.html` / `student.html`，管理页属原 frontend 未进 App 产物，原值会让 `admin` 登录后落到 404。用户 22:57 拍板：**classroom-app 端没有 platform 登录，`admin` 走 teacher**。第三个参数 `true`（跨子域管理端绝对地址）在 App 无此场景，改 `false` 与其他角色分支统一走相对路径。
- **三个落点（FP-009 / FP-010a / FP-010b）**：`api.js` 里共有 3 处 `pageUrl('admin.html', ...)`，全部收敛到 `teacher.html`：

  | 补丁 | 位置 | 场景 |
  |---|---|---|
  | FP-009 | `redirectToUserPage()` 的 `case 'admin'` | 密码登录成功后跳主页 |
  | FP-010a | token 验证 `.then` 的 `role === 'admin'` 分支 | 刷新 / 会话恢复后跳主页 |
  | FP-010b | `goBack()` 的兜底分支 | 无 `from` 且无 referrer 时返回 |

- **边界**：`platform_admin` 分支**不动**（App 端无此登录）；`src/core/role-router.js` 的 `ROLE_TARGET.admin` 同步改为 `teacher.html`（App 自有文件，不走补丁）。
- **验证**：`node scripts/patch.js --check` 通过；`www/js/public/api.js` 不再出现 `pageUrl('admin.html'` 的跳转；`www/role-router.js` 的 `admin` 同为 `teacher.html`；原 `frontend/` 无改动。

## 审计

运行 `node classroom-app/scripts/patch.js --check` 可在不写文件的前提下校验所有 active 补丁锚点是否仍有效。构建日志会打印每条补丁的应用/跳过/失败状态。
