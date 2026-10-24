# 技术方案：保留字 `platform` 的租户语义（方案 A / B 取舍）

> 日期：2026-10-24
> 触发问题：`role=admin` + `tenantCode=platform` 的自助注册会解析到 `sys_tenant` 里那条 `tenant_code='platform'` 的记录，并因"该租户尚无 admin"命中首管理员 bootstrap 直接 `active`。现状只被"该租户没有 `sys_tenant_package` → 额度 403"**碰巧**挡住，属运气而非校验。
> 结论：**采纳方案 B** —— `platform` 只作登录标识词与展示锚点，不做真实经营租户；并在注册/登录两条链路上把保留字拦成显式校验。

---

## 一、先拆语义：三个同名的 `platform`

争议的根源不是"平台该不该有租户能力"，而是同一个字符串在三处承担了三种不同职责。方案 A 与方案 B 的分歧，本质是**要不要让第三样变成真正的数据主体**。

| 形态 | 载体 | 语义 | 谁能改 |
|---|---|---|---|
| 保留字 | `TenantCodeGenerator.RESERVED = {platform, default}` | 编码生成器永不产出，防止随机码撞上系统自用行 | 代码常量 |
| 登录标识词 | `authController.PLATFORM_TENANT_CODE` | 与 `role=platform_admin` 配对时把 `tenantId` **强制成 0** | 代码常量 |
| 真实租户行 | `sys_tenant` 中 `tenant_code='platform'` 的那一行 | 仅被 `UserService.fillOrgName` 用来给平台账号回显"所属公司" | 数据，可被界面编辑 |

方案 B = 让第三样**永远只是第二样的展示附属物**；方案 A = 把第三样升级成经营主体，于是它要参与套餐、统计、到期、级联等一切以 tenant 为维度的逻辑。

---

## 二、决定性事实：隔离只认 token，不认 URL

```java
// TenantInterceptor（租户上下文唯一入口）
Long tenantId = jwtUtil.getTenantId(token);
...
TenantContext.setTenantId(tenantId);
```

**URL 上的 `tCode` 对数据隔离零影响**，它只服务前端路由与入口守卫比对。由此可直接推出两条结论：

1. "tCode=platform 的 URL 都导入 `platform_admin.html`" 本质是**前端路由规则**，而这条规则**已经存在**：

   ```js
   // frontend/js/public/api.js:807
   function isRoleTenantCodeMatch(role, tenantCode) {
     if (role === 'platform_admin') return tenantCode === 'platform';
     // 租户端角色：tenantCode 必须非空且不能是 platform
     return !!tenantCode && tenantCode !== 'platform';
   }
   ```

   小程序 `core/auth.js:77` 是同一份逻辑；`platform_admin.html` 与 `admin.html` 分别用 `guardEntryPage('platform_admin')` / `guardEntryPage('admin')` 以角色为准。

2. 反过来，**方案 A 的第一件事必须是拆掉这条规则**（web + 小程序 + 两个页面守卫），否则 tenant 11 的 admin 一进 `admin.html` 就会被 `forceEntryLogin` 弹回登录页。

再看租户插件的取值语义（`MyBatisPlusConfig:103-111`）：

| token 里的 tenantId | 插件行为 | 结果 |
|---|---|---|
| `0` | `ignoreTable` 对**所有表**返回 true | 查全量（平台视角） |
| `> 0` | 拼 `tenant_id = ?` | 租户隔离 |

于是方案 A 有一个容易被忽略的隐含前提：**进 `admin.html` 的那个账号，`tenant_id` 必须是 platform 行的 id，不能是 0**。若拿现有 platform_admin 账号（`tenant_id=0`）去进 `admin.html`，`/user/page`、课程、排期全部失去隔离，看到的是所有租户的数据 —— 那是事故。

---

## 三、方案 A：`platform` 作为真实租户

### 做法

把 `sys_tenant` 中 `tenant_code='platform'` 的行升格为正常租户：给套餐、给行业，创建 `role=admin` + `tenant_id=<该行id>` 的账号，登录后进 `admin.html`，与普通租户完全同构地管理自己的教师/学生/课程/排期/消息。

### 优点（真实存在）

- **一套代码**：平台自我运营不需要在 `platform_admin.html` 里再实现一遍教师/学生/课程/排期/消息。
- **一个身份**：平台员工不需要"平台管理员 + 内部租户管理员"两个账号。
- **运维直觉**：平台自身也是一行租户，可以在租户列表里统一看。

### 代价：一份需要永久维护的例外清单

| 失效点 | 机制 |
|---|---|
| 平台控制台能力彻底丢失 | `AuthzRules` 有 47 条 `PLATFORM_ONLY`（租户/套餐/行业/配置/监控/统计）只有 `platform_admin` 能过；该租户的 `admin` 属 `TENANT_ADMIN_ONLY` / `PLATFORM_OR_TENANT_ADMIN`，拿不到。方案 A **不能取代** `platform_admin.html`，只能"再加一个控制台" |
| 平台行暴露在"停用租户"按钮下 | `TenantInterceptor` 会按 tenantId 查租户状态；该行一旦在租户列表被点"停用"，平台自身业务立刻全 403；`CascadeRules` 还会级联把该租户用户改成 `frozen` |
| 运营统计口径永久混淆 | `DashboardService.countTenant` 只按 `deleted=0` 计数，不排除 `platform` / `default`。让 platform 成为真租户后，"租户总数 / 新增租户 / 到期预警"都要再补排除条件，且**将来每加一个租户维度功能都要记得排除这一行** |
| 首管理员可被公开抢座 | `platform` 是全系统唯一**可猜到**的租户码（其余是 29^8 随机码）。方案 A 下任何人 `POST /user/register` 带 `role=admin` + `tenantCode=platform` 即命中首管理员 bootstrap → 直接 `active`；而该判定**只计数 role、不看 status**，抢到即永久占位，要清只能改库或平台管理员动手 |
| 登录归属是硬等于匹配 | `getUserByAccount` 的 SQL 为 `select * from user where account = ? AND tenant_id = ?`，且登录分支会把 `platform + platform_admin` 的 tenantId 钉成 0。方案 A 意味着"平台"要同时容纳两种 tenant_id（0 与真实行 id），登录分支必须按 role 分叉，"平台管理员"与"平台租户管理员"在界面上几乎无法向用户解释 |
| 功能前提要补 | 走通 `admin.html` 得先给该行开套餐（`sys_tenant_package`）与行业，否则 `TenantQuotaService.acquire` 抛"已达套餐上限"；行业为空时术语映射只能落到平台词 |

一句话：**方案 A 把"平台是不是租户"压进了一行数据，于是所有以 tenant 为维度的代码都多了一个特殊值要处理。**

---

## 四、方案 B：`platform` 只作登录标识词

### 做法

保留现有不变量 `role=platform_admin ⇔ tenantId=0 ⇔ tCode=platform`；`platform` 永远不能被注册成任何租户身份；平台自身若需要租户态功能（教师/学生/课程/排期），**注册一个普通随机码的"平台内部机构"租户**，走完全标准的 SaaS 流程。

### 优点

- **不变量单一**：两页各管一件事，`isRoleTenantCodeMatch` 无需改动，web 与小程序口径天然一致。
- **影响面是常量级**：`RESERVED` + `PLATFORM_TENANT_CODE` 两处常量，不随功能数量增长；方案 A 的例外清单则随功能增长而增长。
- **安全**：`platform` 不能成为可注册身份，"可猜到的租户码"这一攻击面直接关闭。
- **展示锚点保持**：平台行继续只被 `fillOrgName` 读取，租户运维界面上的"停用/套餐/到期"按钮碰不到它。
- **内部机构拿到真实能力**：走标准租户流程后，套餐、行业、统计、到期全部自动生效，不需要任何特殊判断。

### 代价

- `platform_admin.html` 不含教师/学生/课程/排期 —— 平台要用得另开内部租户。
- 平台员工可能是"双身份"：`platform_admin` 管平台，另一个普通租户 admin 管内部业务。这是职责分离，但确实多一套账号。

---

## 五、对比

| 维度 | 方案 A（platform 当租户） | 方案 B（platform 只作登录词） |
|---|---|---|
| 改动量 | 拆 web/小程序两处 `isRoleTenantCodeMatch` + 两页守卫 + 登录按 role 分叉 + 给平台行开户 | 一处后端拦截（对齐 `RESERVED`）+ 登录分支显式 403 |
| 隔离安全性 | 取决于账号 tenant_id 是否指向平台行，选错即全量泄露 | 天然安全，`0` 与 `>0` 语义不变 |
| 新增永久例外 | 统计、套餐、到期、租户列表、`CascadeRules`、推广防刷……逐处增加 | 0 |
| 首管理员抢座面 | 新增一个可猜入口 | 关闭 |
| 平台内部要业务功能 | 复用 platform 行 | 另开普通内部租户 |
| 平台控制台 | 仍需 `platform_admin.html`（两套并存） | 一套，职责清晰 |

**结论：选方案 B。**

---

## 六、方案 B 的三处收口

### 收口① 注册链路拦保留字（`UserService`）

`Register` 的自助注册分支与 `wechatRegister` 在解析租户编码之前，先用 `TenantCodeGenerator.isReserved(...)` 拦掉 `platform` / `default`，返回 403「该租户编码为系统保留，不能用于注册或登录」。

- 拦截点必须放在 `resolveTenantByCode` **之前**：否则会先去库里查一次那条平台行，"保留"就变成了"查得到但故意不用"，语义漂移。
- 不动 `applyRoleAdmission`：首管理员判定仍只看 role、不看 status（这是上轮刻意保留的语义，配套 `assertNoAdminSelfLock` 防自锁）。保留字拦在它前面，抢座路径自然关闭。
- `approvedByAdmin=true`（后台代建）不受影响：那条路径的 `regTenantId` 来自登录态里的租户上下文，不走编码解析。

### 收口② 登录分支显式 403（`authController`）

`tenantCode=platform` 但 `role != platform_admin` 时**直接返回 403**，不再静默去解析平台行。

- 现状若放行，会走到 `userService.login(account, password, platform 行 id)`：查得到用户就签发 token，然后前端 `guardEntryPage` 因 `isRoleTenantCodeMatch` 不通过把人弹回登录页 —— 形成"能拿到 token、但任何页面都进不去"的幽灵态，比直接报错难排查得多。
- 文案不复用"账号或密码不正确"：这里拒绝的是**租户编码本身**，与账号是否存在无关，不存在枚举风险。
- 403 而不是 400/1002：该错误不会在客户端触发刷新链（登录页没有 refresh 逻辑），与风控挑战的 `1002` 语义也不冲突。

### 收口③ 保留 `isRoleTenantCodeMatch`（web + 小程序）

**不改逻辑**，只在两处补注释说明"这是方案 B 的纵深防线，不是可删的冗余"，避免后人为了"让 platform 当租户方便"而拆掉它。两端口径必须继续一致。

---

## 七、验证清单

1. `mvn -o -f api/pom.xml -DskipTests compile` 通过。
2. 17 道构建期守卫全绿（`npm run check:*`），其中 `check-authz` 因未新增端点应无变化。
3. `POST /user/register`（`role=admin`、`tenantCode=platform`）→ 403，不再产出 `active` 账号。
4. `POST /auth/wechat-register`（`tenantCode=platform`）→ 403。
5. `POST /auth/login`（`tenantCode=platform`、`role=admin`）→ 403，且**不签发 token**。
6. `POST /auth/login`（`tenantCode=platform`、`role=platform_admin`）→ 行为不变，tenantId=0。
7. 普通租户登录/注册/微信登录全部不受影响。

> 本次改动均为 Java 侧；前端 `api.js` 与小程序 `core/auth.js` 只补注释（terser 会剥掉，产物逐字节不变）。**部署需重启后端。**

---

## 八、附：相邻决策（本次一并确认，不是待修缺陷）

**「平台管理员冻结某租户唯一 admin 后，该租户没有任何自助恢复入口」——该结果需要保持，不加"最后一个 admin 不可被冻结"的限制。**

理由：

1. **它是"自助注册不能抢座"的必然代价**。首管理员判定只计数 role、不看 status，所以被冻结的管理员仍然占着"已有管理员"这个事实。若改成"只数 active"，任何一个被禁用的管理员都会让"尚无管理员"重新成立 —— 任何拿到租户码的人都能自助注册把自己顶上去，"禁用"立刻退化成"可抢座"（比锁死严重得多）。
2. **恢复入口本来就存在，只是可控**：平台管理员在 `platform_admin.html` 的「用户管理」里把该账号改回 `active` 即可；租户内部则永远没有"绕过平台"的旁路。锁死只影响租户自身，不会影响平台方处置能力。
3. **自锁路径已被封**：`assertNoAdminSelfLock` 禁止管理员把自己改成非 active，租户管理员不会"自己把自己的门锁上"；能锁住一个租户的，只剩平台管理员这一种有意的、可追责的操作。

因此不要加"租户内最后一个 admin 不可被冻结"的判据：它会让平台管理员失去对失控租户的唯一强制手段，且要在冻结路径上再写一遍"这个租户还剩几个可用 admin"的跨行判定（并发下还要加锁），收益远小于代价。

