# N8：声明式授权与 denyAll 兜底——把"你能不能做这件事"从方法体里捞出来

> **系列导航**：本文是「SaaS 预约系统开发架构设计 1+N」系列第 N8 篇。
> 上一篇 [N7：敏感字段服务级加解密](#) 讲的是数据层的最后一道防线；本篇回到**接口准入层**，
> 讲一个曾经让 40+ 端点对任何登录用户敞开的问题，以及根治它的两层架构。
>
> 文中所有代码片段、行号、数据均来自本仓库真实源码，路径以 `api/` 为根。

---

## 一、问题背景：一个只回答"有没有登录"的系统

### 1.1 根因 A：授权模型缺失

修复前，`SecurityConfig` 的授权策略只有一行：

```java
// 修复前：任何已登录用户，可以调用任何接口
auth.anyRequest().authenticated();
```

它只回答了 **"你有没有登录"**，从来没有回答 **"你能不能做这件事"**。

那"能不能做"靠什么？靠每个 Controller 方法体里手写一行：

```java
permissionCheck.checkAdmin(token);
permissionCheck.checkPlatformAdmin(token);
permissionCheck.checkTeacherOrAdmin(token);
// ...
```

问题就出在这个"靠"字上。`AuthzRules` 的类注释记录了一次实测盘点：

> 全仓 120 处调用、分布不均，遗漏即放行（实测 7 个 Controller 共 **40+ 端点零检查**，含
> `/user/updateStatus`、`/data-maintain/purge/*`、`/logs/*`）。

注意"遗漏即放行"五个字——**手写检查的失败模式是静默的**。没人调用 `checkAdmin` 的接口，
对学生、对匿名边缘用户、对任何持有有效 token 的人，都是敞开的，而且不会报任何错。

### 1.2 三条真实越权链

被盘出来的 40+ 零检查端点里，有三条链特别典型，每一条都能独立构成一次安全事故：

**链路一：自注册 pending 管理员自己审批自己。**

`POST /api/v1/user/updateStatus` 方法体零检查。而第一批评测发现：pending 状态的用户**能登录**
（登录只拦 frozen/inactive）——于是自注册的 pending admin 登录后调一次自己的审批接口，
把自己改成 active。审批流程形同虚设。

**链路二：任何登录用户触发物理清理。**

`/data-maintain/purge/{template,course,schedule,booking,appointment}` 五个端点零检查。
这些是**物理删除**（不可逆），而调用它们只需要一个 student token。

**链路三：任何登录用户读服务器日志。**

`/logs/{tail,date,search}` 零检查，日志里含 SQL、文件路径、异常栈。对学生开放等于把
后端拓扑和调试信息一起送出去。

### 1.3 为什么不能只靠"把 checkXxx 补齐"

直觉的修法是把 120 处调用补齐到 182 个端点。但这个修法有三个结构性缺陷：

1. **不可审查**：权限散落在 30+ 个 Controller 文件里，没有任何一个地方能回答"这个系统里
   student 到底能干什么"。安全评审只能靠人肉 grep。
2. **不可机器校验**：新增端点忘了写检查，没有任何工具会红。
3. **与框架层脱节**：未认证请求（无 token）在过滤器层就被 401 挡了，但"已认证但角色不对"
   完全穿透过滤器层——两层逻辑各管一段，中间是空的。

所以本项目的修法不是"补检查"，而是**把角色规则从方法体上移成一份集中的、可审阅的、
可被工具校验的声明表**。这份表就是 `AuthzRules`。

---

## 二、原理：三个关键决策

### 2.1 决策一：声明式授权与方法体检查**并存**，不是替换

先划清边界。Spring Security 的路径级授权能表达的是：

> 「GET /api/v1/tenant/list 这个端点，需要 platform_admin 角色」。

它**不能**表达：

> 「GET /api/v1/dashboard/tenant/{tenantId}/usage 这个端点，平台管理员可以看任意租户，
> 租户管理员只能看 tenantId 等于自己所属的那个」。

因为后者的判定依赖**路径变量与令牌的动态比对**（要查库/解析 token），SpEL 在路径匹配层做不了。
`AuthzRules` 的类注释把这条边界写得非常直白：

> **不解决**：数据级/所有权级授权（"只能改自己的课次"）。那需要查库比对归属，
> SpEL 表达不了，仍由 `PermissionCheck` 承担。**两层并存，不是替换关系。**

于是系统里实际是两层：

| 层 | 机制 | 回答的问题 | 失败模式 |
| --- | --- | --- | --- |
| 路径层 | `AuthzRules` → `hasRole/hasAnyRole` | 你是什么角色，进不进得来 | 漏声明 → denyAll 403（**吵）** |
| 方法体层 | `PermissionCheck.checkXxx`（120 处） | 这个数据是不是你的 | 漏调用 → 静默放行（**闷）** |

两层都要有。路径层把"闷"的失败模式改成"吵"的，方法体层补路径层表达不了的部分。

### 2.2 决策二：`denyAll` 兜底，分两步切

声明表只有配合**默认拒绝**才有意义。如果兜底还是 `authenticated()`，漏声明的端点依然
静默放行——只是从"任何人"变成"任何登录的人"，根因 A 只是缩小了面，没有根治。

但一步直接切 `denyAll()` 在当时是自杀行为。`AuthzRules` 注释记录了原因：

> 171 个生效端点里，学生端与教师端共用的读接口（如 `/course/booking/page`、
> `/schedule/selectByCourseId/*`）真实存在，但角色归属**只能从前端调用链反推**；
> 一旦有一处推断错误，`denyAll` 会立刻把它变成线上 403 故障。

所以策略是两步：

| 批次 | 兜底 | 漏声明的后果 | 前置条件 |
| --- | --- | --- | --- |
| 第一批 | `authenticated()` | 静默放行（已登录即全通） | 已核实端点全部显式声明，规则表完整 |
| 第二批（2026-10-10） | `denyAll()` | **403，立刻炸** | 守卫实测 182 个端点全部声明、无陈旧规则 |

第二步落地时兜底切成了这样（`SecurityConfig.java:210-217`）：

```java
// ===== 声明式授权（第 2 批：根治根因 A）=====
applyDeclarativeAuthz(auth);

// 兜底：denyAll()（2026-10-10 切换，两步策略第二步落地）。
auth.anyRequest().denyAll();
```

**"漏声明 = 403"和"漏声明 = 静默放行"的区别，是安全哲学里"故障要吵"的具体体现**：
一个把遗漏变成 5 分钟内必现的线上告警，一个把遗漏变成一次沉默的数据泄露。

### 2.3 决策三：规则表必须是"数据"，不能是"代码风格"

`AuthzRules` 没有写成 `if (path.equals(...))` 链，而是 `List<Rule>`：

```java
public record Rule(HttpMethod method, String path, String[] roles, String note) {}

public static final String[] PLATFORM_ONLY = {RoleConst.PLATFORM_ADMIN};
public static final String[] PLATFORM_OR_TENANT_ADMIN = {RoleConst.PLATFORM_ADMIN, RoleConst.ADMIN};
public static final String[] TENANT_ADMIN_ONLY = {RoleConst.ADMIN};
public static final String[] TEACHER_OR_ADMIN = {RoleConst.TEACHER, RoleConst.ADMIN, RoleConst.PLATFORM_ADMIN};
public static final String[] ALL_ROLES = {RoleConst.STUDENT, RoleConst.TEACHER, RoleConst.ADMIN, RoleConst.PLATFORM_ADMIN};

public static final List<Rule> RULES = buildRules();
// ...
return List.copyOf(r);  // 不可变：防止任何人在运行期往规则表里塞后门
```

三个设计点：

1. **record 承载**：`(method, path, roles, note)` 四元组让每条规则自带"依据说明"。
2. **角色组合常量**：避免 180 条规则重复拼数组，语义也更清楚（`TEACHER_OR_ADMIN` 比
   `{"teacher","admin","platform_admin"}` 更可读）。
3. **note 字段的 `≡` 标注法**：每条规则的注释区分两种来源——
   - `≡checkXxx`：该端点方法体里已有对应 `PermissionCheck` 调用，本规则只是把既有隐式约束
     **上移显式化**，不放宽也不收紧；
   - `新增`：原本零检查，本批新增声明，依据是端点业务语义 + 前端真实调用角色。

这个标注是给后来人的线索：看到 `≡` 就知道"这里曾经发生过一次上移"，看到 `新增` 就知道
"这里曾经是一个洞"。

### 2.4 附带说清：ROLE_ 前缀与"首个命中即生效"

两个 Spring Security 的机制陷阱，`SecurityConfig` 的注释都点了名：

```java
/**
 * 角色到 Authority 的对应关系：JwtAuthenticationFilter 写入的是 "ROLE_" + role，
 * 因此这里用 hasRole/hasAnyRole，Spring 会自动补 ROLE_ 前缀。
 * 若这里改用 hasAuthority，必须写全前缀，否则全部不匹配。
 *
 * 顺序：AuthzRules.RULES 已按"具体路径在前、通配在后"排好，
 * Spring Security 采用首个命中即生效，故直接按列表顺序注册即可。
 */
```

- **`hasRole("admin")` 匹配 `ROLE_admin`**：过滤器层写 authority 时带 `ROLE_` 前缀，
  授权层用 `hasRole` 系列 Spring 自动补。两侧口径差一个 `ROLE_`，全部规则静默不匹配——
  这种故障测试环境一秒暴露，生产环境就是"全员 403"。
- **首个命中即生效**：`RULES` 列表的顺序就是优先级。具体路径在前、通配在后是硬约束。

---

## 三、源码实现

### 3.1 规则展开：fail fast 在配置层

`SecurityConfig.applyDeclarativeAuthz`（`SecurityConfig.java:263-282`）把声明表逐条展开：

```java
private void applyDeclarativeAuthz(
        AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry auth) {

    for (AuthzRules.Rule rule : AuthzRules.RULES) {
        if (rule.roles() == null || rule.roles().length == 0) {
            throw new IllegalStateException(
                    "授权规则缺少角色声明（会导致该路径无人可访问）：" + rule.method() + " " + rule.path());
        }
        if (rule.roles().length == 1) {
            auth.requestMatchers(rule.method(), rule.path()).hasRole(rule.roles()[0]);
        } else {
            auth.requestMatchers(rule.method(), rule.path()).hasAnyRole(rule.roles());
        }
    }
}
```

注意空角色的处理：**启动时直接抛 `IllegalStateException`**。空角色数组会让引用它的路径
"无人可访问"——功能全断但没有任何请求会告诉你原因。与其运行时猜，不如启动即炸。
这是 fail fast 思想在配置层的标准应用：**能在启动期暴露的，绝不拖到运行期**。

### 3.2 全角色放行 + 归属在方法体：三种固定模式

规则表里有 60+ 条 `ALL_ROLES`，初看像是"放弃了治疗"，其实每条都对应一种
"路径层无法表达归属"的固定模式。`AuthzRules` 注释把三种模式写得很清楚：

**模式一：按 id 逐个比对的（`checkTenantRead`）**

```java
// dashboard/tenant/{tenantId}/usage 是 checkTenantRead：平台管理员可看任意租户，
// 租户管理员只看本租户 —— 路径层无法表达"按 tenantId 逐个比对"，故按全角色放行，
// 归属校验仍由 PermissionCheck.checkTenantRead 承担（此处不构成绕过）。
r.add(new Rule(HttpMethod.GET, "/api/v1/dashboard/tenant/{tenantId}/usage", ALL_ROLES, "≡checkTenantRead（归属在方法体）"));
```

对应 `PermissionCheck.java:74-82`：

```java
public void checkTenantRead(String token, Long tenantId) {
    if (isPlatformAdmin(token)) {
        return;
    }
    Long currentTenantId = getTenantIdFromToken(token);
    if (currentTenantId == null || !currentTenantId.equals(tenantId)) {
        throw new NoPermissionException("您只能查看本租户的信息");
    }
}
```

**模式二：token 账号 == 请求账号的（`codeByAccount`）**——账号反查租户编码，
本人或管理员，归属校验在方法体。

**模式三："改自己的数据"类**——如微信绑定三端点：

```java
// bind / unbind 需登录，且操作的是「自己的绑定」，故 ALL_ROLES 放行 ——
// 越权面在方法体内由 token 里的 userId 兜住（只能绑/解绑当前会话账号）。
r.add(new Rule(HttpMethod.POST, "/api/v1/auth/bind-wechat", ALL_ROLES, "≡需登录 绑定微信（仅当前会话账号）"));
```

三种模式的共同点：**路径层管"角色准入"，方法体层管"数据归属"**，注释里明确写
"此处不构成绕过"——把设计决策钉在代码旁边，评审时不用重新推导。

### 3.3 两种 403 的味道：过滤器层 vs 异常层

这是接入声明式授权后**前端最容易踩的坑**：系统里同时存在两种 403，长得完全不一样。

| 来源 | 触发条件 | HTTP 状态 | 响应体 |
| --- | --- | --- | --- |
| 声明式授权（过滤器层） | 角色不在 `hasAnyRole` 名单 | **真 HTTP 403** | `accessDeniedHandler` 写的 JSON：`{"code":403,"message":"无权限访问该资源","data":null}` |
| 方法体 `PermissionCheck` | `NoPermissionException` | **HTTP 200** | 走 `GlobalExceptionHandler`：`Result.fail(403, e.getMessage())`，业务 code=403 |

后者是第 1 篇讲过的契约治理的一部分（`GlobalExceptionHandler.java:63-65`）：

```java
@ExceptionHandler(NoPermissionException.class)
public Result<Void> handleNoPermissionException(NoPermissionException e) {
    return Result.fail(403, e.getMessage());  // 403-权限不足（对应设计2.1）
}
```

**同一个业务语义（无权限），两个协议出口**。前端如果只按 HTTP status 写分支，
会漏掉全部方法体层 403；只按 body.code 写分支，会漏掉过滤器层 403。正确做法是两个都判。
这个坑在 N5（401/403/1001 三分流）里还会再出现一次，属于同一族问题。

### 3.4 守卫：把"漏声明"变成构建失败

`AuthzRules` 是人工枚举的，枚举必然有遗漏。而遗漏在 `denyAll` 之前是静默放行——
所以必须有工具把"漏声明"变成**构建失败**。这就是 `tools/check-authz-declarative.mjs`
（`npm run check:authz`）的存在理由。它做四件事：

**检查一：覆盖完整性。** 解析所有 Controller 的 `@*Mapping`（类级 `@RequestMapping`
拼方法级），与 `AuthzRules.RULES` 比对，既不在 RULES 也不在 permitAll 白名单的端点 → 判红：

```
未声明授权：POST /api/v1/user/updateStatus  （UserController.java:212）
—— 兜底 authenticated() 下会静默放行
```

**检查二：陈旧规则。** RULES 里有、Controller 里已不存在的端点（改名/删除后忘了删规则）→ 判红。
注释解释了为什么这条也重要：

> 否则规则表会越长越脏，最终没人信它。

**检查三：角色合法性。** RULES 里出现 `RoleConst` 之外的字面量角色 → 判红。
实现上有个大小写坑：守卫正则抓到的是**常量名**（`RoleConst.PLATFORM_ADMIN`），
而运行时值是**小写**（`"platform_admin"`），必须统一小写化后再与 VALID_ROLES 比对，
否则全部规则被误判非法。

**检查四：第四同步点。** permitAll 只解决"进得来"（SecurityConfig + JwtFilter 两处），
`TenantInterceptor` 的 `excludePathPatterns` 是并列的第四处（N6 详细展开），
本守卫断言 PERMIT_ALL 里每个真实存在的端点，两种路径形态都必须出现在
`WebMvcConfig.EXCLUDE_PATTERNS` 中。

两个防假绿机关（这是守卫的纪律，不是锦上添花）：

```javascript
// 自检：解析层是否失效（正则一旦改坏会静默变成 0 端点、0 问题、退出码 0 的假通过）
if (endpoints.length < 100) {
    console.error('✗ 端点扫描数异常（%d < 100）：解析逻辑可能已失效，拒绝给出"通过"结论。', endpoints.length);
    process.exit(2);
}
if (rules.length < 50) { /* 同理 */ }

// 第四同步点自检：这条检查必须真的核对到了东西
if (checkedPublic === 0) {
    problems.push('第四同步点自检失败：PERMIT_ALL 中没有任何路径匹配到真实端点，解析逻辑可能已失效');
}
```

`maskComments` 还有一个字符串态跟踪的细节：注释剥离器必须跟踪双引号字符串字面量，
否则路径里出现的 `"/file/**"` 形式（斜杠+星号+星号）会被误判为块注释起点 `/*`，
导致该行及之后内容被吞掉、端点漏扫。

### 3.5 反向测试：证明守卫真的会红

守卫"全绿"本身不能证明它有效——解析型守卫最常见的失效方式是正则改坏 →
扫到 0 个端点 → 0 个问题 → 退出码 0 → **假通过**。

`tests/check_authz_declarative_guard.js`（`npm run test:authz-guard`）对守卫注入
8 类故障，每类都必须以非 0 退出码被拒：

| # | 注入的故障 | 期望判红关键词 |
| --- | --- | --- |
| 1 | 删掉 `/user/updateStatus` 的规则 | 未声明授权 |
| 2 | 往角色数组里塞 `RoleConst.SUPER_ADMIN` | 非法角色 |
| 3 | 造一条 Controller 里不存在的规则 | 陈旧规则 |
| 4 | 同一端点重复声明 | 规则重复 |
| 5 | 把 `PLATFORM_ONLY` 角色数组清空 | 未定义/为空 |
| 6 | 删除全部规则 | 大量未声明 |
| 7 | 从 `WebMvcConfig.EXCLUDE_PATTERNS` 删 promo 公开端点 | 未排除租户拦截 |
| 8 | 删 `auth/wechat-register` 排除项（一期漏配复现） | 未排除租户拦截 |

外加收尾校验：两个被变异文件必须逐字节还原，防止用例把污染留在工作区。

两个执行细节（在 N6、N2 里也出现过，是同一族工程约束）：

- **同进程执行守卫**：本机托管 node.exe 常被占用，`spawnSync` 恒返回 EBUSY → status=null，
  会让全部用例假失败。改为动态 `import(url + '?t=rand')` 并临时接管 `process.exit`。
- **mutate 必须真改动**：`replace` 正则写错时会静默返回原串 → 守卫在未改动的文件上跑 →
  拿到"通过" → 用例变成给自己盖章的空壳。所以每例先断言 `src !== backup`。

---

## 四、踩坑实录

### 4.1 「上移」会把缺陷一起上移：P1-4 事故

声明式授权最反直觉的坑：**照抄方法体的声明，会把方法体的缺陷固化成路径层故障**。

`/course/list`、`/course/page`、`/course/{id}` 三个端点原本是 `checkTeacherOrAdmin`。
上移时照抄，结果学生端 `student-bookingBrowserCards.js` 调 `/course/list` 直接 403——
实测 student token → `{"code":403}`，功能全断。

而作者注释的本意是"教师或管理员、**学生均可操作**"。修复（2026-10-10 方法级统一）：

```java
// GET /course/list、/page、/{id} 三端已于 2026-10-10（P1-4）方法级统一：
//   · /list 原 checkTeacherOrAdmin 会把学生挡成 403（既存缺陷，实测
//     student token → {"code":403}，而 student-bookingBrowserCards.js 走它）；
//   · 三端现统一 permissionCheck.checkAnyLogin(token)——对齐作者注释本意
//     （"教师或管理员、学生均可操作"）与本处 ALL_ROLES 声明。
r.add(new Rule(HttpMethod.GET, "/api/v1/course/list", ALL_ROLES, "≡checkAnyLogin（2026-10-10 方法级统一）"));
```

**同一个坑第二次踩在复用端点上**：`/course/booking/updateStatus` 是按"确认/驳回"管理语义
收紧为 `PLATFORM_OR_TENANT_ADMIN` 的，结果学生点「取消预约」→ 403。因为这个端点是**复用端点**：
管理员确认/驳回预订 + 学生五种自助状态转移（撤销 booking→none、撤销候补 waiting→cancelled、
取消预约 booked→cancelling、撤回取消 cancelling→booked、重新申请 cancelled→booking）全走它。
最终同样回退为 `ALL_ROLES ≡ checkAnyLogin`，注释把这段历史完整留在了代码里：

```java
// 2026-10-10 P1 曾按"确认/驳回"管理语义收紧为 PLATFORM_OR_TENANT_ADMIN + checkAdmin，
// 实测学生点「取消预约」→ {"code":403} 功能全断（同 /course/list 的教训）。
// 现统一 ALL_ROLES ≡checkAnyLogin 恢复学生自助。
```

**通用教训**：声明式授权不是"把 checkXxx 翻译成 hasRole"的机械劳动。
每个 `≡` 都要先问一句"方法体那个检查本身对吗"——上移是放大器，缺陷跟着一起放大。
`AuthzRules` 里凡是注释超过三行的规则，背后都是一次这样的事故。

### 4.2 pending 管理员自审通过：零检查端点的典型死法

回看 1.2 的链路一，它值得单独拆开，因为它展示了**手写检查的三个叠加失效**：

1. 登录只校验 frozen/inactive——**pending 不在拦截名单**（登录语义与审批语义脱节）；
2. `/user/updateStatus` 方法体零检查——**审批动作本身没有准入**；
3. 前端把审批入口渲染给了 admin 角色——**最后一环反而是最不可靠的**。

声明式授权断的是第 2 环，而且是**结构性断裂**——`denyAll` 之后新端点忘了声明直接 403，
"想忘都忘不了"。规则表里的注释把这个案件完整记录在案：

```java
// 审批/改状态：pending 用户能登录（第1批实测：登录只拦 frozen/inactive），
// 本端点原本零检查 —— 自注册 pending 的 admin 可自行改 active 绕过审批（提权链）。
// 声明式授权在此直接断链。
r.add(new Rule(HttpMethod.POST, "/api/v1/user/updateStatus", PLATFORM_OR_TENANT_ADMIN, "新增·关键：原零检查，pending 用户可自审通过"));
```

注意：即使有了路径层声明，第 1 环（pending 能登录）依然存在——声明式授权管不了登录语义。
这就是 2.1 说的"两层并存"的日常形态：路径层修路径层的洞，方法体层修方法体的洞，
剩下的洞（pending 能登录）需要单独的需求决策。

### 4.3 空角色数组：两种死法，双保险

往 `PLATFORM_ONLY` 数组里塞一个不存在的常量，或者把数组清空，会发生什么？

- **构建期**：守卫判红——`规则 xxx 引用了未定义或为空的角色数组 PLATFORM_ONLY（第 N 行）
  —— 该路径将无人可访问`。守卫的注释解释了为什么必须显式判长度：空数组是 truthy，
  只判 `!roleArrays[name]` 抓不到"角色数组被清空"这种注入。
- **启动期**：`applyDeclarativeAuthz` 抛 `IllegalStateException`。

两个时机都要拦，因为**报错时机一个在构建、一个在启动**，任何单一关卡都可能被绕过
（比如本地 `SKIP_AUTHZ=1` 跳过了守卫，还有启动异常兜底）。

### 4.4 规则表腐烂：比漏声明更慢的死亡

漏声明是急性病（构建期就见血），陈旧规则是慢性病：端点改名了、删除了，规则还挂在表里。
症状是规则表越来越长、越来越不可信，最后没人敢据它做安全评审——
"这份表还有参考价值吗"一旦成为团队共识，整套声明式授权就白做了。

所以守卫把陈旧规则和漏声明放在同一严重级。而 message-service 前缀的排除
（`/api/v1/message`、`/sensitive`、`/sse`、`/users/`）则是**管辖区边界**问题：
这些路径由 Nginx 分流到 8090，根本不到 booking-api，声明了也永不生效——
不排除就是一堆永久陈旧规则。

### 4.5 前端分支：两种 403 都要接

3.3 的表格落到前端就是：拦截器/响应封装里，权限不足的判定必须是
`(res.status === 403) || (res.data?.code === 403)`，只判一个都是漏。
这个坑的隐蔽性在于：**测试环境如果只用一个角色测，永远发现不了**——
student token 打管理端点拿到的是过滤器层 403（真 HTTP 403），
admin token 打平台端点如果方法体有 check 拿到的是 code=403（HTTP 200），
两条路径响应结构不同，前端渲染逻辑却共用。

---

## 五、落地 Checklist

**新增/修改端点时（写代码的人）**
- [ ] 新端点先想清楚：permitAll / 哪类角色 / 全角色+方法体归属，三选一，没有第四种
- [ ] 在 `AuthzRules.RULES` 加规则，note 写清依据（`≡上移` 还是 `新增`，为什么）
- [ ] 具体路径写全 `/api/v1/...`，路径变量段用 `{id}` 形式，不写尾斜杠
- [ ] 全角色放行的，必须在方法体补归属校验，并在注释里写"归属在方法体"
- [ ] 复用端点（管理+自助都走它）默认 `ALL_ROLES`，自助语义优先

**评审时（Review 的人）**
- [ ] 每条 `≡` 规则核对：方法体那个检查本身对吗（P1-4 教训：上移放大缺陷）
- [ ] `新增·关键` 的规则重点看：原本零检查的洞，现在堵得严不严
- [ ] 无权限响应前端接住了吗：真 HTTP 403 和 body.code=403 两条都判

**工程纪律（团队）**
- [ ] `npm run check:authz` 进 pre-commit（漏声明/陈旧/非法角色构建期见红）
- [ ] `npm run test:authz-guard` 定期跑（证明守卫会红，防假绿）
- [ ] 端点改名/删除时同步删规则（陈旧规则和漏声明同级）
- [ ] 新 permitAll 端点过「四处同心圆」（N6）——守卫第四检查会自动核对
- [ ] 兜底 `denyAll()` 永远不许回退成 `authenticated()`——想放松就改具体规则

---

## 下一篇预告

**N9：消息中心微服务拆分——独立库、REST 落库与 SSE 单向推送**：为什么消息中心要独立进程
独立库、写扩散模型下 tenant_id 为什么记发送方、SSE 推送的工程约束，以及跨 schema 对账的
COLLATE 陷阱。

> 本文涉及的核心文件：
> - `api/src/main/java/com/reservation/config/AuthzRules.java`（声明表，182 端点全覆盖）
> - `api/src/main/java/com/reservation/config/SecurityConfig.java`（`applyDeclarativeAuthz` + `denyAll`）
> - `api/src/main/java/com/reservation/utils/PermissionCheck.java`（方法体层，120 处调用）
> - `api/src/main/java/com/reservation/exception/GlobalExceptionHandler.java`（两种 403 的契约出口）
> - `tools/check-authz-declarative.mjs` + `tests/check_authz_declarative_guard.js`（守卫与反向测试）
