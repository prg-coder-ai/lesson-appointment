# 登录与 RefreshToken 机制分析报告

> 分析时间：2026-11-04 10:13
> 范围：后端 `authController` / `JwtUtil` / `JwtAuthenticationFilter` / `RefreshTokenService` / `UserService.login`；前端 `utility_request.js` / `auth.js`；小程序 `core/request.js`
> 目的：梳理完整链路，定位异常逻辑问题

## 一、正常链路梳理

### 1.1 登录链路

```
前端 login.html
  └─ collectDevice() → authenticateUser(account, pwd, extraInfo)
      └─ POST /api/v1/auth/login { account, password, tenantCode, role, deviceId, emuFlag, challengeId, moveX, ... }
          │
          ▼ 后端 authController.toLogin
          ├─ LoginGuardService.evaluate()        风控评分（只读）
          ├─ LoginChallengeService.verify()       滑块票据校验（带票必验）
          ├─ tenantService.getByCode()            租户校验
          ├─ UserService.login()                  密码校验 + 状态校验
          │   ├─ userMapper.getUserByAccount()
          │   ├─ passwordEncoder.matches()
          │   ├─ 状态校验：仅 active 放行
          │   ├─ jwtUtil.generateToken(tenantId, userId, role)          ← access token, HS512, type=access, 1h
          │   ├─ jwtUtil.generateRefreshToken(tenantId, userId)          ← refresh token, HS256, type=refresh, 7d
          │   └─ refreshTokenService.saveNewToken(userId, refreshToken, expireTime)
          │       └─ deleteByUserId(userId) + insert   ← 单设备登录：删旧存新
          ├─ loginGuardService.recordDeviceAfterLogin()  设备档案落痕（成功后才写）
          └─ userSessionService.onLogin()               在线会话记录
```

### 1.2 Access Token 校验链路（每次业务请求）

```
请求带 Authorization: Bearer <access token>
  │
  ▼ JwtAuthenticationFilter
  ├─ shouldNotFilter()：白名单路径跳过（含 /auth/refreshToken）
  ├─ verifyAccessToken(token)    只验签名 + 过期，不校验 type
  ├─ getUserIdFromToken(token)   读 subject
  ├─ getRoleFromToken(token)     读 role claim
  ├─ role == null → 不设 SecurityContext → denyAll → 401
  └─ 构造 Authentication → SecurityContext
```

### 1.3 Refresh Token 刷新链路

```
前端业务请求 401
  └─ utility_request.js 错误拦截器
      ├─ isRefreshing? → 排队等待
      └─ getNewToken()
          └─ POST /api/v1/auth/refreshToken { refreshToken, account, role }
              │
              ▼ 后端 authController.refreshToken
              ├─ jwtUtil.isTokenOfType(token, "refresh")   type 校验
              ├─ jwtUtil.getUserIdFromToken() + getTenantId()  从 token 解身份
              ├─ refreshTokenService.checkValidToken()        DB 校验存在 + 未过期
              ├─ userId 一致性二次校验（JWT vs DB）
              ├─ userMapper.getByUserIdNoTenant()             实时查 role（忽略前端传的）
              ├─ 状态校验：frozen → 拒绝
              ├─ generateToken() + generateRefreshToken()     新双 token
              ├─ removeOldToken(old) + saveNewToken(new)      轮换
              └─ 写 SecurityContext（无效，见问题 5）
```

## 二、发现的问题

### 问题 1（P0 安全）：`verifyAccessToken` 不校验 token 类型

**位置**：`JwtUtil.java:225-235`、`JwtAuthenticationFilter.java:162`

**现状**：
- `generateToken`（access）用 **HS512** 签名，claim 带 `type=access`、`role=<角色>`。
- `generateRefreshToken`（refresh）用 **HS256** 签名，claim 带 `type=refresh`，**不带 role**。
- `verifyAccessToken(token)` 只调 `parseClaimsJws(signingKey)`，**只验签名 + 过期，不校验 type claim**。
- jjwt 的 parser 根据 token header 的 `alg` 自动选验证算法，HS256 和 HS512 共用同一把 `signingKey`，故 **refresh token 能通过 `verifyAccessToken` 的签名验证**。

**当前"碰巧"防住的原因**：
- 过滤器随后调 `getRoleFromToken(token)` 读 `role` claim。
- refresh token 生成时**不带 role** → 返回 null。
- 过滤器 `if (role == null) return` → 不设 SecurityContext → 401。

**为什么仍然是 P0**：
1. 这道防线是"role claim 缺失"的**副作用**，不是"故意校验 type"。代码注释写的是"P1 加固：新增 type 区分 access/refresh"，但 `verifyAccessToken` 根本没读 type —— **加固只做了一半**。
2. 如果将来有人在 `generateRefreshToken` 里加了 role claim（比如为了某处方便），这道防线**瞬间失效**，refresh token 就能当 access token 用 7 天。
3. `authController.refreshToken` 里专门做了 `isTokenOfType(token, "refresh")` 校验防"access 冒充 refresh"，但反方向"refresh 冒充 access"没有对等防御 —— **不对称**。

**修复建议**：
```java
// JwtUtil.verifyAccessToken
public boolean verifyAccessToken(String token) {
    try {
        Jws<Claims> jws = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(stripBearerPrefix(token));
        Claims claims = jws.getBody();
        String type = (String) claims.get("type");
        // 新 token 必须是 access；老 token 无 type（兼容期放行）
        return type == null || "access".equals(type);
    } catch (Exception e) {
        return false;
    }
}
```

---

### 问题 2（P1 功能 bug）：前端刷新失败时"网络故障"误判

**位置**：`frontend/js/public/utility_request.js:475-476`

**现状**：
刷新失败后，前端用这段逻辑区分"凭证失效"和"网络故障"：

```javascript
const isNetworkError = !refreshErr ||
    (typeof refreshErr === 'object' && !refreshErr.response && !refreshErr.message?.includes('刷新'));
```

**问题路径**：
后端 `refreshToken` 接口在用户被冻结时返回 `Result.fail(401, "账号已被冻结，请联系管理员")`。
该响应走 Advice 映射，HTTP 状态 200 + body.code=401。
前端 `getNewToken()` 拿到的是 axios 响应，`refreshRes.data.code === 401 !== 200` → 走 `throw new Error('账号已被冻结，请联系管理员')`。
这个 Error 对象：
- `!refreshErr.response` → **true**（是 `new Error()`，没有 response 属性）
- `!refreshErr.message.includes('刷新')` → **true**（"账号已被冻结"不含"刷新"二字）
- → `isNetworkError = true` ❌

**后果**：
- 前端误判为"网络故障"，**不清登录态、不跳登录页**，只提示"网络异常，Token 刷新失败，请检查网络后重试"。
- 被冻结用户卡在当前页面，反复看到"网络异常"，永远进不了登录页。
- 同样的问题 message 还包括："账号已被删除，请重新注册"、"刷新凭证已失效，请重新登录"（这个含"刷新"，OK）、"刷新凭证无效"（含"刷新"，OK）。

**修复建议**：
`isNetworkError` 的判据应该基于**是否有 axios response**，而不是 `new Error` 的 message 文本匹配。`getNewToken` 失败有两种来源：
- axios reject（HTTP 4xx/5xx/超时/断网）→ refreshErr 有 `.response` 或 `.code`
- 手动 `throw new Error(message)`（body.code != 200）→ refreshErr 无 `.response`

后者是**凭证失效**，不是网络故障。判据应改为：

```javascript
// 只有 axios 原始错误且无 response 才是网络故障
const isNetworkError = refreshErr && typeof refreshErr === 'object'
    && !refreshErr.response
    && (refreshErr.code === 'ECONNABORTED' || refreshErr.code === 'ERR_NETWORK');
```

小程序 `core/request.js:127-134` 没有这个判断（直接 catch → clearSession → onAuthFail），**不受此 bug 影响**。

---

### 问题 3（P1 竞态）：refreshToken 轮换的跨设备互踢

**位置**：`RefreshTokenService.saveNewToken:22-31`、`authController.refreshToken:335-336`

**现状**：
```java
// authController.refreshToken
refreshTokenService.removeOldToken(oldRefreshToken);      // 删旧
refreshTokenService.saveNewToken(userId, newRefresh, ...); // 存新
    // saveNewToken 内部：deleteByUserId(userId) + insert
```

`saveNewToken` 的 `deleteByUserId` 会**删除该用户全部 refresh token**，不只是本次轮换的旧 token。

**问题场景**（用户同时开 PC + 手机）：
1. PC 和手机各自持有一份 refresh token（假设 PC=R1，手机=R2）。
2. PC 的 access token 过期，触发刷新：`removeOldToken(R1)` → `saveNewToken(userId, R3)` → `deleteByUserId` 删掉 R1 和 R2 → insert R3。
3. 手机的 R2 现在在 DB 里已经不存在了。
4. 手机下次 access token 过期，用 R2 刷新 → `checkValidToken(R2)` 返回 null → 401"刷新凭证已失效"。
5. 手机被踢回登录页，但用户**不知道 PC 刚刷新过**。

**根因**：
`saveNewToken` 的设计语义是"单设备登录"（登录时删全部旧 token），但 `refreshToken` 轮换路径**复用了这个方法**，导致每次刷新都变成"重新登录"的语义。

**修复建议**：
refreshToken 轮换应只删旧 token、只存新 token，不触发 `deleteByUserId`：
```java
// RefreshTokenService 新增
public void rotateToken(String oldRefreshToken, String userId, String newRefreshToken, LocalDateTime expireTime) {
    deleteSingleToken(oldRefreshToken);  // 只删本次的旧 token
    RefreshTokenPO po = new RefreshTokenPO();
    po.setUserId(userId);
    po.setRefreshToken(newRefreshToken);
    po.setExpireTime(expireTime);
    refreshTokenMapper.insert(po);
}
```
或者如果确实要"单设备登录"，应在前端明确告知用户"其他设备已被踢下线"，而不是静默删除。

---

### 问题 4（P2 设计）：refreshToken 接口写 SecurityContext 是无效操作

**位置**：`authController.refreshToken:338-344`

**现状**：
```java
UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(...);
SecurityContextHolder.getContext().setAuthentication(authentication);
```

**问题**：
- `/auth/refreshToken` 在 `JwtAuthenticationFilter.WHITELIST_PATHS` 和 `SecurityConfig.permitAll` 里。
- `JwtAuthenticationFilter.shouldNotFilter` 对该路径返回 true → **过滤器不跑**。
- `SecurityContext` 是 thread-local，请求结束即清空。
- 刷新接口返回后，客户端用新 access token 发业务请求，新请求是新线程，过滤器重新从 Bearer 解析。
- **这段代码对系统行为零影响**，只是让代码看起来"做了鉴权"。

**风险**：
不是功能 bug，但会误导维护者以为"refreshToken 接口也走了鉴权链路"，在排查"为什么 SecurityContext 有/没有"时浪费时间。

**修复建议**：
删除这段无效代码，或加注释说明"仅为本次请求链路其他组件用，不影响后续请求"。

---

### 问题 5（P2 多余传输）：前端仍向后端传 account/role（后端已忽略）

**位置**：
- `frontend/js/public/utility_request.js:114-118`
- `miniprogram/core/request.js:59`
- `api/src/main/java/com/reservation/dto/RefreshDTO.java`

**现状**：
前端 `getNewToken` 请求体：
```javascript
{ refreshToken: refreshToken, account: account, role: role }
```
后端 `authController.refreshToken` 注释明确写"**完全忽略前端传的 account/role**"，role 从 user 表实时查。`RefreshDTO` 仍保留 `account` 和 `role` 字段。

**问题**：
1. `account` 可能是手机号或邮箱（敏感信息），刷新请求里多余传输。
2. `role` 被忽略但仍传输，可能误导维护者以为后端在用。
3. `RefreshDTO` 保留这两个字段是设计残留。

**修复建议**：
- 前端不再传 `account` / `role`，只传 `refreshToken`。
- `RefreshDTO` 删除 `account` / `role` 字段（需确认无其他调用方依赖）。

---

### 问题 6（P2 会话清理）：logout 时 Authorization 头可能为 null

**位置**：`authController.logout:358-371`、`UserSessionService.onLogout:132-142`

**现状**：
```java
public Result<Boolean> logout(@RequestBody RefreshDTO refreshDTO,
                              @RequestHeader(value = "Authorization", required = false) String token) {
    SecurityContextHolder.clearContext();
    refreshTokenService.logout(refreshDTO.getRefreshToken());
    userSessionService.onLogout(token);  // token 可能为 null
    ...
}
```
前端 `auth.js:58-78` 的 `handleLogout`：先调 `logout(refreshToken)`，此时 localStorage 里 token 还在，但 `utility_request.js` 的请求拦截器会带上 `Authorization: Bearer <token>`。**所以实际上 token 不会是 null**——除非 token 已被清空（如被踢后用户手动点登出）。

**问题**：
如果 token 已被清空（localStorage 里没有 token），`Authorization` 头为 null，`onLogout(null)` → `sessionIdOf(null)` 返回空字符串 → 静默 return，**会话记录不会被标记为 logout**，仍然显示"在线"。

**后果**：
在线统计不准。管理员看到的"在线用户"列表里会有已经登出但记录未更新的幽灵会话。

**修复建议**：
`onLogout` 应能从 refresh token 派生 sessionId（refresh token 里也有 userId），或者在 logout 接口里从 refreshDTO 解 userId 后调 `userSessionService.kickUser(userId)`。

---

### 问题 7（P3 一致性）：kickUser 控制器内无显式权限检查

**位置**：`authController.kickUser:379-388`

**现状**：
```java
@DeleteMapping("/kick/{userId}")
@Audit(action = AuditAction.ADMIN_FORCE_LOGOUT, ...)
public Result<Object> kickUser(@PathVariable String userId) {
    int count = refreshTokenService.kickUser(userId);
    ...
}
```
`AuthzRules.java:216` 已声明该路径为 `PLATFORM_OR_TENANT_ADMIN`，依赖 SecurityConfig 路径规则拦截。

**问题**：
同文件的 `resetPassword:548-562` 显式调了 `permissionCheck.checkAdmin(token)`，`kickUser` 没有。两处都是管理动作，防御深度不一致。如果 AuthzRules 配置被误改（如改为 `ALL_ROLES`），`kickUser` 没有第二道防线。

**修复建议**：
在 `kickUser` 方法首行加 `permissionCheck.checkAdmin(...)`，或确认 AuthzRules 是唯一权威源后统一去掉 `resetPassword` 的显式 check。

---

## 三、问题汇总表

| # | 严重度 | 位置 | 问题 | 后果 | 当前是否阻断 |
|---|--------|------|------|------|-------------|
| 1 | P0 | JwtUtil.verifyAccessToken | 不校验 type=access | refresh token 靠"role 缺失"碰巧防住，加固只做了一半 | 否（碰巧防住） |
| 2 | P1 | utility_request.js:475 | isNetworkError 误判冻结/删除用户的 401 为网络故障 | 用户卡在"网络异常"提示，无法跳登录页 | 是（冻结用户） |
| 3 | P1 | RefreshTokenService.saveNewToken | 轮换时 deleteByUserId 删全部 | 跨设备并发刷新互踢 | 否（单设备正常） |
| 4 | P2 | authController.refreshToken:338 | 写 SecurityContext 无效 | 误导维护者 | 否 |
| 5 | P2 | 前端 getNewToken + RefreshDTO | 多余传 account/role | 敏感信息多余传输 + 设计残留 | 否 |
| 6 | P2 | authController.logout + onLogout | token 为 null 时会话不清理 | 在线统计幽灵会话 | 否 |
| 7 | P3 | authController.kickUser | 无显式权限检查 | 防御深度不一致 | 否 |

## 四、验证建议

如果要修复，按以下顺序验证：

1. **问题 1**：构造一个 refresh token，直接带 `Authorization: Bearer <refresh token>` 访问 `/api/v1/user/self`，确认当前返回 401（靠 role=null 防住）；修复后应返回 401（靠 type!=access 防住）。
2. **问题 2**：把一个账号冻结，然后让其 access token 过期，观察前端刷新行为 —— 当前会提示"网络异常"，修复后应清登录态跳登录页。
3. **问题 3**：两个标签页同时打开同一账号，等 access token 过期后同时刷新，观察其中一个是否被踢。
4. **问题 6**：清空 localStorage 后点登出，查 `user_session` 表该用户 status 是否还是 online。
