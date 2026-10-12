# 项目长期记忆

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测(仍要编译验证)。
- 改动已有校验先摆事实与选项让用户拍板；分步推进+保留既有实现（双层并行）。
- 库内数据都是测试数据：只诊断不清理。

## 守卫（14 道，pre-commit 门禁；反向测试须证真会红）
| 领域 | npm | 领域 | npm |
|---|---|---|---|
| 授权 | check:authz | 调度池 | check:scheduler |
| 引用完整性 | check:cascade | Actuator | check:actuator |
| DDL | check:ddl-align | 租户跨线程 | check:tenant-xt |
| 时区 | check:tz | 密钥注入 | check:secret-env |
| 端点常量 | check:endpoints | 错误响应契约 | check:result-contract |
| 前端全局作用域 | check:global-collide | JSON日期契约 | check:date-contract |
| 跨端状态契约 | check:status-contract | itest快照同步 | check:itest-sut |

跳过后缀：`SKIP_<领域大写>`（如 SKIP_RESULT_CONTRACT）。改权威源必跑反向测试。
反向测试模式：不用 spawnSync（本机 node 子进程 EBUSY），用同进程 import(url+'?t=rand') + 拦 process.exit；变异串行 + 结束 md5 逐字节校验防污染。

## 第6批契约治理（2026-10-09/10 落地）
- `Result.code` 是 primitive int（api+msg）；`fail()` 白名单 {200,400,401,403,404,409,500,1001}；fail 入参刻意保持 Integer 让 fail(null) 编译过再被拦。`ErrorCodes.java` 按异常语义给码，须与 GlobalExceptionHandler 一致（守卫④）。**fail(200) 已列禁形（守卫②拦，白名单保留 200 是既有设计）**。
- `JacksonConfig`：LocalDateTime 手写序列化器 `format(fmt)+"Z"`（**withZone(UTC) 对 LocalDateTime 无效**，实测）。不做二次 UTC 转换。
- **29-b 方案 A（2026-10-10 用户拍板落地）**：`ResultHttpStatusAdvice`（api+msg 各一）按 Result.code 映射 HTTP 状态，**只映射 400/404/409/500**；401/403 保持 HTTP 200（业务层 401/403 大量存在且非鉴权问题，全量映射会触发小程序刷新/踢登录=复现"刚登录被弹回登录页"）；1001/200 同样保持 200。真鉴权 401/403 由 Security/JwtFilter 过滤器层直出，不过该出口。守卫⑤校验四个 case 在、401/403 禁出现。
- **文案策略（2026-10-10 用户拍板"两端都保留真实文案"）**：HTTP 级错误两端都**优先读 body 的 message/msg**，固定文案仅兜底（401 分支例外：frontend 清态跳转路径保持固定文案）。落点 frontend `utility_request.js` ④ 号分支 + 小程序 `request.js`；Security 过滤器层 401/403 JSON 也用 `message` 字段，bodyMsg 优先对它同样成立。
- `Result.success(失败文案)` 已全部收口（2026-10-10 P0-1，13 处改 fail(400/404)）：B 类 CourseController:111/129/144 改 fail 时**必须同步修前端消费**——`admin-course.js` 的 `res!=""` 判定已改 `res===true`（`null != ""` 为 true 会把失败误判成「编辑成功」），`updateORCreateCourse`/`datamaintain_delete.js` catch 已改为优先展示 `err.message` 真实文案。
- 状态契约是登记式（status-contract.json，理由≥20字）；前端 NON_OCCUPYING 多 'deleted' 是有意防御项。
- itest `_sut*` 是运行时 cpSync 生成（已 gitignore 不入库）；cpSync 只覆盖不删除 → harness 已改先 rmSync 再 cpSync；守卫 check:itest-sut 钉住（扫 .git/index 二进制查跟踪，**守卫禁用 spawnSync——本机 EBUSY**）。

## 小程序/前端铁律（精选）
- 前端顶层标识符必须包 IIFE（全局词法冲突=解析期全崩）；内联 onclick 的函数必须挂 window。
- WXML 绑定禁止函数调用（编译期静默渲染成空）。
- 两端拦截器语义（frontend=权威定义）：HTTP 401→刷新 token 重试（公开页 noAuthRedirect 短路）；403→只提示不踢；HTTP 200 下 body.code 200→data、401/403→resolveResult 提示+reject（不清会话）、其他→reject。小程序 request.js 已对齐（2026-10-10）。
- 文案差异是拍板事实：小程序「预订」/Web「预定」；bookingStatusText 带 profile 参数。
- 改 shared/apiPaths.js 必重跑 gen-shared-bridge + sync-miniprogram-shared + check-shared-sync + frontend/build.js。
- **消息中心展示映射唯一权威源 = `shared/domain/message.js`**（2026-10-12 下沉，用户拍板双端共用）：`categoryText/priorityCode/priorityText/senderTypeText/categoryListFromTree/collectCategoryCodes` + 分类字典；Web 经桥接 `window.MessageDomain` 用，小程序 `core/message.js` 只 import + re-export 转发。新增优先级档位/发送者类型只改这一处。**改 shared/domain/*.js 同样要走上面那条 sync+桥接+build 四步**。
- **发送者账号可见范围按角色收敛（两端一致）**：管理员走 `/user/page?userId=`（name+account），学生/教师走 `/user/name/{id}`（仅姓名，挡 `'N/A'` 字面量），system 不发请求；web 端这些调用必须走 `areq`（8081），不能走 message-service 的 `mreq`（8090）。web `areq` 支持 `config.__silent`（失败不弹提示，供增强信息用）。
- 已知待修（用户已拍板维持）：收件箱列表后端 `composeInbox` 不填 `senderType/senderName` → web 列表「来自」恒「系统」；前端已写成「有 senderType 优先」的兼容形态。
- **已知缺陷未修（2026-10-12 报用户，待其拍板）**：平台管理员发给租户用户时 `msg.tenant_id=0` 落进对方 `msg_inbox.tenant_id=0`，而租户用户侧 `scopedWrapper` 强制拼 `tenant_id=本租户`、`assertAccess` 判 `0≠本租户` → **平台→租户用户的通知在租户端列表看不到、详情 404**（真库现存 7 行受影响：rcpt_tenant 1/2/3 分别 2/2/1 条，sender 均为 platform_admin）。
- **「已发」详情接收人列表（2026-10-12）**：明细 `MSG_RECIPIENTS_OF(mid,{pageNum,pageSize,readState})`（message-service，只回 userId+投递/已读状态，每页 20，未读优先）；姓名/账号 `USER_BRIEFS(ids)`（主系统，≤200 去重，**account 仅管理员**，**必须走 areq/8081**）。新增 `/api/v1/user/*` 单数前缀端点**必须在 AuthzRules 登记**（不在 message-service 排除名单里）。后端时间出参统一 `LocalDateTime.toString()`（无 Z）—— 改成带 Z 前端会按 UTC 解读、偏 8 小时。
- **「发送方租户」口径（2026-10-12，仅消息详情页、仅平台管理员）**：`msg_message.tenant_id` 发送时取自**发送者**令牌租户，写扩散原样落到 `msg_inbox.tenant_id` → **该列语义 = 发送方租户**（非接收方租户，别当收件人隔离依据）。详情接口回 `senderTenantId`；公司名靠 `TENANT_LIST`（`/api/v1/tenant/list`，PLATFORM_ONLY）建 `tenantId→orgName` 字典：`shared/domain/message.js` 的 `setTenantDict/getTenantDict/tenantText`，**`tenantText` 无兜底文案**（空/≤0/查不到一律空串 → 调用方省略整行）。
- 小程序表单页写库前 4 项：NOT NULL 无默认列须显式给值；tinyint(1) ≤127；表级 CHECK 前端先拦；数值输入字符串承载。

## 业务要点（精选）
- **授权（2026-10-10 P1 全收口）**：SecurityConfig 兜底已切 `denyAll()`（两步策略走完，漏声明=运行期 403）；方法级 PermissionCheck 补齐 AuditLog/DataMaintain/log/Booking/TeacherProfessional/TimezoneCalc 六个 Controller（新增 `checkAnyLogin` 对齐 ALL_ROLES，**勿用 checkAnyLogin 替代 checkTeacherOrAdmin**——后者禁学生）；course /list|/page|/{courseid} 三端统一 checkAnyLogin（原 /list 的 checkTeacherOrAdmin 会把学生浏览课程打成 403，既存缺陷已修）。
- 课次 UTC 化：排期=本地墙钟+time_zone（不动）；appointment=UTC 唯一真相源；转换只经 ScheduleGenerator 三入口；可见文本出口 utcToZonedText（空时区整句省略，不降级 UTC）。
- 状态前缀：`s-`学生/`t-`教师课次级/无前缀整单级；t- 被"申请改期"占用，整单取消禁用 t-。
- booking→appointment 联动单一实现 BookingAppointmentSyncService，仅 booked 生成课次。
- 课次生成幂等：存在仍生效课次则不重建。候补/名额：排期行锁+锁定读计数+CAS。
- 消息中心红线：绝不可单独 DELETE 主消息；message-service 无租户插件，隔离靠显式 tenantId。
- JWT HS512：测试 token 的 sub 必须真实 user_id；JWT_SECRET 服务器侧 ≥64 字节。

## 技术栈/构建/排障（精选）
- api(Spring Boot 3.3.5+MP 3.5.7)+message-service(8090)；8080=dev代理、8081=booking API。编译：bash build_smoke.sh compile；改前端必重 node frontend/build.js。
- 本机后台 java 会被回收 → 端到端验证用 jar 内 BOOT-INF classpath 跑独立 main；测 Spring 行为从 jar 解 class。
- mysqldump 必须 --result-file=；改表结构后重 dump 落 api/sql/schema/。DDL 命名 YYYYMMDD-HHMM-<库>-<用途>.sql。本机 mysql 密码 123456。
- **跨库 JOIN 坑**：`lesson_appointment`(utf8mb4_general_ci) 与 `message_center`(utf8mb4_0900_ai_ci) collation 不同，直接 `join ... on user_id = user_id` 报 `ERROR 1267 Illegal mix of collations`；必须 `u.user_id collate utf8mb4_general_ci = i.user_id collate utf8mb4_general_ci`。
- Spring 占位符：env 名须与属性名词根一致（JWT_SECRET→jwt.secret ✅；CRYPTO_AESKEY ❌）。bash 4.2 兼容（${arr[@]+...}）。
- Git Bash taskkill 需 MSYS_NO_PATHCONV=1；本机 curl 探针须 --noproxy '*'；异常堆栈去 api/logs/spring-boot-app.log。
- 守卫编写坑：stripComments 后判逻辑；禁形清单"命中即return"顺序即优先级；正则认数组注解与常量引用；行尾 CRLF/LF 探测后替换并 grep 核验；误报比漏报更伤信任。
