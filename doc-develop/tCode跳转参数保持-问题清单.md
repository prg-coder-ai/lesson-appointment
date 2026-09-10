# tCode 跳转保持 —— 问题清单

> 排查日期：2026-09-10
> 环境：本地前端源码直出 `:8080`（`BOOKING_PORT=80 MSG_PORT=80 node doc-develop/dev-frontend-remote.js`）→ 远程 Nginx 统一入口 → 远程 booking/message-service
> 方法：`node doc-develop/itest_tcode_propagation.js`（Node `vm` 加载**真实源码** + 模拟浏览器，真实执行跳转函数后断言 `location.href`）
> 判定口径：URL 携带 `?tCode=xxx` 时，任何跳转产生的目标 URL 必须继续携带同一个 `tCode`（`platform_admin` 例外，恒为 `tCode=platform`）

---

## 1. 执行结果

```
PASS: 18   FAIL: 9
```

A（入口守卫 5 项）、B4、D5、D6、E（6 个受保护页）全部通过；9 项失败 = 9 处丢失点（下表 1-9）。

---

## 2. 丢失点明细

### 2.1 实证失败（脚本已覆盖，修复后可直接回归）

| # | 位置 | 现状代码 | 丢失表现 | 影响 | 级别 |
|---|---|---|---|---|---|
| 1 | `js/public/api.js:209` `212` | `'./teacher.html?tCode=' + user.tenantCode` | 登录态里没有 `tenantCode` 时产出 `./teacher.html?tCode=undefined` | 目标页守卫发现 `tCode=undefined ≠ 本地 tenantCode` → 踢回登录页，**登录后进不去自己的主页** | **P0** |
| 2 | `js/public/api.js:217` `225` | `'./index.html?tCode=default'` | 写死 `default`，把 URL 里的真实租户编码丢掉 | 租户专属链接登录后变成 default 租户入口，需用户手动重填租户编码 | **P0** |
| 3 | `js/public/api.js:584` | `goBack()` → `FRONTEND_ORIGIN + '/admin.html'` | 返回管理首页时不带 `tCode` | 返回即被守卫踢回登录页 | **P0** |
| 4 | `js/public/auth.js:60` | `handleLogout()` → `'./index.html'` | 登出回登录页丢 `tCode` | 登出后登录页不锁定租户，用户要重新选/填 | P1 |
| 5 | `js/public/api.js:156` | `getToken()` 无登录态 → `'/login'` | 页面不存在（404/SPA 兜底）+ 丢 `tCode` | 双重错误：既跳错页面又丢参数 | P1 |
| 6 | `booking.html:66` | `'./student.html' + qs`（`qs` 只拼 `scdid/tid/sid`） | 预约链接路由后丢 `tCode` | 从预约深链进来的学生被踢回登录页 | **P0** |
| 7 | `booking.html:59` | `'./student.html'`（sid 与本人不一致的兜底分支） | 同上 | 同上 | **P0** |
| 8 | `booking.html:75` | `'./teacher.html'` | 无 `tCode` | 同上 | **P0** |
| 9 | `booking.html:73`（以及 `:70`） | `'./admin.html?scdid=..&sid=..'` | 无 `tCode` | 同上 | **P0** |

> 触发路径示例（#1）：`platform_admin.html:205` 调 `redirectToUserPage(user)`，而 `user` 来自 `autoLoginCheck()` → `localStorage.currentUser`；
> 若该会话是经 `auth.js` 的 `saveCurrentUserSession()` 写入的（**该函数构造 currentUser 时不保存 `tenantCode`**，`auth.js:81-88`），`user.tenantCode` 恒为 `undefined`。

### 2.2 静态盘点（脚本未覆盖，同一类问题）

| 位置 | 现状 | 级别 |
|---|---|---|
| `js/public/utility_request.js:460` `482` | 401 兜底 → `'./index.html'` 丢 `tCode`（但有 `saveLoginRedirect` 保存含 query 的相对 URL，登录后能跳回，**最终不丢但中途登录页不锁定租户**） | P2 |
| `js/messages-inbox.js:53` `80` | 同上 | P2 |
| `admin.html:339` | 退登/守卫失败 → `'./index.html'` | P1 |
| `admin.html:248` | `case "audit_log": './auditLog.html'` | P1 |
| `auditLog.html:200` / `logBrowser.html:149` | 返回 `./admin.html` 不带 `tCode` | P1 |
| `auditLog.html:196` / `logBrowser.html:145` | `from` 回跳：仅当调用方传入的 `from` 自带 `tCode` 才保住 | P2 |
| `platform_admin.html:150` `153` | `./logBrowser.html?from=platform_admin.html`（丢 `tCode`） | P1 |
| `platform_admin.html:198` `207` | 无登录态/角色不符 → `'./index.html'`（丢） | P1 |
| `student.html:144` / `teacher.html:125` | 同上（丢） | P1 |
| `js/public/api.js:283` `291` `296` | `autoLoginCheck1()` 各失败分支写死 `'index.html?tCode=default'` | P2（函数体内含未闭合的 try 结构，疑为遗留死码，建议整段清理） |
| `js/public/api.js:324` `367` | token 过期 → `'./index.html'`（丢） | P2 |
| `js/admin-user.js:441` | `'./teacherInfo.html?userId=..'`——`teacherInfo.html` 在项目里**不存在**，疑似死链，与本主题无关但建议一并处理 | P3 |

### 2.3 已正确保持（不要改坏）

- `js/public/api.js:92`（`InitUserInfo` 未登录回跳，带 `tCode`）
- `js/public/api.js:622-630`（`forceEntryLogin`）
- `js/public/api.js:203` `206`（platform_admin / admin 分支）
- `index.html:511`（注册成功后 → `index.html?tCode=<注册租户>`）
- `index.html:654-752`（`getTenantCodeFromUrl` / `applyTenantCodeRule` / `applyTcodeToLogin` 读取并把 `tCode` 锁进表单）

---

## 3. 统一修复方案（建议，待确认后实施）

在 `js/public/api.js` 加一个公共 helper，所有跳转改走它，避免逐处拼接：

```js
/** 求当前应保持的租户编码：URL tCode > 本地登录 tenantCode > 角色默认值 */
function resolveTenantCode(user) {
  const url = getUrlParam('tCode');
  if (url) return url;
  if (user && user.tenantCode) return user.tenantCode;
  if (user && user.role === 'platform_admin') return 'platform';
  const u = getCurrentUserInfo();
  return (u && u.tenantCode) || 'default';
}

/** 拼页面 URL：自动附加以 tCode 为首的查询参数 */
function pageUrl(file, extraParams) {
  const p = new URLSearchParams();
  p.set('tCode', resolveTenantCode());
  Object.assign({}, extraParams) ...
  return './' + file + '?' + p.toString();
}
```

配套动作：

1. `auth.js: saveCurrentUserSession` 补存 `tenantCode`（从登录入参或 `currentUser` 取）。
2. `redirectToUserPage` 四个分支改用 `pageUrl()`，`platform_admin` 分支强制 `tCode=platform`。
3. `goBack` / `handleLogout` / `getToken` 改用 `pageUrl()`；`getToken` 的 `/login` 改成 `index.html`。
4. `booking.html` 四个分支（59/66/73/75）改用 `pageUrl()` 并保留原有 `scdid/tid/sid`。
5. `platform_admin.html` / `admin.html` / `auditLog.html` / `logBrowser.html` / `student.html` / `teacher.html` 内联跳转同步替换。
6. `api.js` 里 `autoLoginCheck1` 死码段建议删除（内部有未闭合 `try`，且实际不被调用）。

验收：`node doc-develop/itest_tcode_propagation.js` 需达到 **PASS 27 / FAIL 0**（当前 18/9）。
