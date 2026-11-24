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

## 审计

运行 `node classroom-app/scripts/patch.js --check` 可在不写文件的前提下校验所有 active 补丁锚点是否仍有效。构建日志会打印每条补丁的应用/跳过/失败状态。
