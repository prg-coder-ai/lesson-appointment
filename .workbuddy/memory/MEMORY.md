# 项目长期记忆

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测(仍要编译验证)。
- 库内数据都是测试数据：脏数据/历史状态不清理不刷，只诊断报告。
- **改动已有校验时**先摆事实与选项让用户拍板（范围/严格度/双层），不机械执行"教科书最优"；本项目偏好分步推进 + 保留既有实现（双层并行）。

## 四条"单一权威源"治理（均有守卫 + pre-commit 门禁）
| 领域 | 权威源 | 守卫（npm） | 反向测试 |
|---|---|---|---|
| 授权 | `config/AuthzRules.java`（170条） | `check-authz-declarative.mjs` (`check:authz`) | `test:authz-guard` 7项 |
| 引用完整性 | `common/CascadeRules.java`（12场景/17规则） | `check-cascade-rules.mjs` (`check:cascade`) | `test:cascade-guard` 9项 |
| DDL | `api/sql/{schema,seed,patch}/` | `check-ddl-entity-align.mjs` (`check:ddl-align`) | `test:ddl-align-guard` 19项 |
| 时区 | `common/ScheduleGenerator.java` 三入口 | `check-tz-guard.mjs` (`check:tz`) | `test:tz-guard` 15项 |
| 端点常量 | `shared/apiPaths.js`（87个） | `check-endpoints-refs.mjs` (`check:endpoints`) | `check_endpoints_guard.js` 15项 |

统一跳过后缀：`SKIP_AUTHZ / SKIP_CASCADE / SKIP_DDL_ALIGN / SKIP_TZ`。改权威源必跑反向测试证明守卫真会红。

### 授权要点
- SecurityConfig 只做 `applyDeclarativeAuthz(auth)` 展开 hasRole/hasAnyRole；兜底**故意仍 `.anyRequest().authenticated()`** 不换 denyAll（171 端点角色归属只能从前端调用链反推，判错一条即线上 403）。已回归确认后改这一行即可切换。
- **两层并存**：路径层管"能否进接口"；方法层 `PermissionCheck`（120 处）管"能否操作这条数据"（checkTeacherOwner/checkStudentOwner 要查库，SpEL 表达不了）。
- 排除：message-service 前缀（message/sensitive/sse/users）、页面路由、permitAll 白名单。
- **造测试 token**：JwtUtil 是 **HS512**，payload `{sub:userId, role, tenantId, iat, exp}`，`sub` 必须是**真实 user_id**（误传 account → PermissionCheck 查库落空 → 兜底 403，误判成规则配错）。
- SecurityConfig 用块体 lambda（表达式体里插语句会被分号截断）。
- 待办：兜底切 denyAll；8 个 Controller 方法级授权；`/course/list|page|{id}` 三者方法体校验不一致。

### 引用完整性要点
- ⚠️ 旧报告"库中无外键"**是错的**：实测 14 个 FK，`DELETE_RULE` 全为 CASCADE。悬空引用根因是**DB 盲级联删父、无人管子**。用户拍板**不用 DB 级联，程序内完成**（含软删置态）。理由：DB 不认业务语义 / 与服务端联动会错位 / 隐式级联不可观测。
- 6 种动作：FREEZE / SOFT_STATUS / DELETE / RESTORE_STATUS / **KEEP(须写理由)** / **SKIP(须写理由)**。豁免写法 `// cascade: none <理由>`。
- 物理删除**先子后父**：`appointment` 无 schedule_id 只能经 booking_id 两跳，**booking 先删就定位不到课次**；删课次**必须先删 notification_dispatch_log**（uk_dispatch_once 含 appointment_id）。规则表**不做跨层展开**（链上父键类型不同），跨层取键由调用方 Service 显式做。
- 软删处置：排期 frozen→预订+课次 frozen；课程 frozen→排期 inactive + 预订/课次 KEEP；租户软删→**账号 frozen + 会话下线**；删行业→词条 status=0 + 占用校验 409。
- `bookingId` 双生成器已统一为 `BookingIdGenerator.next()`(32位hex)，历史数据不改写。

### DDL 要点
- 命名铁律 `YYYYMMDD-HHMM-<库>-<用途>.sql`（字典序=执行顺序）；改表结构后必须重新 mysqldump 落 `api/sql/schema/`。
- **mysqldump 必须 `--result-file=`**（`>` 在 Windows 写成 GBK 中文注释全乱码）+ `--ignore-table=` 排除 `bak_*`。
- 旧 `api/beforeRun/sql/*` 已废弃（少 4 表）。
- 选静态守卫(B)不选连库(A)：A 只能进 CI，且拿"库里的表"当真相会让"忘了 ALTER"变合法状态。**A 未实现 → mapper XML 显式列清单是唯一未覆盖漂移面**。
- **驼峰→列名须与 MP 逐字符等价**：`camelToUnderline` 不合并连续大写 → `scheduleID` 得 `schedule_i_d`。守卫比运行时更宽容=假绿，判据：宁可误报不存在的列，不能漏报被映射成别的列的字段。
- 根因 C 剩余：**未引入 Flyway/schema_version**（有事实源无自动迁移）。孤儿实体 `CourseCheckIn`/`CourseEvaluation` 已拍板**保留**（将来启用），整表豁免。

### 时区要点（课次 UTC 化，见 doc-develop/课次时间UTC化改造方案.md v1.2）
- 口径铁律：排期 `course_schedule` = 本地墙钟 + `time_zone`（不动）；**`appointment` 起 = UTC**（唯一真相源）；展示 = 用户时区。转换只发生在"生成课次那一刻"。
- 三个入口一律经 `ScheduleGenerator`：`scheduleLocalToUtc` / `utcToUserZone` / `nowUtc()`（审计监控类用裸 now()，已豁免）。`serverTimezone=UTC` 保持不动。
- **可见文本出口 = `utcToZonedText(utc, zone, fmt)`**（2026-10-09 新增）→ `2026-10-09 21:00（中国标准时间）`；`zoneLabel()` 出可读标签。**通知正文/试算一律走它**，禁 `lesson.format(...)` 与 `.toString()` 裸输出。
- **通知正文三条路径口径已统一（2026-10-09 修；v1.1 只改了候补递补，漏了上课提醒 + 管理端试算）**：上课提醒是高频（4档 × 每分钟轮询），漏改必然显示错时间。**取不到排期时区时整句省略，不降级 UTC**（无标注数字的误读代价 > 少一句时间提示）；故 `{lessonAt}` 模板占位符**自带括号**——括号写死会在空值时留孤立的「（）」。
- `NotifyRuleService.preview()` 收管理员手输的**假想墙钟时间**，不转 UTC；`plan()` 收真实课次（UTC），按排期时区渲染。靠 `zone` 参数是否为 null 区分。`preview` 里的 `now().plusDays(1)` 是输入框默认值，守卫已豁免。
- **不新增 `appointment.time_zone`**（v1.1 用户质疑后删）：UTC 已防住，快照列只会自造"两处时区不一致该信谁"的漂移。
- 6 个课次返回接口统一收 `userTimeZone`（`AppointmentQueryPage.userTimeZone`）。⚠️ `PageResult` 记录字段是 **`rows`**。
- 通知规则用 `offsetMinutes` 相对偏移 → 规则表不需改，课次转 UTC 后自动正确。
- **守卫 `tools/check-tz-guard.mjs`（npm `check:tz`，pre-commit 第 5 条，`SKIP_TZ=1`）+ `tests/check_tz_guard.js` 22/22**。五条检查：课次写入过 `scheduleLocalToUtc` 且两 setter 都调 / 五个文件禁裸 now() / 三个方法必须存在 / 前端禁手算偏移且须有 `isValidZone` / **通知文本禁形清单**（覆盖 3 个文件）。
- **未实测**：验证清单第 5 条「改服务器 TZ 重跑结果不变」需完整环境。

## 技术栈与构建
- api(Spring Boot 3.3.5 + MyBatis-Plus 3.5.7) + message-service 独立模块；MySQL lesson_appointment/message_center；三产物：booking-api jar / message-service-1.0.0.jar / frontend/dist/。
- 改前端必重 `node frontend/build.js`(CODEBUDDY_SAFE_DELETE_ENABLED=0)；编译验证用 saas-api-build-smoke(Maven GBK 输出先 iconv)。

## 铁律
- JWT：远程=线上密钥、本地=源 jwt.secret；同源才互验。
- 编码 UTF-8 无 BOM；雪花ID 19位→Long 转字符串；入参 LocalDateTime 须 ISO-8601(T)；data-* 经 dataset 读须核对驼峰名。

## 本地全栈拓扑与排障
- 端口：8080=dev代理(源码直出frontend/)、8081=booking API、8090=message-service、3306=MySQL。
- **后台 java 会被回收**（exit 0 无 shutdown 日志）→ 起全栈须 `netstat` 确认两端都在；掉了就 `java -jar api/beforeRun/booking-api-2.0.2.jar --server.port=8081` 与 `message-service-1.0.1.jar --server.port=8090`。**登录必带 tenantCode**（如 TENANT_A），平台管理员 tenantCode="platform"、role="platform_admin"。
- **API分流根因坑**：dev 代理 `doc-develop/dev-proxy.js` + Nginx booking*.conf 须覆盖 message-service 全部 `/api/v1` 前缀(message/sensitive/sse/users)。漏配→误路由 booking→"资源不存在"。
- 后端挂死：非API路径秒回404、`/api/**` 全超时；jstack 见 `StandardWrapper.allocate` BLOCKED。java 启动必 `> 日志 2>&1` 后 taskkill 重启。
- 排障：netstat -ano|grep LISTENING→PID；jcmd PID VM.command_line；jstack PID。wmic禁用；**Git Bash 下 taskkill 需 `MSYS_NO_PATHCONV=1`**；命令行含 password 触发审批 → curl -d @json文件。
- **异常堆栈去 `api/logs/spring-boot-app.log`**（相对 jar 启动目录）；认**环境变量 LOG_PATH**，**不认** `--logging.file.name`。
- **curl 前先查注解 method 与路径**：`/course/booking/updateStatus` 是 **@PostMapping**；候补递补是 `/booking/waitlist/promote` 且字段 `id`（非 bookingId）。

## 登录/注册/公开页
- login.html：index→landing→login→角色页；tCode锁tenant、registered=1须跳过自动跳转；submitRegister返回false不得弹成功。
- 后端口径：POST /auth/login、POST /user/register、GET /user/account/exist；登录仅拦 frozen/inactive。
- 公开页防跳登录：utility_request.js 401拦截(__PUBLIC_LANDING__||noAuthRedirect) + api.js isPublicPage 守卫；`__PUBLIC_LANDING__=true` 须在 api.js 前注入。

## 业务规则
- **booking→appointment 联动**（第3批已收回服务端）：单一实现 `BookingAppointmentSyncService`，接入 BookingService 三入口。**仅 booked 生成课次**；映射：cancelling→`cancelling`、cancelled→`cancelled`、frozen→`frozen`(保行)、waiting/rej-booking→不生成+置cancelled、booking/rej-cancelling→还原active、**未登记状态→不动**。`completed`/`changed` 课次**不覆写**。
- **课次状态前缀语义（铁律）**：`s-`=学生课次级 / `t-`=教师课次级 / 无前缀=整单级。`t-cancelling`/`t-cancelled` 已被教师端「申请改期」占用，**整单取消绝不可用 t-**。权威源 `common/AppointmentStatus.java` ↔ `shared/domain/appointmentState.js`。
- 课次生成幂等（已修）：校验是否存在仍生效课次(`occupiesTime`)，全失效才 removeByBookingId+重生成（否则 booked→cancelled→booked 时间表凭空消失）。
- 术语(sys_term)：三级(0,0)平台/(行业,0)行业/(租户,行业)租户；语言优先作用域；`TermMsg.t("{key}")` 只替换显式 {key}。
- 候补/名额并发：排期行锁 + 锁定读计数（禁 COUNT+FOR UPDATE）+ 加锁顺序"排期→booking" + CAS。
- 退改规则：course_id=''租户默认；两阈值+partial_refund_percent；生效课程>租户默认>内置兜底(24h/12h/50%)。
- 上课通知规则：三表(头/明细/流水)；明细进 IGNORE_TABLES；整组覆盖；生效课程>租户默认>内置兜底(3天/1天/1h/30min)；NotifyTask 每 60s 逐租户 setTenantId + finally clear。
- SSE：pushToUser catch 生效；connect 覆盖旧 emitter 必 old.complete()。
- **`booking.teacher_id` NOT NULL 无默认值**：直接调 `POST /booking/create` 不带 teacherId 必 500（前端正式链路会带）。
- 免登录接口×租户插件：无租户上下文入口被追加 tenant_id=-1 → 恒不命中；放行=白名单 + 查询 `@InterceptorIgnore(tenantLine="true")`；admin 侧先 requireTenantContext()。
- 微信登录已于 2026-09-20 屏蔽（exist=false + 块注释）。恢复需去掉 exist=false + 取消注释 + ALTER TABLE user ADD COLUMN wx_openid。

## 一码多端 + 跨端冗余收敛
- 不上 uni-app（≤2端净负收益）；视图层可不一致；漂移校验=阻断。
- shared/(ESM零DOM) 单一权威源：桥接 window.*Domain/*Adapter（**须 IIFE 包裹**，否则 const 冲突整段崩）；domain 7 模块；adapters net/storage/ui/router 已接线；**STORE 垫片归一 getItem/setItem/removeItem**。
- Web 各文件顶部 `const EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};`；小程序端 ESM 直 import。代码层 `/api/v1/...` 字面量已清零。
- **改 shared/apiPaths.js 必重跑**：`frontend/tools/gen-shared-bridge.js` + `tools/sync-miniprogram-shared.js` + `check-miniprogram-shared-sync.js` + `node frontend/build.js`。
- `frontend/index.html` 内联脚本 5 处 `/api/v1/` 全在注释内；`index.html:306-321` showApiError 整块在注释区间，是从未执行的历史遗留。
- `BACKEND_PROBES` 降级快照在 admin-dataMaintainPage.js / platform-admin-backend-info.js，守卫逐字段校验。**prefix 是载荷字段**（决定 Nginx/代理分流到 8081 还是 8090）。
- **文案"重复"要参数化不要统一**：`bookingStatusText(status,{profile:'web'|'default'})`。Web=「预定待确认/预定已确认」，小程序=「待确认/已确认」——已拍板的差异，勿合成一套。

## 前端铁律
1. 顶部刷新=refreshRightPage()+registerPageRefresh(menuKey,fn)；标题≠菜单key。
2. 异步必 await；切换刷新带序号丢弃过期响应。
3. 判定链接正则勿用 $ 锚定文件名（末尾是查询串）。
4. 显示≠判定：数值进 data-*、文案进 value；`<input type=number>` 静默丢文本 → 须 text；只读须 readonly 属性+class 双全。
5. 刷新≠切换课程：刷新须保持当前排期(fillScheduleSelect(list,keepScheduleId))。
6. 小程序标题双源：json `navigationBarTitleText`(首帧) vs 运行时 `wx.setNavigationBarTitle`(**会覆盖 json**)——固定标题页须清掉运行时设标题；「学生端课程预订」页标题随行业变，**故保留**运行时设标题。
7. 教师端菜单名固定=「预订管理」（不参与行业词转换）；仅页内描述文案走 `{{terms.*}}`。
8. **用字口径**：小程序统一「预订」，Web/API 维持「预定」——跨端不一致是已知且接受的状态，勿擅自改 Web（会连动 tests 断言 + dist 重建）。
9. **小程序表单页写库前必查 4 项**：① NOT NULL 且无默认值的列必须显式给值（`course_schedule.time_zone`/`name`；mapper XML 是显式列清单，传 undefined 会写 NULL 而非走默认 → 500）② tinyint(1) 取值 −128..127（`available_sites` 上限 127）③ 表级 CHECK 要前端先拦（`end_time > start_time`）④ 数值输入用字符串承载 + text 类型，bindblur 再归一。setData 路径写错（写页面顶层而非 form.x）不报错只静默漏清值。
10. **WXML 绑定里禁止函数调用**：WXML 只支持 三元/算数/逻辑/字符串拼接/属性与下标取值，函数调用**编译期失败且静默渲染成空**。多选/列表选中态一律由 JS 派生并与数据同一次 setData。命中点用 `<view>` + `hover-class`。扫描判据：`grep -rnE '\{\{[^}]*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(' miniprogram --include=*.wxml` 须零命中。
11. **学生端约课链路三处契约**：① 提交预订必带 `teacherId`（`course_schedule` 无 teacher_id 列，只能取 `Course.teacherId`）② 学生侧过滤字段是 `userId`+`userRole:'student'`（传错＝越权读）③ 「延期/请假」是课次级动作 `PUT /appointment/updateStatusById {id,status}`。另：`selectByCourseId` 的 Authorization 头必填；`teacher/published/public-list` 的 tenantCode 为空会**静默返回空数组**。
12. **端点/规则类通用坑**见下方工具踩坑。

## 消息中心(message-service)
- 双轨：msg_message(主,全局唯一) vs msg_inbox(按收件人扩散)。**红线：绝不可单独 DELETE 主消息**（收件人副本会空白）。
- 删除三档：收件人软删→回收站→purge(只删个人副本) / withdraw(撤未读+改主消息status) / deleteMessageGlobal(级联主消息+全部inbox+delivery+SSE message_deleted，限 admin/platform_admin)。
- 前端：#msg-category 只读仅下拉(首项"不分类")；admin-messageCategory.js 挂 admin+platform_admin「系统配置」；admin-messageManage.js 挂双端「消息管理」；SSE 消费 message_deleted 即时移除。
- message-service 不挂 TenantLineInnerInterceptor，租户隔离靠显式 tenantId。

## 工具与测试踩坑（写守卫/测试通用）
- **node 内 spawnSync/execFileSync/spawn 全 EBUSY**；同进程 `import(url+'?t=rand')` 绕不开 ESM 缓存。唯一可靠 = **`vm.SourceTextModule` 每次重新求值源码**（需 `--experimental-vm-modules`）。合成模块要按来源模块给 `default` 导出；vm 里守卫末尾 `process.exit` 要 catch 成中断信号。
- **反向测试必须断言"注入真的生效"**（mutate 返回 true），否则拿到假绿灯。**反向测试会污染源码**（锚点叠加成 `// // //`），须 touchedFiles 缓存 + 结束逐字节比对不一致则 exit 2。
- **反向测试锚点会被行尾打脸**：实体文件 CRLF、schema 脚本 LF，锚点写死 `\n` → 命中 0 次。变异原语须按实测行尾改写，且强制"恰好命中一次"。
- **Windows `path.join` 产反斜杠**，与 `path.relative().split(path.sep).join('/')` 的正斜杠比对恒 false → Set.includes 静默失效、假通过。脚本内相对路径清单一律写 POSIX 正斜杠 + 加"必须真校验过 N 份"断言。
- 守卫解析 Java 实体三坑：① 字段普遍带**行尾注释**，要求整行以 `;` 结尾会整条丢弃（32 条假告警）② 块注释 `*/` 单独成行时清空缓存会让 Javadoc 里的类级豁免永不生效 ③ `AUTO_INCREMENT` 列不是"NOT NULL 且无默认"。
- 解析嵌套构造的单正则会静默漏条目（`List.of(...)` 只抓到 5/17）→ 须按**括号配平**提取。分组判定按**代码块**不按行号（常量在文件末尾会把前面全归到最后一组）。
- **死检查与真检查输出长得一样**：写完逐条反向验证，跑不红的多半是不可达分支。**禁形清单里"命中即return" ⇒ 顺序即优先级**，排在后面的规则会被前面的完全遮蔽（实测 `setLessonTime(lesson.format(FMT))` 同时命中两条，写在后面的那条成了死检查）。
- **禁形正则要覆盖 getter 形态**：`a.getAppointmentDatetime().toString()` 的接收者是 `getAppointmentDatetime()` 而非标识符，只写 `\w*` 会漏判（守卫输出全绿而防护为零）。
- **"逐个文件排查"必然漏**：v1.1 修了候补递补的裸 UTC，却漏了同样把课次时间给人看的上课提醒与管理端试算。根因是按文件/函数排查，而非先问"哪些地方会把课次时间给人看"。守卫须按**输出形态**（禁形）覆盖。
- `stripComments` 里 for 循环 `continue` 后仍 `i++`，不显式输出 `'\n'` 会**整行消失**（537→507）导致行号错位误报 —— **误报比漏报更伤信任**，加行数自检断言。
- `methodBody` 只 indexOf 方法名会**匹配到调用点**，须正则强制修饰符+返回类型。
- Javadoc 里写块注释结束标记字面量会**提前闭合注释**。
- **`Intl` 认得 `CST` 并静默按 UTC-6 解析**（差 14 小时无报错），`GMT+8` 反而抛错 → 前端须 `isValidZone` 强制 `Region/City`；Java 侧 `ZoneId.of("CST")` 抛异常天然安全。
- 并行同文件多 Edit 只最后生效 → 串行 + grep 核验；替换前探测行尾；缺 jsdom 时 `export NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules`。

## 薄弱环节审计结论（报告=预约系统薄弱环节分析报告-20261007.md）
- **五根因**：A 授权模型缺失(全仓 0 处 hasRole) B 业务正确性外包前端 C DB 定义无单一事实源 D 密钥明文入库(**AES 泄露不可靠轮换补救，须+历史数据重加密**) E 可观测性与后端测试真空。
- **提权链已于 2026-10-08 修复**（勿再当现存缺陷）：角色白名单+bootstrap 收口到 `UserService.applyRoleAdmission`（并发用 FOR UPDATE 锁定读，已双会话实测阻塞 4115ms）；reset 加 checkAdmin；changePassword 改两态；`assertUserScope` 接入 listInbox/unreadCount/listMessageIds；purgeOne 改 deleteById。
- **做得好、勿误伤**：BookingSeatService 席位闸门、通知幂等 uk_dispatch_once、备份脚本、调试输出 0 残留。
- **`/user/add` 口径勿改回"只允许 student/teacher"**：`platform-admin-user.js:161` 下拉只有 platform_admin/admin，平台管理员靠它开租户管理员，一刀切会打死该功能。
- 待用户确认：各租户是否都已有 admin；hardening 脚本是否已执行；jwt.expiration=360000000(100h) 是否笔误；8081-8090 是否公网可直连；是否引入 Flyway。

## 技能
saas-api-build-smoke / shared-domain-sink / shared-adapter-wire / seat-oversell-concurrency-audit / public-endpoint-tenant-bypass / browserless-frontend-itest / server-side-term-template / source-encoding-repair / miniprogram-page-registry-audit / paged-response-field-contract-audit / miniprogram-grouped-enrich-list / miniprogram-term-localization / miniprogram-form-schema-align / student-booking-flow-align / html-template-clone-refactor / booking-deeplink-routing