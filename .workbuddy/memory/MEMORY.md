# 项目长期记忆

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测(仍要编译验证)。
- 改动已有校验先摆事实与选项让用户拍板；分步推进+保留既有实现（双层并行）。
- 库内数据都是测试数据：只诊断不清理。

## 守卫（15 道，pre-commit 门禁；反向测试须证真会红）
| 领域 | npm | 领域 | npm |
|---|---|---|---|
| 授权 | check:authz | 调度池 | check:scheduler |
| 引用完整性 | check:cascade | Actuator | check:actuator |
| DDL | check:ddl-align | 租户跨线程 | check:tenant-xt |
| 时区 | check:tz | 密钥注入 | check:secret-env |
| 端点常量 | check:endpoints | 错误响应契约 | check:result-contract |
| 前端全局作用域 | check:global-collide | JSON日期契约 | check:date-contract |
| 跨端状态契约 | check:status-contract | itest快照同步 | check:itest-sut |
| **桥接导出对齐** | **check:bridge-exports** | | |

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
- **✅已修（2026-10-12 方案 C 落地，message-service 编译通过）——收件箱误用发送方租户过滤**：根因 `InboxService.scopedWrapper` 曾拼 `user_id=me AND tenant_id=本租户`，而 `msg_inbox.tenant_id` 语义是**发送方租户** → 平台方发出（tenant_id=0）的消息在租户用户的列表/详情/未读数里全消失（真库 13 行 / 9 用户，全部未读）。**修法**：① `scopedWrapper` 只按 userId（唯一键 `uk_user_msg(user_id,message_id)` 本就不含 tenant_id；同一 userId 的行跨多个 tenant_id 值，租户2某 admin 874 行跨 {0,2}）；② `assertUserScope` 与 `assertAccess` 的边界**统一收敛为 `self || platform_admin`**（原 `isManager` 允许租户 admin 代查他人，而这正是原先 tenant_id 过滤在"顺便"挡的东西——但挡法本身也是错的：会漏行又拦不住跨租户）；③ SSE `key` 只按 userId（原先订阅用订阅者租户、推送用发送方租户，两侧 key 不同 → 平台→租户用户推送静默丢弃）。
- **行为变化（需知）**：**租户管理员代查他人收件箱现在 403**（两端 UI 经核查无此入口，全部传本人 uid）。若将来要恢复，需让 `/user/briefs` 回 `tenantId`（该接口至今不回租户，见下条）或写扩散新增 `owner_tenant_id`（接收方租户）。
- `msg_inbox.tenant_id` 仍保留写入；它在**发送方语义**上的用法是对的（如 `composeInbox` 用 `getCategoryByCode(code, in.getTenantId())` 找分类名——发送者用自己租户的分类发消息），**只有"接收人过滤"是误用**。
- **「已发」详情接收人列表（2026-10-12）**：明细 `MSG_RECIPIENTS_OF(mid,{pageNum,pageSize,readState})`（message-service，只回 userId+投递/已读状态，每页 20，未读优先）；姓名/账号 `USER_BRIEFS(ids)`（主系统，≤200 去重，**account 仅管理员**，**必须走 areq/8081**）。新增 `/api/v1/user/*` 单数前缀端点**必须在 AuthzRules 登记**（不在 message-service 排除名单里）。后端时间出参统一 `LocalDateTime.toString()`（无 Z）—— 改成带 Z 前端会按 UTC 解读、偏 8 小时。
- **★同作用域重复函数声明 → 静默覆盖（2026-10-12 诊断并修复）**：web `messages-inbox.js` 的 IIFE 顶层曾有**两个 `function loadRecipients`**（738 详情版 / 1158 发送卡片版），JS 同作用域重复函数声明**后者覆盖前者** → 682 行调用实际走发送卡片版 → 读不存在的 `#msg-scope` 抛 TypeError（裸调用无 catch，只在 console 留 unhandled rejection）→ **「已发」详情接收人列表 web 端恒空**；`recState/renderRecipients` 从未执行。**小程序端无此问题**（Page 内唯一）。**A 方案已落地**：发送卡片版改名 `loadScopeRecipients`（调用点 1110/1119 同步），详情版保留 `loadRecipients`；两者 DOM 归属互相隔离（`#msg-recipients` vs `#msg-scope/#msg-rcpt-list/#msg-tenant-id`），`frontend/build.js` 已重建 dist。**教训：`node --check` 与 `check:global-collide` 都拦不住这类（前者合法语法、后者只扫顶层全局标识符）——新写同文件同名函数前先查重名；小程序 Page 对象重复方法键同理静默覆盖。**
- **「发送方租户」口径（2026-10-12，仅消息详情页、仅平台管理员）**：`msg_message.tenant_id` 发送时取自**发送者**令牌租户，写扩散原样落到 `msg_inbox.tenant_id` → **该列语义 = 发送方租户**（非接收方租户，别当收件人隔离依据）。详情接口回 `senderTenantId`；公司名靠 `TENANT_LIST`（`/api/v1/tenant/list`，PLATFORM_ONLY）建 `tenantId→orgName` 字典：`shared/domain/message.js` 的 `setTenantDict/getTenantDict/tenantText`，**`tenantText` 无兜底文案**（空/≤0/查不到一律空串 → 调用方省略整行）。
- **「消息管理」= 发送台账，与收件箱是两套口径（2026-10-12 核查）**：`MessageManageService.pageMessages` 按 `msg_message.tenant_id=本租户` 过滤 → 因该列=发送方租户，租户管理员看到的是「**本租户发出的**消息」，看不到平台发出的（真库平台 25 条 / 租户2 1145 条 / 租户3 8 条），作为发送台账语义正确；平台管理员跨租户全量（tenantId 入参仅 >0 生效）。`assertManagerOrSender` 保留 `非平台管理员 && 租户≠msg.tenant_id → 403`。**消息管理不经过 `InboxService.scopedWrapper/assertUserScope`**，本轮收件箱修复对其无影响；受影响的是 SSE（彻底删除/收回推送现按 userId 路由 → 平台删跨租户消息的通知不再静默丢失）。web `admin-messageManage.js` 详情只有计数无接收人列表（小程序 manage 详情有）→ 两端不对称。
- 小程序表单页写库前 4 项：NOT NULL 无默认列须显式给值；tinyint(1) ≤127；表级 CHECK 前端先拦；数值输入字符串承载。

## 业务要点（精选）
- **授权（2026-10-10 P1 全收口）**：SecurityConfig 兜底已切 `denyAll()`（两步策略走完，漏声明=运行期 403）；方法级 PermissionCheck 补齐 AuditLog/DataMaintain/log/Booking/TeacherProfessional/TimezoneCalc 六个 Controller（新增 `checkAnyLogin` 对齐 ALL_ROLES，**勿用 checkAnyLogin 替代 checkTeacherOrAdmin**——后者禁学生）；course /list|/page|/{courseid} 三端统一 checkAnyLogin（原 /list 的 checkTeacherOrAdmin 会把学生浏览课程打成 403，既存缺陷已修）。
- 课次 UTC 化：排期=本地墙钟+time_zone（不动）；appointment=UTC 唯一真相源；转换只经 ScheduleGenerator 三入口；可见文本出口 utcToZonedText（空时区整句省略，不降级 UTC）。
- 状态前缀：`s-`学生/`t-`教师课次级/无前缀整单级；t- 被"申请改期"占用，整单取消禁用 t-。
- booking→appointment 联动单一实现 BookingAppointmentSyncService，仅 booked 生成课次。
- 课次生成幂等：存在仍生效课次则不重建。候补/名额：排期行锁+锁定读计数+CAS。
- 消息中心红线：绝不可单独 DELETE 主消息；message-service 无租户插件，隔离靠显式 tenantId。
- **接收台账 `/api/v1/msg-ledger/*`（2026-10-12 新增，落在主系统 api 而非 message-service）**：解决「平台发给本租户用户」这类消息在租户侧完全不可见的问题——`/inbound`（列表，pageNum/pageSize/readState/messageId/tenantId）+ `/inbound/{mid}/recipients`（明细，未读优先）。用 `JdbcTemplate` 原生 SQL 跨 schema 只读聚合（`msg_message`/`msg_delivery`/`msg_inbox` ⋈ `lesson_appointment.user`，**`u.user_id = d.user_id COLLATE utf8mb4_general_ci`**；不用 MP 是因为 msg 表的 `tenant_id` 会被租户插件误加条件）。口径：**仅 `m.tenant_id = 0`（平台方发出）**；接收方租户**只能**取 `user.tenant_id`（msg 三表的 tenant_id 全是发送方租户）；平台管理员可空/指定租户，**租户管理员强制本租户**（`cur<=0` 抛 IllegalStateException → 403）。`readState` 判 `COALESCE(i.is_read,0)`，排序 `COALESCE(i.is_read,0) ASC, d.delivery_id ASC`。**时间出参必须在 SQL 层 `DATE_FORMAT(...,'%Y-%m-%dT%H:%i:%s')` 产裸串**（主系统 JacksonConfig 会给 LocalDateTime 补 Z，否则前端按 UTC 解读偏 8 小时）。AuthzRules 需登记 `PLATFORM_OR_TENANT_ADMIN`。`withdrawn` = `recalled` 的**历史同义值**（DDL 注释词汇表原文 `sent/withdrawn(已撤回)`，代码从未写过；真库 3 行 send_time==update_time），文案归一「已收回」、后端筛选并入 recalled 的 IN 集合。
- **送信写扩散 = 接收方列表的唯一保存方式（2026-10-12 复核）**：`MessageService.sendToUsers`/`broadcast` 落 **1 条 `msg_message` + 每接收人 1 条 `msg_inbox`(folder=inbox, isRead=0, isStarred=0, isDeleted=0) + 1 条 `msg_delivery`(deliveryStatus=1, channel=rest, deliveryTime=now)**——**没有「接收人列表」字段**，列表就是这两张子表的行（recipients 去重：null/blank 过滤 + distinct）。读侧：`msg_delivery` 是**驱动表**（`orderByAsc(deliveryId)` 定序、未读优先靠**稳定排序**保组内序），`msg_inbox` 按本页 userId **一次 IN 回捞**（无 N+1）。「已发」列表按 `sender_id=当前用户`（非平台管理员再拼本租户）查 `msg_message`，计数 `recipientCount=count(msg_delivery)`、`readCount=count(msg_inbox where isRead=1 and isDeleted=0)`、`recallable=recipientCount>readCount`。**已读唯一真相源 = `msg_inbox.is_read`**（打开详情时 `InboxService.setRead` 写 isRead+readTime，**不写 msg_delivery**）；`delivery_status` 只管投递：1=已投递(发送时)、2=客户端 `ack`、3=失败（**撤回未读副本时也置 3**，前端据此显示「已撤回」）。撤回只动未读副本（isDeleted=1 + folder=trash、delivery 置 3、status→recalled/partial_recalled），已读的不动；`deleteMessageGlobal` 才三表全删（先收集 uid 推 SSE 再删）。
- **接收人 userId 可拼装性（2026-10-12 真库分析）**：`user.account` **明文** varchar(255) NOT NULL（`student165`/`admin@TENANT_B`），**`user.name` 才加密**（hex）；`CryptoUtil.decrypt` 对非加密格式**原样返回**，故 `briefs` 里 decrypt(account) 安全；account 的可见性限制在**权限层**（`userBriefs` 的 `withAccount` 仅 admin/platform_admin），非数据层。租户名链路 `userId → user.tenant_id → sys_tenant.id → org_name`，sys_tenant 现有 id 1/2/3/4/10/11（倍嘉律师事务所/高才嘉培/英才大厦/五人行健身俱乐部/默认机构/平台自身），**无 id=0**。msg_delivery 全量 11304 行：匹配用户 11270、有账号 11270；**所属租户口径可拼 11207**（盲区 = 孤儿 userId 34 行 + **`user.tenant_id=0` 的 63 行**）；**发送方租户口径（`msg_delivery.tenant_id`）可拼 11253**（盲区仅发送方=0 的 51 行）；**77 行跨租户投递**（接收人租户≠发送方租户）。**接口缺口：`MSG_RECIPIENTS_OF` 与 `/user/briefs` 都不回 tenantId** → 租户名在库里但出不来；修法：briefs 多回 `tenantId`（复用 `tenantText`+`/tenant/list` 字典）或直接回 `orgName`。
- JWT HS512：测试 token 的 sub 必须真实 user_id；JWT_SECRET 服务器侧 ≥64 字节。

## 技术栈/构建/排障（精选）
- api(Spring Boot 3.3.5+MP 3.5.7)+message-service(8090)；8080=dev代理、8081=booking API。编译：bash build_smoke.sh compile；改前端必重 node frontend/build.js。
- 本机后台 java 会被回收 → 端到端验证用 jar 内 BOOT-INF classpath 跑独立 main；测 Spring 行为从 jar 解 class。
- mysqldump 必须 --result-file=；改表结构后重 dump 落 api/sql/schema/。DDL 命名 YYYYMMDD-HHMM-<库>-<用途>.sql。本机 mysql 密码 123456。
- **跨库 JOIN 坑**：`lesson_appointment`(utf8mb4_general_ci) 与 `message_center`(utf8mb4_0900_ai_ci) collation 不同，直接 `join ... on user_id = user_id` 报 `ERROR 1267 Illegal mix of collations`；必须 `u.user_id collate utf8mb4_general_ci = i.user_id collate utf8mb4_general_ci`。
- Spring 占位符：env 名须与属性名词根一致（JWT_SECRET→jwt.secret ✅；CRYPTO_AESKEY ❌）。bash 4.2 兼容（${arr[@]+...}）。
- Git Bash taskkill 需 MSYS_NO_PATHCONV=1；本机 curl 探针须 --noproxy '*'；异常堆栈去 api/logs/spring-boot-app.log。
- 守卫编写坑：stripComments 后判逻辑；禁形清单"命中即return"顺序即优先级；正则认数组注解与常量引用；行尾 CRLF/LF 探测后替换并 grep 核验；误报比漏报更伤信任。
- **★桥接白名单漂移（2026-10-12 踩到并修，并已由守卫钉住）**：给 `shared/domain/*.js` 加导出后，**必须同步改 `frontend/tools/gen-shared-bridge.js` 里对应的 `window.XxxDomain = {...}` 清单**——该对象是**手工白名单**，不自动跟随源导出；漏了则 Web 端 `MD.xxx` 为 undefined（走回退分支，常见后果=显示裸英文），小程序端走 ESM 具名 import 不受影响。**第 15 道守卫 `check:bridge-exports` 已自动化钉住**：① 产物新鲜度（`buildBridgeContent()` vs 磁盘产物、行尾归一后比对）② 导出对齐（vm 真加载产物取 window 键集合 vs 源导出；遗漏须在 `shared/domain/bridge-exports.json` 的 `notExposed` 登记 ≥20 字理由，多余键直接红）③ 登记表死条目清理。**配套契约：生成器的 `buildBridgeContent()` 必须零副作用**（不写盘、不打日志），否则守卫比对会自我干扰；重跑生成器在测试里**禁用 spawnSync**（本机 EBUSY），用 `delete require.cache[require.resolve(GEN)]` + 同进程 require。
- **行尾探测坑（2026-10-12）**：`grep -c $'\r' file` 在 Git Bash 里会被吞掉转义 → 变成"匹配所有行"，**误判 LF 文件为 CRLF**。判真实行尾用 Node 统计 `\r\n` 与 `\n` 计数；本仓库工作区是 LF、git 索引是 CRLF（autocrlf），用 Node 脚本改写并保持行尾后，`git diff --stat` 应只显示预期新增数。
- **dist 的 js 是 terser 压缩产物**：局部函数名被改成单字母 → **核验 dist 必须 grep 字符串字面量 / DOM id / 属性名**（grep 函数名查不到属正常，别误判成「改动没生效」）。
- `tools/check-authz-declarative.mjs` 的 `MSG_SERVICE_PREFIXES` 含 `/api/v1/message` → 该前缀下的端点被整段跳过授权校验；**新增主系统端点的路径若以它开头会被判「陈旧规则」误报**，命名须避开（本轮由 `/api/v1/message-ledger` 改为 `/api/v1/msg-ledger` 后全绿）。
- 编译验证脚本支持指定模块：`bash build_smoke.sh compile <port> <api_dir>`（默认 api；message-service 传 `api/message-service`）。增量编译仅数秒，全量约 57s。
