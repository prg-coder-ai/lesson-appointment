# SaaS 多租户迁移 · 功能测试用例

| 项目 | 内容 |
|---|---|
| 被测系统 | 语言教学预约系统后端（`api`） |
| 测试类型 | 功能测试（含边界、异常、权限、兼容性、回归） |
| 版本 | Spring Boot 3.3.5 / Java 17 / MyBatis-Plus 3.5.7 / MySQL 8 |
| 部署形态 | 单机 |
| 服务地址 | `http://localhost:8081` |
| 用例总数 | 108 条（P0 阻塞 26 / P1 核心 47 / P2 一般 35） |
| 编写日期 | 2026-08-31 |

---

## 一、测试范围

### 1.1 纳入范围

- 租户生命周期管理（新增 / 修改 / 状态流转 / 续期 / 软删除 / 恢复 / 变更套餐模板）
- 套餐模板管理（规格定义，增删改查）
- 租户套餐管理（一租户一条，限额与当前数量）
- 额度闭环：课程、排期、用户注册、教师信息发布的新增占用与删除释放
- 登录与租户上下文（多租户登录、平台管理员登录、拦截器链路）
- 权限与越权（platform_admin / admin / teacher / student）
- 系统监视、运行管理、运营统计、系统配置、在线统计
- 定时任务（采样、聚合、清理、月度快照、额度对账）
- 原单租户功能的回归

### 1.2 不纳入范围

- 性能压测、安全渗透测试
- 归档导出后清除功能（约定保留 TODO，未实现）
- 前端页面（tenant.html / monitor.html / dashboard.html 尚未开发）

---

## 二、测试环境准备

### 2.1 数据准备

```sql
-- 1. 执行迁移脚本（按顺序）
SOURCE migration-20260830-saas.sql;
SOURCE migration-20260830-tenant-id.sql;
SOURCE migration-20260830-tenant-package.sql;
SOURCE migration-20260830-platform-admin.sql;

-- 2. 确认套餐模板已初始化（脚本自带 3 条）
SELECT id, template_name, template_code, course_limit, status FROM sys_package_template;
-- 预期：免费版(free) / 标准版(standard) / 旗舰版(flagship)，status 均为 1
```

### 2.2 账号矩阵

| 编号 | 账号 | 角色 | tenantCode | 所属租户 | 用途 |
|---|---|---|---|---|---|
| U1 | `platform` | platform_admin | `platform` | 0（平台） | 平台级操作 |
| U2 | `admin_a` | admin | `TENANT_A` | 租户A | 租户管理员 |
| U3 | `teacher_a` | teacher | `TENANT_A` | 租户A | 教师 |
| U4 | `student_a` | student | `TENANT_A` | 租户A | 学生 |
| U5 | `admin_b` | admin | `TENANT_B` | 租户B | 跨租户越权验证 |
| U6 | `student_b` | student | `TENANT_B` | 租户B | 跨租户越权验证 |

> 平台管理员需手工建（脚本第 7 节有示例，密码用 BCrypt 加密后写入）。

### 2.3 租户与套餐基线

| 租户 | tenantCode | 套餐模板 | 课程限额 | 用户限额 | 教师限额 | 学生限额 | 发布限额 |
|---|---|---|---|---|---|---|---|
| 租户A | `TENANT_A` | 免费版 | 20 | 50 | 5 | 50 | 5 |
| 租户B | `TENANT_B` | 旗舰版 | 0（不限） | 0 | 0 | 0 | 0 |

### 2.4 通用约定

- 所有接口除白名单外，均需请求头：`Authorization: Bearer <token>`
- 白名单（无需登录）：`/auth/login`、`/auth/refreshToken`、`/user/*/register`、`/user/account/exist`、静态资源、页面
- 成功响应：`code=200`；失败：`code=400/401/403/404`

---

## 三、用例总览

| 模块 | 编号前缀 | 用例数 | 说明 |
|---|---|---|---|
| M1 租户生命周期 | TC-TNT | 14 | 新增/修改/状态/续期/软删/恢复/变更模板 |
| M2 套餐模板 | TC-TPL | 10 | 套餐模板增删改查 |
| M3 租户套餐 | TC-PKG | 12 | 一租户一条、限额、当前数量、对账 |
| M4 登录与租户上下文 | TC-LOG | 12 | 多租户登录、Token、拦截器 |
| M5 额度闭环 | TC-QTA | 16 | 新增占用 / 删除释放 |
| M6 权限与越权 | TC-PRM | 14 | 平台 vs 租户、跨租户访问 |
| M7 系统监视 | TC-MON | 8 | 概览/趋势/接口健康 |
| M8 运行管理 | TC-RUN | 8 | 用量/占比/环比 |
| M9 运营统计 | TC-OPS | 7 | 租户增减/在线/到期预警 |
| M10 系统配置 | TC-CFG | 7 | 读写/恢复默认/内置项保护 |
| M11 在线统计 | TC-ONL | 5 | 会话写入/续期/登出 |
| M12 定时任务 | TC-TSK | 5 | 采样/快照/对账/清理 |
| M13 回归 | TC-REG | 10 | 原单租户功能不受影响 |

---

## 四、功能测试用例

### M1 租户生命周期（`TC-TNT`）

| 编号 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| TC-TNT-01 | 新增租户成功 | U1 已登录 | POST `/tenant/insert`，body：`{tenantCode:"TENANT_C", orgName:"C机构", contact:"张三", phone:"13800000000"}` | 返回 tenantId；`sys_tenant` 新增一条，`status=1`、`deleted=0`、`package_id=0`，`expire_time` 默认一年后 | P0 |
| TC-TNT-02 | 租户编码重复 | 已存在 TENANT_A | 再次 insert，`tenantCode:"TENANT_A"` | 返回失败，提示"租户编码已存在" | P0 |
| TC-TNT-03 | 租户编码为空 | U1 已登录 | insert，`tenantCode:""` | 返回失败，提示"租户编码不能为空" | P1 |
| TC-TNT-04 | 指定初始套餐模板 | 存在模板 free(id=1) | insert 时带 `packageId:1` | 租户创建成功，`package_id=1` | P1 |
| TC-TNT-05 | 修改租户信息 | 存在租户A | POST `/tenant/update`，改 `orgName` | 修改成功；`tenant_code` 不被改动 | P0 |
| TC-TNT-06 | 修改不存在的租户 | — | update，`id:999999` | 返回失败，提示"待修改的租户不存在" | P2 |
| TC-TNT-07 | 停用租户 | 租户A status=1 | POST `/tenant/{id}/status?status=2` | status 变为 2；该租户用户后续请求被拦截器 403 | P0 |
| TC-TNT-08 | 停用后登录被拒 | 租户A 已停用 | 用 U2 账号 + `TENANT_A` 登录 | 返回 403，"租户编码无效或已停用" | P0 |
| TC-TNT-09 | 重新启用 | 租户A status=2 | POST `/tenant/{id}/status?status=1` | status=1，业务恢复 | P1 |
| TC-TNT-10 | 非法状态值 | — | `status=9` | 返回失败，提示"状态值不合法" | P2 |
| TC-TNT-11 | 续期 | 租户A expire=2026-09-30 | POST `/tenant/{id}/renew?months=12` | expire_time 变为 2027-09-30 | P1 |
| TC-TNT-12 | 续期非法月数 | — | `months=0` 或 `-1` | 返回失败，提示"续期月数必须大于0" | P2 |
| TC-TNT-13 | 已过期租户续期 | 租户 expire 已过期 | `renew?months=1` | 从**当前时间**起算 1 个月，而非在过期时间上叠加 | P1 |
| TC-TNT-14 | 软删除与恢复 | 存在租户C | ① DELETE `/tenant/{id}` ② GET `/tenant/{id}` ③ POST `/tenant/{id}/restore` | ① 成功，`deleted=1`、`status=3`、`offline_time` 有值 ② 列表默认不显示 ③ 恢复成功，`deleted=0`、`status=1` | P0 |
| TC-TNT-15 | 分页与筛选 | 存在多租户 | POST `/tenant/page`，带 `keyword`/`status`/`expireStart` | 按条件过滤；默认只返回 `deleted=0` | P1 |
| TC-TNT-16 | 变更套餐模板（升级） | 租户A 用免费版 | POST `/tenant/{id}/package?templateId=<标准版id>` | 租户套餐限额更新为标准版，`sys_tenant.package_id` 同步 | P0 |

> 注：M1 共 16 条（编号 01–16）。

### M2 套餐模板管理（`TC-TPL`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-TPL-01 | 新增模板 | POST `/package/template/insert`，名称"企业版"、各项限额 | 创建成功，返回 templateId | P0 |
| TC-TPL-02 | 名称为空 | insert 不带 templateName | 失败，"套餐模板名称不能为空" | P1 |
| TC-TPL-03 | 编码重复 | 两次 insert 用同一 templateCode | 第二次失败，"套餐模板编码已存在" | P1 |
| TC-TPL-04 | 修改模板限额 | POST `/package/template/update`，改 course_limit | 限额更新，其他字段不受影响 | P0 |
| TC-TPL-05 | 修改不存在的模板 | update id=999999 | 失败，"待修改的套餐模板不存在" | P2 |
| TC-TPL-06 | 删除无引用的模板 | DELETE `/package/template/{id}`（无租户使用） | 删除成功 | P0 |
| TC-TPL-07 | 删除有租户引用的模板 | 删除 free（租户A 在用） | 失败，提示"仍有 N 个租户选用该模板" | P0 |
| TC-TPL-08 | 停用模板 | update status=2 | 成功；停用的模板不出现在 `/list-enabled` | P1 |
| TC-TPL-09 | 分页与模糊查询 | POST `/package/template/page`，keyword="版" | 返回名称或编码含"版"的模板 | P2 |
| TC-TPL-10 | 启用列表 | GET `/package/template/list-enabled` | 仅返回 status=1 的模板 | P1 |

### M3 租户套餐（`TC-PKG`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-PKG-01 | 直接创建租户套餐 | POST `/tenant/package/insert`，body 带 tenantId 与限额 | 创建成功 | P0 |
| TC-PKG-02 | 缺 tenantId | insert 不带 tenantId | 失败，"租户ID不能为空" | P0 |
| TC-PKG-03 | 租户不存在 | insert tenantId=999999 | 失败，"指定租户不存在" | P1 |
| TC-PKG-04 | **一租户仅一条** | 租户A 已有套餐，再次 insert | 失败，"该租户已存在套餐记录" | P0 |
| TC-PKG-05 | 按模板创建 | POST `/tenant/package/create-from-template?tenantId=A&templateId=1` | 套餐创建，限额与模板一致，当前数量全 0 | P0 |
| TC-PKG-06 | 按模板重复创建 | 对同一租户再执行一次 | 失败，"该租户已存在套餐记录，如需换模板请使用变更套餐" | P1 |
| TC-PKG-07 | 修改限额 | POST `/tenant/package/update`，改 course_limit | 限额更新，当前数量字段不被改动 | P0 |
| TC-PKG-08 | 修改不允许改租户归属 | update 中传入不同 tenantId | 失败，"不允许变更套餐所属租户" | P1 |
| TC-PKG-09 | 按租户查询 | GET `/tenant/package/tenant/{tenantId}` | 返回该租户的套餐 | P1 |
| TC-PKG-10 | 查询无套餐的租户 | 查询未配置套餐的租户 | 返回 404，"该租户尚未配置套餐" | P2 |
| TC-PKG-11 | 删除租户套餐 | DELETE `/tenant/package/{id}` | 删除成功；此后该租户视为**不限额** | P1 |
| TC-PKG-12 | 切换模板-升级 | POST `/tenant/package/{tenantId}/switch-template?templateId=<旗舰版>` | 限额更新为 0（不限），`sys_tenant.package_id` 同步 | P0 |
| TC-PKG-13 | **切换模板-降级被拒** | 租户A 已有 15 门课，切到课程限额 10 的模板 | 失败，"当前课程用量 15 已超出目标套餐限额 10" | P0 |
| TC-PKG-14 | 对账-无偏差 | POST `/tenant/package/reconcile/{tenantId}` | 返回 false，"数据一致，无需校正" | P1 |
| TC-PKG-15 | 对账-有偏差 | 手工把 `course_current` 改大后执行对账 | 返回 true，当前数量被校正为实际统计值 | P0 |
| TC-PKG-16 | 全量对账 | POST `/tenant/package/reconcile-all` | 返回被校正的租户数 | P2 |

> 注：M3 共 16 条。

### M4 登录与租户上下文（`TC-LOG`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-LOG-01 | 租户端登录成功 | POST `/auth/login`，`{account:admin_a, password:***, tenantCode:"TENANT_A"}` | 返回 token/refreshToken/role；`sys_user_session` 新增一条 status=1 | P0 |
| TC-LOG-02 | 平台管理员登录 | `{account:platform, role:"platform_admin", tenantCode:"platform"}` | 成功，Token 中 tenantId=0 | P0 |
| TC-LOG-03 | 租户编码不存在 | `tenantCode:"NOT_EXIST"` | 403，"租户编码无效或已停用" | P0 |
| TC-LOG-04 | 租户已停用 | 租户A status=2 后登录 | 403 | P0 |
| TC-LOG-05 | **租户已软删除仍可登录（缺陷探测）** | 租户C deleted=1 后登录 | **预期应拒绝**；当前实现未校验 deleted，需记录缺陷 | P0 |
| TC-LOG-06 | 密码错误 | 错误密码 | 返回 400，"密码错误" | P1 |
| TC-LOG-07 | 账号不存在 | 不存在的账号 | 404，"账号不存在" | P1 |
| TC-LOG-08 | Token 带租户信息 | 解析登录返回的 Token | payload 含 `tenantId`，与租户一致 | P0 |
| TC-LOG-09 | 拦截器放行白名单 | 不登录访问 `/auth/login` | 正常响应，未被拦截 | P0 |
| TC-LOG-10 | 未带 Token 访问受保护接口 | GET `/tenant/list` 不带 Authorization | 401，"未登录，请先登录" | P0 |
| TC-LOG-11 | 失效 Token | 篡改 Token 后访问 | 401 或 Token 解析失败 | P1 |
| TC-LOG-12 | 登出后会话结束 | POST `/auth/logout`（带 Authorization） | 成功；`sys_user_session` 对应记录 status=2 | P0 |

### M5 额度闭环（`TC-QTA`）

> 基线：租户A（免费版）课程限额 20、用户 50、教师 5、学生 50、发布 5；租户B（旗舰版）全部不限。

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-QTA-01 | 创建课程占用额度 | 租户A 教师创建 1 门课程 | 成功；`course_current` +1 | P0 |
| TC-QTA-02 | 额度用完被拒 | 租户A 课程已达 20，再创建 | 失败，"课程数量已达套餐上限" | P0 |
| TC-QTA-03 | 删除课程释放额度 | 删除 1 门课程 | 成功；`course_current` -1，可再次创建 | P0 |
| TC-QTA-04 | 批量删除按条数释放 | 按模板删除 3 门课程 | `course_current` -3 | P1 |
| TC-QTA-05 | 不限额租户不受限 | 租户B 创建 50 门课程 | 全部成功（limit=0 视为不限） | P0 |
| TC-QTA-06 | 未配置套餐=不限额 | 删除租户A 的套餐记录后创建课程 | 成功，不校验额度 | P1 |
| TC-QTA-07 | 平台租户不受限 | 平台管理员（tenantId=0）创建课程 | 成功 | P2 |
| TC-QTA-08 | 排期占用 | 创建排期 | `schedule_current` +1 | P0 |
| TC-QTA-09 | 排期释放 | 删除排期 / 按课程删除排期 | `schedule_current` 相应减少 | P0 |
| TC-QTA-10 | 学生注册占用两个维度 | 注册 1 名学生 | `user_current` +1 且 `student_current` +1 | P0 |
| TC-QTA-11 | 教师注册占用 | 注册 1 名教师 | `user_current` +1 且 `teacher_current` +1 | P0 |
| TC-QTA-12 | 用户总数超限 | 租户A 用户达 50 | 失败，"注册用户总数已达套餐上限" | P0 |
| TC-QTA-13 | 角色名额超限 | 租户A 教师达 5 | 失败，"教师注册名额已达套餐上限" | P0 |
| TC-QTA-14 | 教师发布占用 | 新增 1 条教师发布信息 | `teacher_publish_current` +1 | P0 |
| TC-QTA-15 | 教师发布释放 | 删除（归档）1 条 | `teacher_publish_current` -1 | P0 |
| TC-QTA-16 | 并发占用不超卖 | 20 个并发请求同时创建课程（限�� 20） | 恰好成功 20 个，无超卖 | P0 |
| TC-QTA-17 | 额度不被扣成负数 | 手工把 current 置 0 后删除业务数据 | current 保持 0，不变负 | P1 |

> 注：M5 共 17 条。

### M6 权限与越权（`TC-PRM`）

| 编号 | 场景 | 操作账号 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-PRM-01 | 平台管理员看全部租户 | U1 | GET `/tenant/list` 返回所有租户 | P0 |
| TC-PRM-02 | 租户管理员访问租户列表 | U2 | 403，无平台管理员权限 | P0 |
| TC-PRM-03 | 租户管理员只读自己 | U2 | GET `/tenant/{A的id}` 成功 | P0 |
| TC-PRM-04 | **租户管理员看他人租户** | U2 访问 `/tenant/{B的id}` | 403，"您只能查看本租户的信息" | P0 |
| TC-PRM-05 | 租户分页强制限定 | U2 访问 POST `/tenant/page` | 只返回自己所属租户，传 keyword 也无效 | P0 |
| TC-PRM-06 | 租户管理员修改租户 | U2 POST `/tenant/update` | 403 | P0 |
| TC-PRM-07 | 租户管理员删除租户 | U2 DELETE `/tenant/{id}` | 403 | P0 |
| TC-PRM-08 | 普通教师访问平台接口 | U3 GET `/dashboard/overview` | 403 | P0 |
| TC-PRM-09 | 学生访问系统监视 | U4 GET `/monitor/overview` | 403 | P0 |
| TC-PRM-10 | 租户管理员看自己用量 | U2 GET `/dashboard/tenant/{A}/usage` | 成功 | P1 |
| TC-PRM-11 | 租户管理员看他人用量 | U2 查 `/dashboard/tenant/{B}/usage` | 403 | P0 |
| TC-PRM-12 | 租户管理员改系统配置 | U2 POST `/sys/config/update` | 403 | P0 |
| TC-PRM-13 | 管理员可查看套餐模板 | U2 GET `/package/template/list` | 成功（查询对管理员开放） | P1 |
| TC-PRM-14 | 管理员不可改套餐模板 | U2 POST `/package/template/insert` | 403 | P0 |

### M7 系统监视（`TC-MON`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-MON-01 | 系统概览 | U1 GET `/monitor/overview` | 返回 cpu/memory/disk/jvm/onlineUsers 各字段，数值合理 | P0 |
| TC-MON-02 | 概览字段完整性 | 检查返回体 | 含 cpu.system、cpu.process、memory.total/used、jvm.heapUsed/heapMax、disk、threadCount、gcCount | P1 |
| TC-MON-03 | 带宽字段说明 | 检查 netOutBytes | 返回 null，且 netNote 有说明（已知限制） | P2 |
| TC-MON-04 | 趋势查询 | GET `/monitor/trend?hours=24` | 按时间正序返回采样点 | P1 |
| TC-MON-05 | 小时聚合 | GET `/monitor/hourly?days=7` | 返回小时聚合记录 | P2 |
| TC-MON-06 | 接口健康度 | GET `/monitor/api-health?minutes=60` | 返回 totalRequests/failRequests/errorRate/qps/p95CostMs/slowApis | P0 |
| TC-MON-07 | 手动采样 | U1 POST `/monitor/sample` | 成功，`sys_metric_sample` 新增一条 | P1 |
| TC-MON-08 | 非平台管理员被拒 | U2 GET `/monitor/overview` | 403 | P0 |

### M8 运行管理（`TC-RUN`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-RUN-01 | 全租户用量分页 | U1 POST `/dashboard/tenant/usage/page` | 返回各租户用量、限额、占比、quotaLevel | P0 |
| TC-RUN-02 | 单租户用量详情 | U1 GET `/dashboard/tenant/{A}/usage` | 返回 6 个维度的 count/limit/percent | P0 |
| TC-RUN-03 | 占比计算正确 | 租户A 课程 10 / 限额 20 | coursePercent = 50 | P0 |
| TC-RUN-04 | 额度等级-预警 | 占比 ≥80%（配置 monitor.quota.warn.percent） | quotaLevel = "warn" | P1 |
| TC-RUN-05 | 额度等级-告警 | 占比 ≥95% | quotaLevel = "danger" | P1 |
| TC-RUN-06 | 不限额标记 | 租户B（limit=0） | quotaLevel = "unlimited"，百分比为 0 | P1 |
| TC-RUN-07 | 环比数据 | 存在上月快照 | 返回 courseDelta 等字段（当前值 - 上月值，可为正/负） | P0 |
| TC-RUN-08 | 无上月快照 | 首次运行 | 环比字段为 null，不报错 | P2 |

### M9 运营统计（`TC-OPS`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-OPS-01 | 平台总览 | U1 GET `/dashboard/overview` | 返回 tenantTotal/tenantNewThisMonth/tenantOfflineThisMonth/userTotal/onlineTotal/expireWarning | P0 |
| TC-OPS-02 | 本月新增租户数 | 本月新建 2 个租户后查询 | tenantNewThisMonth = 2 | P0 |
| TC-OPS-03 | 本月退租数 | 本月将 1 个租户置为退租 | tenantOfflineThisMonth = 1（软删除与退租均写入 offline_time） | P0 |
| TC-OPS-04 | 租户增减趋势 | GET `/dashboard/tenant/trend?months=12` | 返回 12 个月，每月含 newCount/offlineCount | P1 |
| TC-OPS-05 | 在线总数 | 3 个用户在线 | onlineTotal = 3 | P0 |
| TC-OPS-06 | 各租户在线分布 | 租户A 2 人、租户B 1 人在线 | onlineByTenant 返回对应分布 | P0 |
| TC-OPS-07 | 到期预警 | 租户A 到期日距今天 10 天（阈值 30） | 出现在 expireWarning 列表 | P1 |

### M10 系统配置（`TC-CFG`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-CFG-01 | 查询全部配置 | GET `/sys/config/list` | 返回 10 项默认配置 | P1 |
| TC-CFG-02 | 按分组查询 | GET `/sys/config/group/monitor` | 仅返回 monitor 组 | P2 |
| TC-CFG-03 | 查询单项 | GET `/sys/config/monitor.sample.interval.seconds` | 返回该项详情 | P2 |
| TC-CFG-04 | 修改采样间隔 | U1 POST `/sys/config/update`，改为 30 | 成功；后续采样间隔变为 30 秒 | P0 |
| TC-CFG-05 | 修改保留天数 | 改 monitor.retention.detail.days | 清理任务按新值执行 | P1 |
| TC-CFG-06 | 恢复默认值 | POST `/sys/config/{key}/reset` | 恢复为 default_value | P1 |
| TC-CFG-07 | 非平台管理员改配置 | U2 POST `/sys/config/update` | 403 | P0 |

### M11 在线统计与会话（`TC-ONL`）

| 编号 | 场景 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-ONL-01 | 登录写入会话 | 用户登录 | `sys_user_session` 新增 status=1，含 ip/userAgent | P0 |
| TC-ONL-02 | 请求续期 | 登录后持续调用业务接口 | `last_active` 更新（有 60 秒节流） | P1 |
| TC-ONL-03 | 登出结束会话 | 调用 `/auth/logout` | 会话 status=2 | P0 |
| TC-ONL-04 | 超窗不活跃不再计在线 | 静置超过 idle 窗口（默认 5 分钟） | 不再计入 onlineTotal | P0 |
| TC-ONL-05 | 修改在线判定窗口 | 改 monitor.online.idle.minutes=10 | 在线统计按 10 分钟判定 | P2 |

### M12 定时任务（`TC-TSK`）

| 编号 | 场景 | 验证方式 | 预期结果 | 优先级 |
|---|---|---|---|---|
| TC-TSK-01 | 指标采样 | 等待 2 个采样周期 | `sys_metric_sample` 按配置间隔新增记录 | P0 |
| TC-TSK-02 | 小时聚合 | 跨整点后观察 | `sys_metric_hourly` 生成上一小时记录 | P1 |
| TC-TSK-03 | 月度快照 | 触发或等待每日 02:05 | `sys_tenant_stats_monthly` 生成当月快照 | P0 |
| TC-TSK-04 | 额度对账 | 制造偏差后等待每日 03:30 | current 被校正为实际值 | P0 |
| TC-TSK-05 | 关闭任务开关 | 设 monitor.task.enabled=0 | 所有定时任务不再执行 | P2 |

### M13 回归（`TC-REG`）

> 验证多租户改造未破坏原单租户功能。

| 编号 | 场景 | 预期结果 | 优先级 |
|---|---|---|---|
| TC-REG-01 | 课程模板增删改查 | 正常，与改造前一致 | P0 |
| TC-REG-02 | 课程列表分页与筛选 | 正常返回，带 tenant_id 过滤 | P0 |
| TC-REG-03 | 排期冲突检测 | 仍生效 | P1 |
| TC-REG-04 | 预约/预约时段功能 | 正常 | P0 |
| TC-REG-05 | 教师资质信息维护 | 正常 | P1 |
| TC-REG-06 | 教师公开信息页（免登录） | 白名单放行，可匿名访问 | P0 |
| TC-REG-07 | 签到、评价、反馈 | 正常 | P1 |
| TC-REG-08 | 审计日志写入 | 各操作仍记录，含 tenantId | P1 |
| TC-REG-09 | 日志浏览页 | 正常 | P2 |
| TC-REG-10 | 深链 `/booking?tid=xx` | 正常跳转 | P1 |

---

## 五、专项测试

### 5.1 边界值

| 编号 | 场景 | 预期 |
|---|---|---|
| TC-BND-01 | 限额设为 0 | 视为不限 |
| TC-BND-02 | 限额设为 1，创建第 2 个资源 | 第 2 个被拒 |
| TC-BND-03 | 用量恰好等于限额 | 拒绝新增（current >= limit 即拒） |
| TC-BND-04 | 分页 pageNum=0 / 负数 | 不报错，返回合理结果 |
| TC-BND-05 | pageSize=1000 | 正常返回或受上限保护 |
| TC-BND-06 | 超长字符串（orgName 500 字） | 正常入库或明确报错 |
| TC-BND-07 | 租户编码含特殊字符 | 正常，不被 SQL 注入 |

### 5.2 兼容性

| 编号 | 场景 | 预期 |
|---|---|---|
| TC-CMP-01 | 历史存量数据（tenant_id=0） | 可正常查询，平台视角可见 |
| TC-CMP-02 | 旧 Token（无 tenantId claim） | 明确报 401，不产生脏数据 |
| TC-CMP-03 | 未配置套餐的老租户 | 视为不限额，业务不中断 |
| TC-CMP-04 | 前端旧版页面（未传 tenantCode） | 登录给出明确错误提示 |

---

## 六、已知风险与待确认缺陷

> 以下为代码走查发现的疑点，需在执行中重点验证并登记缺陷。

| 序号 | 风险点 | 影响 | 建议 | 严重度 |
|---|---|---|---|---|
| R1 | **登录不校验用户归属**：`UserService.login` 按 account 全局查用户，未校验 `user.tenantId` 是否等于请求租户 | 租户A 的用户可用租户B 的编码登录，形成**跨租户越权** | 登录时校验用户所属租户与请求租户一致 | 高 |
| R2 | **软删除租户仍可登录**：`authController` 仅校验 `status != 1`，未校验 `deleted` | 已删除租户的用户仍能登录 | 登录增加 `deleted` 校验 | 高 |
| R3 | **注册接口租户归属丢失**：`/user/*/register` 在拦截器白名单内，`TenantContext` 为空，注册用户 `tenant_id` 兜底为 0 | 注册的用户不属于任何租户，且额度校验被绕过 | 注册请求携带 tenantCode，或在注册接口中解析租户 | 高 |
| R4 | `sys_user_session` 未做容量控制 | 长期运行后表膨胀 | 已有每日清理任务，需验证 TC-TSK 生效 | 中 |
| R5 | 接口健康度统计会全量拉取审计日志 | 日志量大时 `/monitor/api-health` 可能变慢 | 观察 60 分钟窗口的响应时间，必要时改为 SQL 聚合 | 中 |
| R6 | 网卡带宽无法采集 | 运维看不到带宽曲线 | 需引入 OSHI 或改用应用吞吐指标 | 低 |

---

## 七、测试执行清单

### 冒烟（P0，26 条，约 1 小时）

TC-TNT-01/05/07/08/14/16、TC-TPL-01/06/07、TC-PKG-01/04/05/13/15、TC-LOG-01/02/03/08/09/10/12、TC-QTA-01/02/03、TC-PRM-01/02/04、TC-MON-01/06、TC-RUN-01/02、TC-OPS-01/02/03/05、TC-CFG-04、TC-ONL-01/03、TC-TSK-01/03、TC-REG-01/02/06

### 核心（P1，约 2 小时）

全部 P1 用例 + 边界值专项

### 完整（P2，约 1 小时）

全部 P2 用例 + 兼容性专项 + 回归全套

---

## 八、缺陷记录模板

```
【缺陷编号】BUG-SaaS-001
【模块】租户管理 / 套餐 / 额度 / 登录 / 权限 / 监控
【标题】
【严重程度】阻断 / 严重 / 一般 / 轻微
【优先级】P0 / P1 / P2
【环境】Windows 10 / JDK 17 / MySQL 8 / 版本 commit
【前置条件】
【复现步骤】1. 2. 3.
【实际结果】
【期望结果】
【截图/日志】
【影响范围】
【备注】关联用例 TC-XXX-XX
```

---

## 九、备注

- 执行前请确认 `migration-20260830-platform-admin.sql` 已完整执行，特别是 `sys_tenant` 列名由连字符改为下划线
- 若曾误执行过含 `DROP INDEX uk_tenant_id` 的旧版脚本，需先按脚本第 9 节末尾的语句恢复唯一约束，否则 M3 的"一租户一条"用例无法验证
- 平台管理员账号需手工创建（脚本第 7 节，密码用 BCrypt 加密）
