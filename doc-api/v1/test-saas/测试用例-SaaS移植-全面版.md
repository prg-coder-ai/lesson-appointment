# SaaS 多租户移植 · 全面功能测试用例

| 项目 | 内容 |
|---|---|
| 被测系统 | 语言教学预约系统后端（`api`） |
| 测试类型 | 功能测试（正常 / 边界 / 异常 / 权限 / 数据隔离 / 并发 / 回归） |
| 技术栈 | Spring Boot 3.3.5 / Java 17 / MyBatis-Plus 3.5.7 / MySQL 8 |
| 服务地址 | `http://localhost:8081` |
| 用例总数 | 293 条（P0 104 / P1 116 / P2 73） |
| 编写日期 | 2026-08-31（2026-09-02 补充 V 组：术语表 sys_term，57 条） |

---

## 一、测试策略

### 1.1 多租户移植的三层验证

多租户改造是否完成，必须逐层验证，缺一层就不算完成：

| 层级 | 验证内容 | 本次状态（代码走查） |
|---|---|---|
| L1 字段层 | 各业务表是否有 `tenant_id` 列 | ✅ 已完成（14 张表） |
| L2 写入层 | 新增数据时是否正确写入当前租户 ID | ❌ **未完成** |
| L3 隔离层 | 查询/修改/删除是否按租户过滤 | ❌ **未完成** |

### 1.2 阻断性发现：数据隔离未实现

> 这是本次测试的**最高优先级风险**，以下结论基于代码走查，需在执行阶段用 TC-S 组用例实测确认。

| 问题 | 代码依据 | 后果 |
|---|---|---|
| **创建时不写 tenant_id** | `CourseService:158` 仅做额度校验后直接 `courseMapper.insert(course)`；`BookingService:34` 同样直接 insert。全项目仅 `UserService:128` 有 `setTenantId` | 所有业务数据 `tenant_id` 均为默认值 **0** |
| **查询不带租户条件** | 8 个 mapper XML 中**无任何** `tenant_id` 条件；`CourseService.getCoursePage` 直接调用 `selectCourseListByPage` | 租户 A 能查到、改到、删掉租户 B 的全部数据 |
| **额度统计恒为 0** | `TenantQuotaService.countUsage` 按 `tenant_id` 统计，但数据全是 0 | 额度占用/释放形同虚设，套餐限制无效 |

**结论**：当前处于「只加字段，未做隔离」状态。TC-S 组（数据隔离专项）执行后若确认，**多租户移植不具备上线条件**，需先完成 L2/L3 改造。

---

## 二、接口覆盖总览

> 作为用例覆盖基线，共 **147 个接口**。测试完成后应逐条标注覆盖状态。

| 控制器 | 前缀 | 接口数 | 用例组 |
|---|---|---|---|
| TenantController | `/tenant` | 11 | A |
| TenantPackageController | `/tenant/package` | 12 | C |
| PackageTemplateController | `/package/template` | 7 | B |
| authController | `/auth` | 6 | D |
| UserController | `/user` | 12 | F |
| CourseController | `/course` | 11 | G |
| TemplateController | `/course/template` | 7 | G |
| ScheduleController | `/schedule` | 16 | H |
| BookingController | `/course/booking` | 13 | I |
| AppointmentController | `/course/appointment` | 15 | I |
| TeacherProfessionalController | `/teacher/professional` | 5 | J |
| TeacherPublishedProfileController | `/teacher/published` | 8 | J |
| MonitorController | `/monitor` | 5 | L |
| DashboardController | `/dashboard` | 6 | M/N |
| SysConfigController | `/sys/config` | 5 | O |
| TermController | `/term` | 8 | V |
| AuditLogController | `/api/audit-logs` | 3 | Q |
| logController | `/api/logs` | 4 | U |
| TimezoneCalcController | `/tz` | 1 | U |
| IndexController / PageController | `/` | 4 | U |
| **合计** | | **147** | |

---

## 三、测试环境准备

### 3.1 数据准备

```sql
SOURCE migration-20260830-saas.sql;
SOURCE migration-20260830-tenant-id.sql;
SOURCE migration-20260830-tenant-package.sql;
SOURCE migration-20260830-platform-admin.sql;
SOURCE migration-20260831-sys-system-config.sql;

-- 确认套餐模板初始化
SELECT id, template_name, template_code, course_limit, status FROM sys_package_template;
-- 预期：免费版(free,20) / 标准版(standard,200) / 旗舰版(flagship,0)
```

### 3.2 账号矩阵

| 编号 | 账号 | 角色 | tenantCode | 租户 |
|---|---|---|---|---|
| U1 | `platform` | platform_admin | `platform` | 0（平台） |
| U2 | `admin_a` | admin | `TENANT_A` | 租户A |
| U3 | `teacher_a` | teacher | `TENANT_A` | 租户A |
| U4 | `student_a` | student | `TENANT_A` | 租户A |
| U5 | `admin_b` | admin | `TENANT_B` | 租户B |
| U6 | `teacher_b` | teacher | `TENANT_B` | 租户B |
| U7 | `student_b` | student | `TENANT_B` | 租户B |

### 3.3 租户基线

| 租户 | tenantCode | 模板 | 课程 | 排期 | 用户 | 教师 | 学生 | 发布 |
|---|---|---|---|---|---|---|---|---|
| 租户A | `TENANT_A` | 免费版 | 20 | 100 | 50 | 5 | 50 | 5 |
| 租户B | `TENANT_B` | 旗舰版 | 0=不限 | 0 | 0 | 0 | 0 | 0 |
| 租户C | `TENANT_C` | 免费版 | 20 | 100 | 50 | 5 | 50 | 5 |

### 3.4 通用约定

- 除白名单外均需 `Authorization: Bearer <token>`
- 白名单：`/auth/login`、`/auth/refreshToken`、`/user/*/register`、`/user/account/exist`、`/teacher/published/*-public`、`/schedule/getAvailableSchedule`、`/booking`、`/interfaces`、页面与静态资源
- 成功 `code=200`；失败 `400/401/403/404`

---

## 四、测试用例

### A 组：租户管理（TC-A，16 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-A-01 | 新增租户 | U1 POST `/tenant/insert` 带 tenantCode/orgName | 成功；status=1、deleted=0、expire 默认一年后 | P0 |
| TC-A-02 | 编码重复 | 重复 tenantCode | 失败"租户编码已存在" | P0 |
| TC-A-03 | 编码为空 | 空 tenantCode | 失败"租户编码不能为空" | P1 |
| TC-A-04 | 指定初始模板 | insert 带 packageId | 租户 package_id 正确 | P1 |
| TC-A-05 | 修改租户 | 改 orgName | 成功，tenant_code 不变 | P0 |
| TC-A-06 | 修改不存在 | id=999999 | 失败"待修改的租户不存在" | P2 |
| TC-A-07 | 停用租户 | status=2 | 生效；该租户用户被拦截器 403 | P0 |
| TC-A-08 | 停用后登录 | 停用租户的用户登录 | 403"租户编码无效或已停用" | P0 |
| TC-A-09 | 重新启用 | status=1 | 业务恢复 | P1 |
| TC-A-10 | 非法状态值 | status=9 | 失败"状态值不合法" | P2 |
| TC-A-11 | 续期 | renew?months=12 | expire +12 个月 | P1 |
| TC-A-12 | 续期非法月数 | months=0/-1 | 失败"续期月数必须大于0" | P2 |
| TC-A-13 | 已过期续期 | expire 已过期 | 从当前时间起算 | P1 |
| TC-A-14 | 软删除 | DELETE `/tenant/{id}` | deleted=1、status=3、offline_time 有值 | P0 |
| TC-A-15 | 恢复 | POST `/tenant/{id}/restore` | deleted=0、status=1、offline_time 清空 | P0 |
| TC-A-16 | 分页筛选 | keyword/status/expireRange | 正确过滤，默认不含 deleted=1 | P1 |

### B 组：套餐模板（TC-B，10 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-B-01 | 新增模板 | 创建成功 | P0 |
| TC-B-02 | 名称为空 | 失败"套餐模板名称不能为空" | P1 |
| TC-B-03 | 编码重复 | 失败"套餐模板编码已存在" | P1 |
| TC-B-04 | 修改限额 | 更新成功 | P0 |
| TC-B-05 | 修改不存在模板 | 失败 | P2 |
| TC-B-06 | 删除无引用模板 | 成功 | P0 |
| TC-B-07 | 删除有引用模板 | 失败"仍有 N 个租户选用该模板" | P0 |
| TC-B-08 | 停用模板 | 成功，不出现在 list-enabled | P1 |
| TC-B-09 | 分页模糊查询 | 名称/编码匹配 | P2 |
| TC-B-10 | 启用列表 | 仅 status=1 | P1 |

### C 组：租户套餐（TC-C，16 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-C-01 | 直接创建租户套餐 | 成功 | P0 |
| TC-C-02 | 缺 tenantId | 失败"租户ID不能为空" | P0 |
| TC-C-03 | 租户不存在 | 失败"指定租户不存在" | P1 |
| TC-C-04 | 一租户仅一条 | 重复创建失败 | P0 |
| TC-C-05 | 按模板创建 | 限额与模板一致，当前量全 0 | P0 |
| TC-C-06 | 按模板重复创建 | 失败，提示用变更套餐 | P1 |
| TC-C-07 | 修改限额 | 当前数量不被改动 | P0 |
| TC-C-08 | 改租户归属 | 失败"不允许变更套餐所属租户" | P1 |
| TC-C-09 | 按租户查询 | 返回该租户套餐 | P1 |
| TC-C-10 | 查询无套餐租户 | 404"该租户尚未配置套餐" | P2 |
| TC-C-11 | 删除租户套餐 | 成功，此后视为不限额 | P1 |
| TC-C-12 | 切换模板-升级 | 限额更新，package_id 同步 | P0 |
| TC-C-13 | 切换模板-降级被拒 | 失败"当前课程用量 N 已超出目标套餐限额 M" | P0 |
| TC-C-14 | 对账-无偏差 | false"数据一致，无需校正" | P1 |
| TC-C-15 | 对账-有偏差 | true，校正为实际值 | P0 |
| TC-C-16 | 全量对账 | 返回校正租户数 | P2 |

### D 组：登录鉴权（TC-D，15 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-D-01 | 租户端登录 | 成功，写入会话 status=1 | P0 |
| TC-D-02 | 平台管理员登录 | 成功，Token tenantId=0 | P0 |
| TC-D-03 | 租户编码不存在 | 403 | P0 |
| TC-D-04 | 租户已停用 | 403 | P0 |
| TC-D-05 | 租户已软删除 | **应拒绝**（当前未校验 deleted，预期失败） | P0 |
| TC-D-06 | **跨租户登录** | A 的用户用 B 的编码登录，**应拒绝**（当前未校验归属，预期失败） | P0 |
| TC-D-07 | 密码错误 | 400"密码错误" | P1 |
| TC-D-08 | 账号不存在 | 404"账号不存在" | P1 |
| TC-D-09 | 账号冻结 | 400"账号已冻结" | P1 |
| TC-D-10 | Token 含租户信息 | payload 有 tenantId | P0 |
| TC-D-11 | 无 Token 访问受保护接口 | 401 | P0 |
| TC-D-12 | 失效 Token | 401 | P1 |
| TC-D-13 | 刷新 Token | 成功返回新 accessToken | P0 |
| TC-D-14 | 登出 | 会话 status=2 | P0 |
| TC-D-15 | 白名单免登录 | 可匿名访问 | P0 |

### E 组：权限与越权（TC-E，20 条）

| 编号 | 场景 | 操作账号 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-E-01 | 平台看全部租户 | U1 | 返回全部 | P0 |
| TC-E-02 | 租户管理员访问租户列表 | U2 | 403 | P0 |
| TC-E-03 | 租户管理员看自己 | U2 | 成功 | P0 |
| TC-E-04 | 租户管理员看他人 | U2 查 B | 403"您只能查看本租户的信息" | P0 |
| TC-E-05 | 租户分页强制限定 | U2 | 仅自己租户 | P0 |
| TC-E-06 | 租户管理员改租户 | U2 | 403 | P0 |
| TC-E-07 | 租户管理员删租户 | U2 | 403 | P0 |
| TC-E-08 | 教师访问平台接口 | U3 | 403 | P0 |
| TC-E-09 | 学生访问系统监视 | U4 | 403 | P0 |
| TC-E-10 | 租户管理员看自己用量 | U2 | 成功 | P1 |
| TC-E-11 | 租户管理员看他人用量 | U2 查 B | 403 | P0 |
| TC-E-12 | 非平台改系统配置 | U2 | 403 | P0 |
| TC-E-13 | 管理员查套餐模板 | U2 | 成功 | P1 |
| TC-E-14 | 管理员改套餐模板 | U2 | 403 | P0 |
| TC-E-15 | 学生创建课程 | U4 | 403 | P0 |
| TC-E-16 | 教师改他人课程 | U3 改 teacher_b 的课 | 403 | P0 |
| TC-E-17 | 学生取消他人预约 | U4 | 403 | P0 |
| TC-E-18 | 平台管理员跨租户操作业务 | U1 建课程 | 按平台身份处理（tenantId=0） | P1 |
| TC-E-19 | 未激活教师创建排期 | 待审核教师 | 403"教师账号未审核或已冻结" | P1 |
| TC-E-20 | 冻结学生预约 | 冻结账号 | 403 | P1 |

### F 组：用户与注册（TC-F，15 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-F-01 | 学生注册 | 成功，user.tenant_id = 注册时租户 | P0 |
| TC-F-02 | 教师注册 | 成功，status=inactive 待审核 | P0 |
| TC-F-03 | 管理员注册 | 成功 | P0 |
| TC-F-04 | 账号重复 | 失败"账号已存在" | P0 |
| TC-F-05 | 手机号格式错误 | 400 校验失败 | P1 |
| TC-F-06 | 手机与邮箱都为空 | 400 校验失败 | P1 |
| TC-F-07 | 密码强度不足 | 400 校验失败 | P1 |
| TC-F-08 | **注册租户归属**（入参带 tenantCode） | `user.tenant_id` = tenantCode 对应租户 | P0 |
| TC-F-09 | 注册不传 tenantCode | 403"租户编码无效或已停用，请检查注册链接" | P0 |
| TC-F-10 | 注册传无效/停用租户编码 | 403，不创建用户 | P0 |
| TC-F-09 | 用户列表分页 | 返回本租户用户 | P0 |
| TC-F-10 | 按角色筛选 | teacher/student 列表正确 | P1 |
| TC-F-11 | 修改用户状态 | 成功 | P1 |
| TC-F-12 | 账号存在性校验 | 正确返回 | P2 |
| TC-F-13 | 修改密码 | 成功，旧密码失效 | P0 |
| TC-F-14 | 用户统计按月 | 返回本租户数据 | P2 |
| TC-F-15 | 强制踢出用户 | 会话失效 | P1 |

### G 组：课程与模板（TC-G，16 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-G-01 | 创建课程模板 | 成功 | P0 |
| TC-G-02 | 模板语言+难度重复 | 失败"该语言类型+难度等级的课程模板已存在" | P0 |
| TC-G-03 | 修改模板 | 成功 | P1 |
| TC-G-04 | 模板状态变更 | 成功 | P1 |
| TC-G-05 | 创建课程 | 成功，**course.tenant_id = 当前租户** | P0 |
| TC-G-06 | 课程列表分页 | **仅返回本租户课程** | P0 |
| TC-G-07 | 课程详情 | 成功 | P1 |
| TC-G-08 | **跨租户查看课程** | A 查 B 的课程，**应 404/403** | P0 |
| TC-G-09 | **跨租户修改课程** | A 改 B 的课程，**应拒绝** | P0 |
| TC-G-10 | **跨租户删除课程** | A 删 B 的课程，**应拒绝** | P0 |
| TC-G-11 | 按课程 ID 删除 | 成功，额度释放 | P0 |
| TC-G-12 | 按模板删除课程 | 成功，额度按条数释放 | P1 |
| TC-G-13 | 课程状态变更 | 成功 | P1 |
| TC-G-14 | 课程表单数据 | 正常返回 | P2 |
| TC-G-15 | 课程按月统计 | 本租户数据 | P2 |
| TC-G-16 | 空课程名创建 | 按校验规则处理 | P2 |

### H 组：排期（TC-H，16 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-H-01 | 创建排期 | 成功，**schedule.tenant_id = 当前租户** | P0 |
| TC-H-02 | 排期冲突检测 | 冲突时拒绝 | P0 |
| TC-H-03 | 批量生成排期 | 成功，额度按条数占用 | P0 |
| TC-H-04 | 修改排期 | 成功 | P1 |
| TC-H-05 | 排期名额递增 | available_sites 正确变化 | P0 |
| TC-H-06 | 排期状态变更 | 成功 | P1 |
| TC-H-07 | 排期列表分页 | **仅本租户** | P0 |
| TC-H-08 | 按课程查排期 | 本租户该课程排期 | P1 |
| TC-H-09 | **跨租户查排期** | **应不可见** | P0 |
| TC-H-10 | **跨租户改排期** | **应拒绝** | P0 |
| TC-H-11 | 排期详情 | 成功 | P1 |
| TC-H-12 | 删除排期 | 成功，额度释放 | P0 |
| TC-H-13 | 按课程删排期 | 成功，额度按条数释放 | P0 |
| TC-H-14 | 排期异常日期 | 正常维护 | P2 |
| TC-H-15 | 公开可预约排期 | 白名单可匿名访问 | P0 |
| TC-H-16 | 分配学生到排期 | 成功 | P1 |

### I 组：预约与预约时段（TC-I，18 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-I-01 | 创建预约 | 成功，**booking.tenant_id = 当前租户** | P0 |
| TC-I-02 | 预约名额不足 | 拒绝"名额已满" | P0 |
| TC-I-03 | 重复预约 | 拒绝 | P0 |
| TC-I-04 | 预约列表分页 | **仅本租户** | P0 |
| TC-I-05 | **跨租户查预约** | **应不可见** | P0 |
| TC-I-06 | 按排期查预约 | 本租户数据 | P1 |
| TC-I-07 | 按状态查预约 | 正确过滤 | P1 |
| TC-I-08 | 预约详情 | 成功 | P1 |
| TC-I-09 | 修改预约 | 成功 | P1 |
| TC-I-10 | 变更预约状态 | 成功，名额正确回滚 | P0 |
| TC-I-11 | 取消预约 | 成功，释放名额 | P0 |
| TC-I-12 | 删除预约 | 成功 | P0 |
| TC-I-13 | 按排期删除预约 | 成功 | P1 |
| TC-I-14 | 创建预约时段 | 成功，**appointment.tenant_id = 当前租户** | P0 |
| TC-I-15 | 批量创建时段 | 成功 | P1 |
| TC-I-16 | 时段列表/分页 | **仅本租户** | P0 |
| TC-I-17 | 时段统计（按月/按天） | 本租户数据 | P2 |
| TC-I-18 | 按预约查时段 | 本租户数据 | P2 |

### J 组：教师信息（TC-J，12 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-J-01 | 新增教师资质 | 成功，**tenant_id 正确** | P0 |
| TC-J-02 | 修改教师资质 | 成功 | P1 |
| TC-J-03 | 删除教师资质 | 成功 | P1 |
| TC-J-04 | 资质分页查询 | **仅本租户** | P0 |
| TC-J-05 | 新增教师发布信息 | 成功，占用发布额度 | P0 |
| TC-J-06 | 发布信息列表 | **仅本租户** | P0 |
| TC-J-07 | 保存草稿 | 成功，不占用额度 | P1 |
| TC-J-08 | 发布（publish） | 成功 | P0 |
| TC-J-09 | 归档删除 | 成功，释放额度 | P0 |
| TC-J-10 | 公开信息查询 | 白名单可匿名访问 | P0 |
| TC-J-11 | 最新版本公开查询 | 正常 | P1 |
| TC-J-12 | 跨租户改教师信息 | **应拒绝** | P0 |

### K 组：额度闭环（TC-K，20 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-K-01 | 创建课程占用 | course_current +1 | P0 |
| TC-K-02 | 课程额度用尽 | 失败"课程数量已达套餐上限" | P0 |
| TC-K-03 | 删除课程释放 | -1，可再创建 | P0 |
| TC-K-04 | 批量删除按条数释放 | -N | P1 |
| TC-K-05 | 不限额租户不受限 | 全部成功 | P0 |
| TC-K-06 | 未配置套餐=不限额 | 不校验 | P1 |
| TC-K-07 | 平台身份不受限 | 成功 | P2 |
| TC-K-08 | 排期占用 | +1 | P0 |
| TC-K-09 | 排期释放 | -1 / -N | P0 |
| TC-K-10 | 学生注册占两维度 | user+1、student+1 | P0 |
| TC-K-11 | 教师注册占两维度 | user+1、teacher+1 | P0 |
| TC-K-12 | 用户总数超限 | 失败 | P0 |
| TC-K-13 | 教师名额超限 | 失败"教师注册名额已达套餐上限" | P0 |
| TC-K-14 | 学生名额超限 | 失败 | P1 |
| TC-K-15 | 教师发布占用 | +1 | P0 |
| TC-K-16 | 教师发布释放 | -1 | P0 |
| TC-K-17 | 并发占用不超卖 | 限额 20，20 并发恰好成功 20 | P0 |
| TC-K-18 | 额度不扣成负 | 保持 0 | P1 |
| TC-K-19 | 额度统计准确性 | current 与实际 count 一致 | P0 |
| TC-K-20 | 降级时额度校验 | 超限拒绝 | P0 |

### L 组：系统监视（TC-L，8 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-L-01 | 系统概览 | 返回 cpu/memory/disk/jvm/onlineUsers | P0 |
| TC-L-02 | 字段完整性 | 各子字段齐全 | P1 |
| TC-L-03 | 带宽字段说明 | netOutBytes=null，netNote 有说明 | P2 |
| TC-L-04 | 趋势查询 | 按时间正序 | P1 |
| TC-L-05 | 小时聚合 | 返回聚合记录 | P2 |
| TC-L-06 | 接口健康度 | QPS/错误率/P95/慢接口 Top10 | P0 |
| TC-L-07 | 手动采样 | 采样表新增记录 | P1 |
| TC-L-08 | 非平台被拒 | 403 | P0 |

### M 组：运行管理（TC-M，10 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-M-01 | 全租户用量分页 | 各维度用量与占比 | P0 |
| TC-M-02 | 单租户用量详情 | 6 维度 count/limit/percent | P0 |
| TC-M-03 | 占比计算 | 10/20 = 50% | P0 |
| TC-M-04 | 预警等级 | ≥80% → warn | P1 |
| TC-M-05 | 告警等级 | ≥95% → danger | P1 |
| TC-M-06 | 不限额标记 | unlimited，占比 0 | P1 |
| TC-M-07 | 环比数据 | 当前 - 上月，可正可负 | P0 |
| TC-M-08 | 无上月快照 | 环比 null 不报错 | P2 |
| TC-M-09 | 用量统计准确性 | 与库中实际条数一致 | P0 |
| TC-M-10 | 非平台访问限定 | 只能看自己 | P0 |

### N 组：运营统计（TC-N，8 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-N-01 | 平台总览 | 各指标齐全 | P0 |
| TC-N-02 | 本月新增租户 | 数值正确 | P0 |
| TC-N-03 | 本月退租数 | 软删除与退租均计入 | P0 |
| TC-N-04 | 租户增减趋势 | 12 个月数据 | P1 |
| TC-N-05 | 在线总数 | 与实际在线一致 | P0 |
| TC-N-06 | 各租户在线分布 | 分布正确 | P0 |
| TC-N-07 | 到期预警 | 阈值内租户出现 | P1 |
| TC-N-08 | 非平台被拒 | 403 | P0 |

### O 组：系统配置（TC-O，8 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-O-01 | 查询全部配置 | 10 项 | P1 |
| TC-O-02 | 按分组查询 | 仅该组 | P2 |
| TC-O-03 | 查询单项 | 返回详情 | P2 |
| TC-O-04 | 修改采样间隔 | 生效 | P0 |
| TC-O-05 | 修改保留天数 | 清理按新值 | P1 |
| TC-O-06 | 恢复默认值 | 恢复 | P1 |
| TC-O-07 | 非平台改配置 | 403 | P0 |
| TC-O-08 | 修改不存在配置 | 失败"配置项不存在" | P2 |

### P 组：在线统计（TC-P，6 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-P-01 | 登录写入会话 | status=1 | P0 |
| TC-P-02 | 请求续期 | last_active 更新（60s 节流） | P1 |
| TC-P-03 | 登出 | status=2 | P0 |
| TC-P-04 | 超窗不活跃 | 不计入在线 | P0 |
| TC-P-05 | 修改判定窗口 | 按新值判定 | P2 |
| TC-P-06 | 多租户分别计数 | 分布正确 | P0 |

### Q 组：审计日志（TC-Q，8 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-Q-01 | 操作写入审计 | 记录生成 | P0 |
| TC-Q-02 | **审计日志带 tenant_id** | 由 BaseMapper 写入，值等于操作者租户 | P0 |
| TC-Q-03 | created_at 有值 | 由切面赋值，非 null | P0 |
| TC-Q-04 | 失败操作记录 | resultStatus=fail + errorMsg | P1 |
| TC-Q-05 | 耗时统计 | costMs 合理 | P2 |
| TC-Q-06 | 按 logId 查询 | 正常返回 | P1 |
| TC-Q-07 | 动作类型枚举 | 正常返回 | P2 |
| TC-Q-08 | 匿名操作 | tenant_id 为 0 或 null，不报错 | P1 |

### R 组：定时任务（TC-R，6 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-R-01 | 指标采样 | 按配置间隔入库 | P0 |
| TC-R-02 | 小时聚合 | 生成上小时记录 | P1 |
| TC-R-03 | 月度快照 | 生成当月快照 | P0 |
| TC-R-04 | 额度对账 | 偏差被校正 | P0 |
| TC-R-05 | 历史清理 | 超期数据删除 | P1 |
| TC-R-06 | 关闭任务开关 | 全部停止 | P2 |

### S 组：数据隔离专项（TC-S，20 条）★核心

> 本组用于验证 L2/L3 是否实现。执行时**必须**用两个租户（A/B）的账号交叉操作，并在每步后用 SQL 核对 `tenant_id`。

| 编号 | 场景 | 操作步骤 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-S-01 | 课程写入租户 | U3 创建课程后查库 | `course.tenant_id` = 租户A 的 id | P0 |
| TC-S-02 | 排期写入租户 | U3 创建排期后查库 | `course_schedule.tenant_id` = A | P0 |
| TC-S-03 | 预约写入租户 | U4 创建预约后查库 | `booking.tenant_id` = A | P0 |
| TC-S-04 | 时段写入租户 | U4 创建时段后查库 | `appointment.tenant_id` = A | P0 |
| TC-S-05 | 模板写入租户 | U2 建课程模板后查库 | `course_template.tenant_id` = A | P0 |
| TC-S-06 | 教师资质写入租户 | U3 维护资质后查库 | `teacher_professional.tenant_id` = A | P0 |
| TC-S-07 | 教师发布写入租户 | U3 发布后查库 | `teacher_published_profile.tenant_id` = A | P0 |
| TC-S-08 | 评价/反馈/签到写入租户 | 分别操作后查库 | 对应表 tenant_id = A | P1 |
| TC-S-09 | 用户注册写入租户 | 注册后查库 | `user.tenant_id` = 请求租户 | P0 |
| TC-S-10 | 审计日志写入租户 | 操作后查库 | `audit_log.tenant_id` = A | P0 |
| TC-S-11 | 课程列表隔离 | A 登录后查课程列表 | 仅 A 的课程，无 B 的 | P0 |
| TC-S-12 | 排期列表隔离 | A 查排期 | 仅 A 的 | P0 |
| TC-S-13 | 预约列表隔离 | A 查预约 | 仅 A 的 | P0 |
| TC-S-14 | 时段列表隔离 | A 查时段 | 仅 A 的 | P0 |
| TC-S-15 | 用户列表隔离 | A 管理员查用户 | 仅 A 的用户 | P0 |
| TC-S-16 | 教师信息隔离 | A 查教师资质/发布 | 仅 A 的 | P0 |
| TC-S-17 | 跨租户按 ID 改 | A 用 B 的资源 ID 调修改 | 404 或 403，不得成功 | P0 |
| TC-S-18 | 跨租户按 ID 删 | A 用 B 的资源 ID 调删除 | 404 或 403 | P0 |
| TC-S-19 | 统计口径隔离 | A 的月度统计/数量统计 | 仅统计 A 的数据 | P0 |
| TC-S-20 | 平台视角可见全部 | U1 查询 | 可见所有租户数据 | P1 |

**配套校验 SQL（每条写入类用例执行后立即核对）**：

```sql
-- 各表 tenant_id 分布情况（应看到不同租户的 id，而非全是 0）
SELECT 'course' AS t, tenant_id, COUNT(*) FROM course GROUP BY tenant_id
UNION ALL SELECT 'course_schedule', tenant_id, COUNT(*) FROM course_schedule GROUP BY tenant_id
UNION ALL SELECT 'booking', tenant_id, COUNT(*) FROM booking GROUP BY tenant_id
UNION ALL SELECT 'appointment', tenant_id, COUNT(*) FROM appointment GROUP BY tenant_id
UNION ALL SELECT 'course_template', tenant_id, COUNT(*) FROM course_template GROUP BY tenant_id
UNION ALL SELECT 'user', tenant_id, COUNT(*) FROM `user` GROUP BY tenant_id
UNION ALL SELECT 'audit_log', tenant_id, COUNT(*) FROM audit_log GROUP BY tenant_id;

-- 若结果中除 0 外无其他值，说明 L2 写入层未实现
```

### T 组：并发与边界（TC-T，14 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-T-01 | 限额=0 | 视为不限 | P0 |
| TC-T-02 | 限额=1 创建第 2 个 | 拒绝 | P0 |
| TC-T-03 | 用量=限额 | 拒绝新增 | P0 |
| TC-T-04 | 并发创建课程（限额 20） | 恰好成功 20，不超卖 | P0 |
| TC-T-05 | 并发注册（名额 5） | 恰好 5 人成功 | P0 |
| TC-T-06 | 并发预约抢最后 1 个名额 | 仅 1 人成功 | P0 |
| TC-T-07 | 分页 pageNum=0/负数 | 不报错 | P2 |
| TC-T-08 | pageSize=1000 | 正常或受保护 | P2 |
| TC-T-09 | 超长字符串入参 | 正常入库或明确报错 | P2 |
| TC-T-10 | 特殊字符租户编码 | 正常，无 SQL 注入 | P1 |
| TC-T-11 | 空 body / 缺必填 | 400 校验提示 | P1 |
| TC-T-12 | 日期区间颠倒 | 不报错或明确提示 | P2 |
| TC-T-13 | 重复提交同一请求 | 幂等或明确拒绝 | P1 |
| TC-T-14 | 大数据量列表查询 | 分页正常，不超时 | P2 |

### U 组：回归（TC-U，14 条）

| 编号 | 场景 | 预期结果 | 级别 |
|---|---|---|---|
| TC-U-01 | 课程模板 CRUD | 正常 | P0 |
| TC-U-02 | 课程列表分页 | 正常 | P0 |
| TC-U-03 | 排期冲突检测 | 生效 | P1 |
| TC-U-04 | 预约流程 | 正常 | P0 |
| TC-U-05 | 教师资质维护 | 正常 | P1 |
| TC-U-06 | 教师公开页免登录 | 可匿名访问 | P0 |
| TC-U-07 | 签到/评价/反馈 | 正常 | P1 |
| TC-U-08 | 审计日志写入 | 记录完整含 tenant_id | P1 |
| TC-U-09 | 日志浏览页 | 正常 | P2 |
| TC-U-10 | 深链 `/booking?tid=xx` | 正常跳转 | P1 |
| TC-U-11 | **Mapper 去重回归** | 预约条件查询（selectByCondition）正常 | P0 |
| TC-U-12 | **Mapper 去重回归** | 预约按 ID 查询（BaseMapper.selectById）正常 | P0 |
| TC-U-13 | **Mapper 去重回归** | 排期 updateById / updateSites / updateStatus 正常 | P0 |
| TC-U-14 | 时区切换接口 | 正常 | P2 |

### V 组：术语表 sys_term（TC-V，57 条）★2026-09-02 新增功能专项

> 覆盖当日三项新功能：① sys_term 三级作用域术语表（平台/行业/租户，0 哨兵）；② language 多语言字段（ISO 639-1，默认 zh）；③ 标签词↔下拉选项词 key 前缀关联 + 管理页本组词汇快速切换。
> 关键设计：`sys_term` 在 `MyBatisPlusConfig.IGNORE_TABLES` 中，租户插件**不参与**该表，全部查询必须显式按 `industry_id + tenant_id` 过滤（TC-V-54 专项验证）。

#### V1 取词合并与三级回退（/term/map，8 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-01 | 平台词基础取词 | 租户无行业词/租户词时 GET `/term/map` | 返回平台作用域 (0,0) 的词表 | P0 |
| TC-V-02 | 行业词覆盖平台词 | 同 key 存在平台词+行业词，租户属于该行业 | map 中取行业词 | P0 |
| TC-V-03 | 租户词覆盖行业词 | 同 key 三级共存 | map 中取租户词（租户 > 行业 > 平台） | P0 |
| TC-V-04 | 租户词停用回退行业词 | 租户词 status=0，行业词存在 | map 中该 key 取行业词 | P0 |
| TC-V-05 | 行业词停用回退平台词 | 行业词 status=0，平台词存在 | map 中该 key 取平台词 | P1 |
| TC-V-06 | 唯一级别词被停用 | 某词仅一级存在且 status=0 | map 中**不含**该 key | P1 |
| TC-V-07 | 平台管理员取词 | platform_admin 调 `/term/map` | 仅返回平台词（无行业/租户级） | P1 |
| TC-V-08 | 租户未设置行业 | tenant.industry_id=0 或 null | 无行业级合并，仅平台+租户词，不报错 | P1 |

#### V2 多语言取词（lang 参数，6 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-09 | 指定语言取词 | 同 key 同作用域建 zh+en 两词条，`?lang=en` | 取 en 词条值 | P0 |
| TC-V-10 | 指定语言缺失回退 zh | 仅有 zh 词条，`?lang=en` | 取 zh 词条值 | P0 |
| TC-V-11 | zh 也缺失取任意语言 | 该作用域仅 en 词条，`?lang=ja` | 取 en 词条值（不返回空 key） | P2 |
| TC-V-12 | lang 空/缺省 | 不传 lang 或传空串 | 按 zh 处理 | P1 |
| TC-V-13 | lang 大小写归一 | `?lang=EN`、`?lang= En ` | 归一为 en，正常取词 | P2 |
| TC-V-14 | 语言回退与作用域优先级 | 租户仅有 zh 词、行业有 en 词，`?lang=en` | 取**租户 zh 词**（实现为作用域内先做语言回退 en→zh，作用域优先于语言，需实测确认语义是否符合预期） | P0 |

#### V3 词条新增/修改校验（10 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-15 | 平台管理员新增平台词 | platform_admin POST `/term/insert` industryId=0 | 成功；tenant_id=0、industry_id=0 | P0 |
| TC-V-16 | 平台管理员新增行业词 | insert industryId=行业id | 成功；tenant_id=0、industry_id=该行业 | P0 |
| TC-V-17 | 租户管理员新增词 | 租户 admin insert（不传 industryId） | tenant_id 强制为本租户、industry_id 自动取租户所属行业 | P0 |
| TC-V-18 | 传入作用域字段被强制归位 | 租户 admin 传他租户 tenantId；平台 admin 传 tenantId>0 | 租户词 tenant_id 仍为本租户；平台词 tenant_id=0（传入值被忽略） | P1 |
| TC-V-19 | 必填校验 | termKey 为空 / termName 为空 | 400"词条编码不能为空"/"显示词不能为空" | P0 |
| TC-V-20 | 同作用域同语言重复 key | 已有 (key,行业,租户,zh) 再插入同 key zh | 400"该作用域下同语言词条编码已存在" | P0 |
| TC-V-21 | 同 key 多语言共存 | 同 key 同作用域分别插 zh、en | 均成功（唯一键含 language） | P0 |
| TC-V-22 | 默认值 | 不传 language/termType/sortOrder/status | language=zh、termType=label、sortOrder=0、status=1 | P1 |
| TC-V-23 | 编码/作用域不可变更 | update 传 termKey/industryId/tenantId | 被忽略，仅生效 termName/termType/sortOrder/status/remark | P1 |
| TC-V-24 | 改语言撞唯一键 | 同作用域同 key 已有 en 词条，update 将 zh 词条 language 改为 en | 400"该作用域下同语言词条编码已存在" | P1 |

#### V4 权限与越权（7 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-25 | 租户管理员改平台词 | 租户 admin update 平台词 id | 403"您只能修改本租户的词条" | P0 |
| TC-V-26 | 租户管理员删他租户词 | 租户 A admin DELETE 租户 B 词条 id | 403"您只能删除本租户的词条" | P0 |
| TC-V-27 | 词条列表越权 | 租户 admin / 普通用户调 GET `/term/list` | 拒绝（仅 platform_admin） | P0 |
| TC-V-28 | 复制接口越权 | 租户 admin 调 POST `/term/copy` | 拒绝（仅 platform_admin） | P0 |
| TC-V-29 | 普通用户调管理接口 | teacher/student 角色调 insert/update/delete | 403 | P1 |
| TC-V-30 | map 接口开放度 | 任意登录角色 GET `/term/map` | 正常返回（前端渲染用） | P1 |
| TC-V-31 | 租户词列表隔离 | 租户 admin GET `/term/tenant/list` | 仅返回本租户词条，无平台/行业/他租户词 | P0 |

#### V5 状态流转与删除（5 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-32 | 停用词条 | POST `/term/{id}/status?status=0` | 成功；map 取词回退下一级 | P0 |
| TC-V-33 | 重新启用 | status=0 → status=1 | map 恢复取本级词 | P1 |
| TC-V-34 | 物理删除 | DELETE `/term/{id}` | 成功；数据库记录消失（非软删） | P0 |
| TC-V-35 | 删除后取词回退 | 删除租户词 | map 回退行业/平台词 | P1 |
| TC-V-36 | 操作不存在词条 | update/delete/status 传 id=999999 | 404"词条不存在" | P2 |

#### V6 行业词批量复制（/term/copy，6 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-37 | 正常复制 | from=A 行业 to=B 行业 | 返回统计 copied/skipped；新词条 industry_id=B、tenant_id=0、status=1、remark 标注来源 | P0 |
| TC-V-38 | 目标已有同 key 同语言 | B 行业已有相同 (key,lang) | 跳过不覆盖，计入 skipped | P0 |
| TC-V-39 | 目标仅同 key 不同语言 | B 行业有同 key 的 zh，源有 en | en 词条正常复制（按 key+language 判重） | P1 |
| TC-V-40 | 源=目标 | fromIndustryId=toIndustryId | 400"源与目标行业不能相同" | P2 |
| TC-V-41 | 源行业无词条 | from 指向空行业 | copied=0，message="源行业无词条可复制" | P2 |
| TC-V-42 | 复制后取词生效 | B 行业某租户调 `/term/map` | 复制来的行业词正确覆盖平台词 | P1 |

#### V7 前端 getOptions（选项词前缀关联，6 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-43 | 词表命中 | 词表存在 `courseType.oneOnOne` | 选项文案显示词表词 | P0 |
| TC-V-44 | 缺词回退默认文案 | 词表无对应 key | 显示 defaultText | P0 |
| TC-V-45 | 无 defaultText | 选项仅 value 无 defaultText 且缺词 | 回退显示 value | P2 |
| TC-V-46 | code 缺省 | 选项不传 code | 用 value 拼 key（`tagKey.value`） | P2 |
| TC-V-47 | 词表值为空串 | 词表中该 key="" | 回退默认文案（空串视为未配置） | P1 |
| TC-V-48 | 未登录/词表未加载 | SERVER_TERM_MAP=null | 使用本地行业字典 TERM_DICT 基底，行为同改造前 | P1 |

#### V8 前端管理页 admin-term.js（5 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-49 | 本组词汇下拉 | 编辑带前缀词（如 courseType.oneOnOne） | 模态框顶部出现「本组词汇」下拉，列出同作用域同前缀词条 | P0 |
| TC-V-50 | 下拉内容规范 | 检查下拉项 | 按 sortOrder 排序，含语言徽章 | P2 |
| TC-V-51 | 快速切换 | 下拉选中另一词条 | 编辑框重开并载入该词条数据 | P1 |
| TC-V-52 | 无前缀标签词 | 编辑普通标签词（如 course） | 不出现「本组词汇」下拉 | P1 |
| TC-V-53 | 编码只读与提示 | 编辑态 termKey 输入框；新增态 placeholder | 编辑时 readonly；placeholder 含 `courseType.oneOnOne` 示例；页面显示命名规范提示条 | P2 |

#### V9 隔离与回归（4 条）

| 编号 | 场景 | 操作 | 预期结果 | 级别 |
|---|---|---|---|---|
| TC-V-54 | sys_term 免租户插件 | 核对 MyBatisPlusConfig.IGNORE_TABLES；租户登录后跨作用域查询 | sys_term 查询不被自动追加 tenant_id 条件，作用域过滤全靠显式条件（走查+DB 日志验证） | P0 |
| TC-V-55 | 并发插入竞态 | 两请求并发插同 (key,作用域,语言) | 应用层校验竞态时由 DB 唯一键 uk(term_key,industry_id,tenant_id,language) 兜底，仅一条成功 | P2 |
| TC-V-56 | 未改造页面回归 | 访问尚未接入 getOptions 的旧页面 | 下拉文案与改造前完全一致（缺词回退默认） | P1 |
| TC-V-57 | 旧签名兼容 | 调用 getTermMap(tenantId) 单参重载 | 默认按 zh 取词 | P2 |

---

## 五、数据完整性校验脚本

测试执行过程中定期运行，用于快速定位 L2/L3 问题：

```sql
-- 1. 各业务表 tenant_id 写入情况（重点看是否只有 0）
SELECT 'course' t, tenant_id, COUNT(*) c FROM course GROUP BY tenant_id
UNION ALL SELECT 'course_template', tenant_id, COUNT(*) FROM course_template GROUP BY tenant_id
UNION ALL SELECT 'course_schedule', tenant_id, COUNT(*) FROM course_schedule GROUP BY tenant_id
UNION ALL SELECT 'booking', tenant_id, COUNT(*) FROM booking GROUP BY tenant_id
UNION ALL SELECT 'appointment', tenant_id, COUNT(*) FROM appointment GROUP BY tenant_id
UNION ALL SELECT 'teacher_professional', tenant_id, COUNT(*) FROM teacher_professional GROUP BY tenant_id
UNION ALL SELECT 'teacher_published_profile', tenant_id, COUNT(*) FROM teacher_published_profile GROUP BY tenant_id
UNION ALL SELECT 'user', tenant_id, COUNT(*) FROM `user` GROUP BY tenant_id
UNION ALL SELECT 'audit_log', tenant_id, COUNT(*) FROM audit_log GROUP BY tenant_id
ORDER BY t, tenant_id;

-- 2. 租户套餐的 current 与实际 count 是否一致（额度漂移检查）
SELECT p.tenant_id, p.course_current,
       (SELECT COUNT(*) FROM course c WHERE c.tenant_id = p.tenant_id) AS real_course
FROM sys_tenant_package p;

-- 3. 会话表在线记录
SELECT tenant_id, status, COUNT(*) FROM sys_user_session GROUP BY tenant_id, status;

-- 4. 系统配置生效情况
SELECT config_key, config_value FROM sys_system_config ORDER BY config_group, id;
```

---

## 六、执行跟踪表

| 组 | 用例数 | 已执行 | 通过 | 失败 | 阻塞 | 负责人 | 完成日期 |
|---|---|---|---|---|---|---|---|
| A 租户管理 | 16 | | | | | | |
| B 套餐模板 | 10 | | | | | | |
| C 租户套餐 | 16 | | | | | | |
| D 登录鉴权 | 15 | | | | | | |
| E 权限越权 | 20 | | | | | | |
| F 用户注册 | 15 | | | | | | |
| G 课程模板 | 16 | | | | | | |
| H 排期 | 16 | | | | | | |
| I 预约时段 | 18 | | | | | | |
| J 教师信息 | 12 | | | | | | |
| K 额度闭环 | 20 | | | | | | |
| L 系统监视 | 8 | | | | | | |
| M 运行管理 | 10 | | | | | | |
| N 运营统计 | 8 | | | | | | |
| O 系统配置 | 8 | | | | | | |
| P 在线统计 | 6 | | | | | | |
| Q 审计日志 | 8 | | | | | | |
| R 定时任务 | 6 | | | | | | |
| S 数据隔离★ | 20 | | | | | | |
| T 并发边界 | 14 | | | | | | |
| U 回归 | 14 | | | | | | |
| V 术语表★新增 | 57 | | | | | | |
| **合计** | **293** | | | | | | |

---

## 七、已知缺陷汇总

| 编号 | 缺陷 | 严重度 | 关联用例 | 状态 |
|---|---|---|---|---|
| BUG-01 | **业务数据写入时不赋值 tenant_id**，全部落为 0 | 阻断 | TC-S-01~10 | **已修复**（TenantMetaObjectHandler 自动填充） |
| BUG-02 | **查询无租户过滤**，可跨租户查看/修改/删除 | 阻断 | TC-S-11~19 | 已确认已修复（MyBatisPlusConfig 已配 TenantLineInnerInterceptor，此前漏判） |
| BUG-03 | 额度统计按 tenant_id 计算，因数据全为 0 导致恒为 0，额度限制失效 | 严重 | TC-K-19 | **已修复**（随 BUG-01 一并解决） |
| BUG-04 | 登录不校验用户归属，可跨租户登录 | 严重 | TC-D-06 | **已修复**（login 校验 user.tenantId，不符时返回"账号不存在"避免账号枚举） |
| BUG-05 | 登录不校验租户 deleted，已删除租户仍可登录 | 严重 | TC-D-05 | **已修复**（authController 同时校验 deleted 与 status，并消除 NPE 风险） |
| BUG-12 | 登录查询被租户插件过滤，查不到用户导致**无法登录** | 阻断 | TC-D-01/02 | **已修复**（selectByAccount 加 @InterceptorIgnore，归属改由业务显式校验） |
| BUG-13 | 注册账号查重被插件过滤，导致账号可重复注册 | 严重 | TC-F-04 | **已修复**（查重前先设置租户上下文，改为租户内唯一） |
| BUG-14 | 存量用户 tenant_id=0，租户内查不到且登录受阻 | 严重 | TC-S-09 | **已缓解**（存量账号首次登录自动归属当前租户，并打告警日志） |
| BUG-06 | 注册接口在白名单无租户上下文，注册用户 tenant_id=0 且绕过额度 | 严重 | TC-F-08 | **已修复**（注册入参带 tenantCode，Register 解析并设上下文） |
| BUG-07 | 平台管理员查询拼出 `tenant_id = NULL`，查不到任何数据 | 阻断 | TC-E-01、TC-S-20 | **已修复**（ignoreTable 短路代替 NullValue） |
| BUG-08 | 定时任务无租户上下文，插件拼兜底条件导致统计恒为 0，对账会误清额度 | 严重 | TC-R-03/04 | **已修复**（遍历租户时显式 setTenantId） |
| BUG-09 | 审计日志 tenant_id 为 NULL 导致注册报错 | 阻断 | TC-Q-02 | **已修复**（AuditAspect 兜底 + 自动填充） |
| BUG-10 | 网卡带宽无法采集（JDK 限制） | 轻微 | TC-L-03 | 已知限制 |
| BUG-11 | 接口健康度全量拉取审计日志，数据量大时可能变慢 | 一般 | TC-L-06 | 观察 |

> 说明：BUG-02 此前判定为"未实现"是漏看了 `MyBatisPlusConfig` 中已配置的租户插件，实际查询侧隔离是生效的；
> 真正的缺口在写入侧（BUG-01）与平台管理员短路方式（BUG-07）。
>
> **当前状态：BUG-01 ~ BUG-14 全部已修复或已缓解**，无阻断项遗留。
> 剩余观察项：BUG-10（网卡带宽，JDK 限制）、BUG-11（接口健康度性能）。
>
> 后续仍建议关注：
> 1. **存量数据归属**：BUG-14 靠"首次登录自动归属"兜底，若存量账号长期不登录，租户内仍看不到；
>    建议上线前用脚本按业务规则批量修正 `user.tenant_id`，并核对各业务表的 0 值数据。
> 2. **前端改造**：注册/登录页需携带 `tenantCode`，否则自助注册与租户端登录都会失败。

---

## 八、缺陷记录模板

```
【缺陷编号】BUG-SaaS-XXX
【模块】租户/套餐/用户/课程/排期/预约/教师/监控/审计
【标题】
【严重程度】阻断 / 严重 / 一般 / 轻微
【优先级】P0 / P1 / P2
【环境】Win10 / JDK17 / MySQL8 / 版本或 commit
【前置条件】
【复现步骤】1. 2. 3.
【实际结果】
【期望结果】
【数据库核对】SELECT ... （tenant_id 实际值）
【截图/日志】
【影响范围】
【关联用例】TC-X-NN
```

---

## 九、执行建议

1. **先跑 S 组（数据隔离专项）**：20 条用例能在半小时内判定多租户移植是否真正完成。若 S 组大面积失败，应先停下来补 L2/L3 改造，其余用例可暂缓。
2. **BUG-01~03 修复后需重跑**：K 组（额度）、M 组（运行管理）的预期依赖正确的 tenant_id。
3. **D/E 组配合做**：登录与越权用例一起执行，能同时覆盖 BUG-04/05/06。
4. 每轮执行后运行第五章的校验 SQL，快速确认数据层面是否符合预期。
5. **V 组（术语表）执行要点**：先跑 TC-V-01~03/09~10 打通三级回退与多语言主链路，再做 V4 越权组。代码走查发现的观察项（非缺陷，执行时留意）：
   - `language` 入库仅做 trim+小写归一，**未校验 ISO 639-1 合法性**（如 `"chinese"` 可入库，将永远取不到词）——建议执行时构造 TC-V-22 变体验证并评估是否加白名单；
   - `/term/{id}/status` 的 status 参数**无非法值校验**（如 5 可直接入库）；
   - TC-V-14 的"作用域内语言回退"语义（租户 zh 词压过行业 en 词）是否为设计意图，建议执行前与产品确认。
