# tenantId 与 tenantCode · 用法与区别分析

| 项目 | 内容 |
|---|---|
| 分析范围 | `api` 后端 Java（54 文件）+ 前端静态资源 |
| 代码规模 | tenantId 相关 243 处 / 54 文件；tenantCode 相关 12 处 / 7 文件 |
| 分析日期 | 2026-09-01 |

---

## 一、结论速览

| 维度 | `tenantId` | `tenantCode` |
|---|---|---|
| 类型 | `BIGINT`（自增主键） | `VARCHAR(56)` |
| 来源 | 系统生成（`sys_tenant.id`） | 人工定义（`sys_tenant.tenant_code`） |
| 性质 | **内部标识**，永不改变 | **外部业务编码**，可被管理员修改 |
| 是否唯一 | 主键唯一 | 唯一键 `uk_tenant_code` |
| 使用者 | 数据库、JWT、租户插件、上下文、权限校验 | 人（登录输入、注册填写、URL 参数） |
| 前端可见 | **完全不可见**（前端 0 处引用） | **唯一入口**（前端 12 处引用） |
| 落业务表 | ✅ 14 张业务表的 `tenant_id` 列 | ❌ 业务表无此列 |
| 出现频次 | 243 处 | 12 处 |

**一句话概括**：`tenantCode` 只在"入口解析"和"页面展示"两个环节出现，一旦解析出 `tenantId`，后续所有环节（存储、鉴权、隔离、统计、额度）全部只用 `tenantId`。

---

## 二、流转链路

### 链路 1：登录（tenantCode → tenantId → JWT）

```
用户输入 tenantCode + 账号 + 密码
   ↓
authController.toLogin
   ├─ 特殊分支：tenantCode == "platform" 且 role == "platform_admin"
   │     → tenantId = 0（平台，不属于任何租户）
   └─ 否则：TenantService.getByCode(tenantCode)
         → 校验 deleted / status == 1（否则 403）
         → tenantId = tenant.getId()
   ↓
UserService.login(account, password, tenantId)
   → selectByAccount（@InterceptorIgnore，不过滤租户）
   → 校验 user.tenantId == tenantId（不符返回"账号不存在"）
   → 存量数据（tenant_id=0）首次登录自动 bindTenant
   ↓
JWT claim: { tenantId, userId, role }
   ↓
此后请求不再携带 tenantCode
```

### 链路 2：业务请求（JWT → TenantContext → 插件/业务）

```
请求携带 Authorization: Bearer <token>
   ↓
TenantInterceptor.preHandle
   → jwtUtil.getTenantId(token)
   → tenantId == 0 跳过租户校验；否则查 sys_tenant 校验 deleted / status
   → TenantContext.setTenantId(tenantId)   // ThreadLocal
   → MDC.put("tenantId")                    // 日志埋点
   → userSessionService.touch(token)        // 在线统计续期
   ↓
MyBatisPlusConfig 租户插件读取 TenantContext
   ├─ tenantId == 0   → ignoreTable = true，不拼条件（平台查全量）
   ├─ tenantId > 0    → 拼 AND tenant_id = {tenantId}
   └─ tenantId == null → 拼 tenant_id = -1 兜底（无上下文时防越权）
   ↓
业务 Service：额度校验、用量统计、数据隔离
   ↓
afterCompletion → TenantContext.clear()
```

### 链路 3：注册（tenantCode → tenantId → 归属）

```
tenantCode 三个来源（优先级从高到低）
   ① 选择「平台管理员」→ 自动填 "default" 并锁定
   ② URL ?tcode=xx    → 采用该值并锁定（租户专属注册链接）
   ③ 用户手动输入
   ↓
User.tenantCode（@TableField(exist = false)，非数据库字段）
   ↓
UserService.resolveTenantByCode(tenantCode)
   → TenantService.getByCode → 校验 deleted / status == 1
   → 无效则返回 403 "租户编码无效或已停用"
   ↓
TenantContext.setTenantId(tenantId)   // 必须！否则插件按兜底值过滤
   ↓
账号查重（租户内唯一）→ 额度校验 → 入库 user.tenant_id = tenantId
   ↓
finally: TenantContext.clear()
```

---

## 三、关键区别与设计要点

### 3.1 `tenantCode` 只做"翻译"，不参与业务

14 张业务表只有 `tenant_id` 列，**没有** `tenant_code` 列——这是正确的设计。否则：

- 租户改一次编码就要刷全库
- 每个查询都要 JOIN `sys_tenant` 才能过滤

`User` 实体上的 `tenantCode` 标注了 `@TableField(exist = false)`，纯粹是注册入参。

### 3.2 `"platform"` 不是租户编码，是个魔法值

这是最容易混淆的地方：

| 输入 | 解析结果 | 是否对应 sys_tenant 记录 |
|---|---|---|
| `tenantCode = "platform"` + `role = platform_admin` | `tenantId = 0` | ❌ 无（0 表示"不属于任何租户"） |
| `tenantCode = "DEFAULT"` | `tenantId = 1` | ✅ 有（默认租户） |

两者都是字符串，但语义层次不同：`0` 代表平台视角，`1` 代表一个真实租户。

### 3.3 `tenantId = 0` 的三重语义（最易踩坑）

| 场景 | 含义 | 查询行为 |
|---|---|---|
| 平台管理员 | token 中 `tenantId = 0` | 插件跳过条件 → **查全量** ✅ |
| 存量历史数据 | 迁移前创建，业务表 `tenant_id` 默认 0 | 插件拼 `tenant_id = <当前租户>` → **查不到** ⚠️ |
| 无上下文兜底 | 定时任务 / 异步线程 | 插件拼 `tenant_id = -1` → **查 0 条** ⚠️ |

后两种都表现为"数据凭空消失"，且**不报错**。凡是脱离 HTTP 上下文的批量操作（定时任务、异步、MQ），都必须显式 `TenantContext.setTenantId()`。

### 3.4 前端完全不感知 tenantId

前端 0 处 `tenantId` 引用，12 处 `tenantCode` 引用。租户 ID 只存在于 JWT 内部，前端只负责在登录/注册时提交编码。这是合理的边界划分。

---

## 四、发现的问题

### ✅ P0（已修复 2026-09-01）：平台管理员角色值有两套写法

| 位置 | 值 | 正确性 |
|---|---|---|
| `RoleConst.PLATFORM_ADMIN` | `platform_admin` | ✅ 标准（下划线） |
| `PermissionCheck`（权限校验） | `platform_admin` | ✅ |
| `authController`（登录判断） | `platform_admin` | ✅ |
| `admin.html:185` | `platform_admin` | ✅ |
| **`index.html:176`（注册选项）** | **`platform-admin`** | ❌ 连字符 |
| **`index.html:610`（PLATFORM_ROLE）** | **`platform-admin`** | ❌ 连字符 |
| **`UserController:98`（注册判断）** | **`platform-admin`** | ❌ 连字符 |

**后果**：注册时选「平台管理员」，库里 `user.role = "platform-admin"`，而登录与权限校验都认 `platform_admin`：

1. 登录时 `authController` 的 `"platform_admin".equals(role)` 为 false → 走租户分支 → `getByCode("platform")` 查不到 → **403，无法登录**
2. 即便能登录，`PermissionCheck.isPlatformAdmin` 也为 false → **无任何平台权限**

**已修复**（2026-09-01）：三处统一为 `platform_admin`，后端改用 `RoleConst.PLATFORM_ADMIN` 常量。

| 位置 | 修改 |
|---|---|
| `index.html` 注册选项 | `value="platform-admin"` → `value="platform_admin"` |
| `index.html` `PLATFORM_ROLE` | `'platform-admin'` → `'platform_admin'` |
| `UserController` 注册判断 | 字面量 → `RoleConst.ADMIN` / `RoleConst.PLATFORM_ADMIN` |
| `authController` 登录判断 | 字面量 → `RoleConst.PLATFORM_ADMIN`，`"platform"` 抽为 `PLATFORM_TENANT_CODE` 常量 |

> ⚠️ **存量数据需另行修正**：若此前已通过注册页创建过平台管理员，库中 `role` 仍为连字符，
> 需执行一次：
> ```sql
> UPDATE `user` SET `role` = 'platform_admin' WHERE `role` = 'platform-admin';
> ```

### ⚠️ P1：`TenantService.getByCode` 不过滤状态

```java
public Tenant getByCode(String tenantCode) {
    LambdaQueryWrapper<Tenant> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(Tenant::getTenantCode, tenantCode);   // 未过滤 deleted / status
    return tenantMapper.selectOne(wrapper);
}
```

目前两个调用方（`authController`、`UserService.resolveTenantByCode`）都手动补了 `deleted`/`status` 校验，所以暂无问题。但方法本身不做过滤，后续有人直接调用就会漏掉。

**建议**：方法内加过滤，或明确命名为 `getActiveByCode`。

### ℹ️ P2：`tenantCode` 大小写依赖数据库排序规则

- 建表未指定 `COLLATE`，使用库默认（MySQL 8 为 `utf8mb4_0900_ai_ci`，**大小写不敏感**）
- 平台管理员注册时前端填 `default`，库中为 `DEFAULT` → 当前可以匹配
- 若数据库改用 `utf8mb4_bin` 等区分大小写的排序规则，注册会失败

**建议**：在 `resolveTenantByCode` 中统一转大写再查询，消除对排序规则的依赖。

### ℹ️ P2：修改租户编码会使已发出的邀请链接失效

`?tcode=xx` 形式的租户专属注册链接，在租户编码被修改后将解析失败。已登录用户不受影响（JWT 里是 `tenantId`）。若要做邀请链接功能，建议单独维护一个不可变的邀请码字段。

---

## 五、使用约定（建议团队遵守）

1. **业务代码一律用 `tenantId`**，不要用 `tenantCode` 做过滤或关联
2. **`tenantCode` 只在两处出现**：解析入口（登录/注册）与展示（DTO）
3. **脱离 HTTP 上下文的操作必须显式设置 `TenantContext`**，否则静默查 0 条
4. **"不知道租户"的查询加 `@InterceptorIgnore(tenantLine = "true")`**（如登录时按账号查用户），归属改由业务显式校验
5. **角色值统一引用 `RoleConst` 常量**，不要写字符串字面量
6. **`tenantId = 0` 需要区分是"平台管理员"还是"未归属数据"**，两者处理方式不同
