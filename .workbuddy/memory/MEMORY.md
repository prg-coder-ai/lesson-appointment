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
- mysqldump 必须 --result-file=；改表结构后重 dump 落 api/sql/schema/。DDL 命名 YYYYMMDD-HHMM-<库>-<用途>.sql。
- Spring 占位符：env 名须与属性名词根一致（JWT_SECRET→jwt.secret ✅；CRYPTO_AESKEY ❌）。bash 4.2 兼容（${arr[@]+...}）。
- Git Bash taskkill 需 MSYS_NO_PATHCONV=1；本机 curl 探针须 --noproxy '*'；异常堆栈去 api/logs/spring-boot-app.log。
- 守卫编写坑：stripComments 后判逻辑；禁形清单"命中即return"顺序即优先级；正则认数组注解与常量引用；行尾 CRLF/LF 探测后替换并 grep 核验；误报比漏报更伤信任。
