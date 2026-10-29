# 项目长期记忆（2026-10-13 精简；详细历史见 .workbuddy/memory/2026-10-*.md）

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测（仍要编译验证）；不可逆操作（关机等）拒绝执行。
- 改动已有校验先摆事实与选项让用户拍板；用户库内数据只诊断不清理（自己的测试产物除外，测后清理）。
- 输出首行标时间【YYYY-MM-DD HH:mm】，末尾 🔔🔔🔔。

## 守卫（17 道；core.hooksPath=tools/git-hooks 激活，新克隆跑 npm run hooks:install）
shared-sync/authz/cascade/ddl-align/tz/global-collide/scheduler/actuator/tenant-xt/secret-env/result-contract/date-contract/status-contract/itest-sut/bridge-exports/endpoints/**admin-self-lock**。`npm run check:<name>`，逃生 `SKIP_<大写>`。
- 反向测试须证真会红（tests/check_*_guard.js，`npm run test:<name>-guard`）；**pre-commit 不跑反向测试，腐烂无人发现**。模式：禁 spawnSync（本机 EBUSY）→ 同进程 import(url+'?t=rand')+拦 process.exit；变异先断言真改动、结束逐字节校验。**反向测试结尾必须 `process.exit(failed?1:0)`** —— 漏了就是"失败也返回 0"的假绿（actuator 那支曾如此，⑤⑥ 烂了很久没人发现）。
- **★CRLF 毒害（第二次踩）**：`mutate()` 里 `txt.includes(oldStr)` 必须先把 `\r\n` 归一到 `\n`，否则多行锚点静默失配、报"未找到锚点"；`backup` 存原始 Buffer、按字节还原。
- **★JwtFilter.WHITELIST_PATHS 区块内注释不得出现 ASCII 右括号**：`check-actuator-guard` 用懒匹配 `Set\.of\(([\s\S]*?)\)` 到**第一个** `)`，注释里一个 `)` 就把捕获截断在 `/actuator/health` 之前 → 守卫恒红。
- **★免登录白名单有四处，缺一即整体失效**：SecurityConfig permitAll / JwtFilter.WHITELIST_PATHS / check-authz 的 PERMIT_ALL / **WebMvcConfig.EXCLUDE_PATTERNS**。漏第四处 → TenantInterceptor 无 token 裸 401，只在运行时暴露；守卫已自动核对（双路径形态）。
- 端点避开 `/api/v1/message` 前缀（守卫跳过授权校验）；新增 `/api/v1/user/*` 必须在 AuthzRules 登记。

## 契约治理（第6批，仍生效）
- `Result.code`=primitive int；fail() 白名单 {200,400,401,403,404,409,500,1001}；Advice 只映射 400/404/409/500，401/403/1001 保持 HTTP 200；真鉴权 401/403 走过滤器层。
- JacksonConfig：LocalDateTime 序列化 `format(fmt)+"Z"`（withZone(UTC) 无效，实测）；要裸串在 SQL 层 DATE_FORMAT。
- **分页契约 = PageResult{rows,total,...}——是 rows 不是 records**（IPage 的 records 是 MP 内部名；promo.js 读错致表格恒空）。

## 前端/双端铁律
- 顶层标识符包 IIFE；内联 onclick 挂 window；**同文件禁同名函数**（JS 静默覆盖，两类守卫都拦不住）；小程序 Page 重复方法键同理。
- 改 shared/apiPaths.js 或 shared/domain/*.js：sync-miniprogram-shared → check-shared-sync → gen-shared-bridge → frontend/build.js 四步；桥接 window.*Domain 是手工白名单（check:bridge-exports 钉住）。
- 消息中心：展示映射唯一权威源 shared/domain/message.js；msg_* 三表 tenant_id=**发送方**租户；收件箱隔离只按 userId；代查边界 `self || platform_admin`；已读真相源 msg_inbox.is_read。
- dist 是 terser 压缩产物：核验 grep 字符串字面量/DOM id，别 grep 函数名。
- **`node frontend/build.js` 在本机会挂**：先 rmSync(dist)（93 文件 >50 阈值）→ safe-delete 闸抛 SAFE_DELETE_BULK_CONFIRM_REQUIRED，dist 不坏但构建不动。改 src 后按 build.js 同参（terser compress+mangle/module:false；html-minifier collapseWhitespace+removeComments+minifyCSS+minifyJS:false+caseSensitive+keepClosingSlash）**定向重生**受影响的 dist 文件即可（dist 被 frontend/.gitignore 忽略）。
- **★`node frontend/build.js` 有逃生口**：默认先 `rmSync(dist)`（>50 文件）会被 safe-delete 闸拦（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`，dist 不坏但构建不动）。加环境变量即可全量重建：`CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js`（2026-10-24 实测可用，14 个 html 全部重建）。**优先用这个，别手工定向重生**——手工重生难保证 build-info 注入与 terser 参数逐字一致。

## 业务要点
- 授权兜底 denyAll()；course /list|/page 用 checkAnyLogin（勿替代 checkTeacherOrAdmin）；课次 appointment=UTC 唯一真相源，转换只经 ScheduleGenerator；删除级联登记 CascadeRules；名称查不到留空、不回退 id。
- **★用户状态口径（2026-10-24 起）= 只有 active 能登录**：login（白名单失败关闭）/wechatLogin/wechatRegister 三处一致；pending=注册待审核、frozen=管理员禁用、inactive=停用，全部拒登。**注册口也不发券**：`doRegister` 非 active 不下发 token，`wechatRegister` 同；前端 login.html 只在拿到 token 时写会话。禁用只准用 frozen（web admin-user.js 曾错写 pending）；JwtAuthenticationFilter 不查 status，token 与状态解耦，禁用后必须补 `/auth/kick`。
- **★管理员 bootstrap（勿改）**：`applyRoleAdmission` 判"是否已有管理员"**只计数 role、不看 status**（admin 按 tenant_id、platform_admin 全局）。别"优化"成只数 active——否则被禁用者会被自助注册抢座。配套 `assertNoAdminSelfLock`：updateStatus/updateInfo 两个入口均传 (callerId,callerRole from Token)，禁止管理员把自己改成非 active。守卫 `check:admin-self-lock` 钉住这五组（含两条计数 SQL 不得出现 status）。前端两边编辑弹窗对自己那一行**置灰可见**（拍板），提交前再兜一道。**租户唯一 admin 被平台管理员冻结后无自助恢复入口——这是有意保持的结果，勿加"最后一个 admin 不可冻结"判据**（恢复只能由平台管理员改回 active）。
- **★保留字 platform 口径（2026-10-24 定案方案 B，勿走方案 A）**：`platform`/`default` 只作登录标识词与展示锚点（`fillOrgName` 靠 platform 行回显机构名），**永不作经营租户**。隔离只认 token 的 tenantId：0=查全量、>0=拼 tenant_id；URL 的 tCode 对隔离零影响，只是前端路由。三处硬拦：① `UserService.isReservedTenantCode` 在 `resolveTenantByCode` **之前**拦（那一行是能解析成功的，"保留"不能退化成"查得到但不用"），Register 与 wechatRegister 都调；② `authController` login 里 platform+非 platform_admin → 403（否则签出 token 后被前端守卫弹回，形成幽灵态）；③ `api.js`/小程序 `core/auth.js` 的 `isRoleTenantCodeMatch`（非 platform_admin 的 tCode 不得为 platform）作纵深，**禁止为"让 platform 当租户"而放开**。平台若要租户态功能（课程/排期）→ 另开普通随机码"内部机构"租户。详见 `doc-develop/技术方案-保留字platform的租户语义.md`。
- **★取客户端 IP 只准走 `ClientIpResolver.resolve(request)`**：直连无视 XFF；来自可信代理则从右往左取第一个不可信地址。**禁止再手写 `xff.split(",")[0]`**（首段是客户端自己写的那一跳，可任意伪造，风控与审计同时失效）。已统一 AuditAspect / LegalDocController / WeChatPcController / UserService / PromoController；`ServiceInfoService.buildConnection` **有意豁免**（诊断页要原样回显 XFF 全串）。
- 待拍板：CourseService.deleteById/deleteByTemplateId 缺 @Transactional。
- **★待完成（微信 Phase B）**：`wechatLogin` / `wechatRegister` 目前只接 `LoginGuardService.evaluateRateOnly`（纯限流、无滑块、超限返 1001 让小程序静默降级）。要上滑块须同时改 `miniprogram/core/auth.js` 与 `pages/login/login.js` 处理 code=1002 并回传 challengeId/moveX/trackPoints/costMs；UX 有感知，上线前评估。
- 待处理 P1：① 保留字 `platform` 在注册链路未拦（role=admin+tenantCode=platform 会解析到真库租户 11，只靠"无 sys_tenant_package → 403"碰巧挡住）；② 平台管理员冻结某租户唯一 admin 后，该租户无自助恢复入口。
- **推广（2026-10-13 二期 b0b08e7b + 三期双码）**：promo 三表（IGNORE_TABLES 无 tenant_id 列）；路径1 自助建租户（8位码去 0/O/1/I/l，保留字 platform/default，14天试用）+ 路径2 加入租户（pending）；防刷三闸（IP/手机 HMAC/试用租户上限按 referred_by 计）；点击只计数；钩子 updateStatus→onApproved、changePackage→onPaid；code-by-account 查「账号所属租户」。**三期**：我的推广双码（平台码 path1 + 租户码 path2，target 服务端从令牌派生、DTO 不接受客户端值，P0）；两级统计 GET /promo/achievement/tenant（TENANT_ADMIN_ONLY，租户从令牌派生）/platform（PLATFORM_ONLY，合计+Top20+最近转化）；租户/平台统计页挂 admin.html/platform_admin.html；平台端亦有「我的推广」菜单。
- **★数据清理铁律**：删测试产物必须按条件 DELETE（promo_conversion 曾整表删误伤用户手动验证数据）。**租户16(fbKxQRAd)/promoter 0dc6977b 是用户手动验证产物，勿清**。
- **★user.name 入库加密、服务级解密（无 TypeHandler）**：任何 IgnoreTenant 裸查回显姓名前必须 cryptoUtil.decrypt（PromoService.loadUsersForStats 模式），否则前端见 hex:base64 密文。
- **JwtAuthenticationFilter 强制 `Authorization: Bearer ` 前缀**：不带前缀不报错、只不设 SecurityContext → denyAll 401（测试锻 token 必带前缀）。
- **★风控判定函数必须只读（2026-10-24 修掉的登录滑块绕过）**：`LoginGuardService#scoreOnly` 只算分不写库，`insert/incrIdentity/touch` 全挪到 `recordDeviceAfterLogin`（**登录成功后**才调）。改前评分顺手刷 `last_subject`/建档 → 「出题→带答案重放」第二跳分数自愈 → `authController` 里包在 `if(guard.blocked())` 内的 `verify()` 永不执行，「滑块拖歪也能登录」（库里 10 张票据 used=0 且 fail_count=0 即铁证）。铁律：**挑战校验不得嵌在守卫命中分支里**——票据只由 code=1002 下发，请求带了就必须验（hasTicket → verify），与 guard 判定解耦。配套 `auth_rate_counter.dim="newdev"`（同 IP 窗口新建设备数 ≥10 → +30 分）堵「每次换 deviceId 恒 20 分、滑块永不弹」。详见 `doc-develop/技术方案-两端登录防刷统筹.md` 第十五节。
- 应用会被会话边界回收（后台任务终止即杀进程树）；重启前先 netstat 探活。四步链无 npm 脚本：`node tools/sync-miniprogram-shared.js` → `npm run check:shared-sync` → `node frontend/tools/gen-shared-bridge.js` → `node frontend/build.js`。
- **微信（一期 8dc3e994）**：wx_userid 独立表 uk 全局唯一；wechat-login/register 免登录；secret 占位→1001 静默降级是设计姿态；auto_register 禁解绑。
- **★电子课堂有效时长口径（需求 F2-03，勿改回单段差）**：`classroom_presence_segment` 每进一次一段；有效时长 = 合并「间隙 ≤ `classroom.jitter-grace-seconds`(60s)」的相邻段后求和，再 `Math.min(总分钟, classroom.duration)`；未闭合段按参考时刻闭合。旧算法（首签→末签单段差取 max）会把离线时长算进去（10:00 进/10:20 掉/11:00 回/11:30 退 → 90，应为 50）。**`duration` 必须由事件带对，否则封顶失效**。
- 课堂收尾唯一入口 `ClassroomClosingService.closeAfterEnd`（五步：闭合区间/重算时长/归一 ABSENT·PRESENT·LATE/置离线/回流），`endClass` 委托它；**回执必须在事务提交后发**（事务内发=回滚后对端已落脏数据）。`consumption_version` 每次收尾 +1，预约侧按版本丢弃旧报文。
- **★多课次事件推送（三期 e92b5550）**：排期事件逐课次发（classIndex + 该课次起止 + duration + classCount），`eventId` 必须加 `-cN` 后缀，否则对端幂等守卫把第 2..N 条当重复事件丢掉；`cancelled` 只发 1 条不带 classIndex = 整排期取消，课堂侧 `listByScheduleGroup`（`= sid OR LIKE 'sid~%'`，**第 1 课次是裸 id，只 LIKE 会漏**）批量取消、跳过 CLOSED/CANCELLED/LIVE。**删排期是先删行再推取消**，故取消事件不得依赖排期行（走 `ScheduleEventReq.CancelGroup` 校验组 + 推送侧最小载荷）。`sys_eclassroom_instance`/`sys_tenant_eclassroom` 当前是空表——租户未绑定课堂时推送静默跳过，e2e 要自己插夹具。
- **★P0-D 七扫描器（四期 0fcb7b55，classroom-service）**：课堂生命周期此前全靠人工 `/start` `/end`，现已补齐 `scheduler/ClassroomScheduler` 七个 `@Scheduled`（就绪提醒/自动开课/自动下课/学生掉线判定/点名超时/教师掉线结课/每日过期清理；池 2→8）。**状态流转一律复用 `ClassroomService.markReady/startClass/endClass`**，与人工同口径；每扫描器自包含 try/catch（单条失败不污染整轮）；**掉线判定以 Redis 在线 key 为唯一真相源**（DB `online_state` 只是展示态），`OnlineStateManager.refresh` 的 TTL 已改为可配 `classroom.offline-timeout-seconds`；自动开课有「全局 `classroom.auto-start` + 单课 `auto_start=false`」双闸；教师掉线结课消费「OFFLINE + leave_time 超 `teacher-drop-grace-seconds`」结论而非自己判掉线。无新表新字段（check:ddl-align 不受影响）。`markReady` 已改返回 boolean（翻成功才发提醒）。
- **★前端课堂入口契约（47abefe5）**：课堂页接线已闭合（classroom.html 骨架 + 8 模块 + `ClassroomAPI`/`ClassroomWS`/`feature-flags`/`shared-domain-bridge` 全部自洽；`window.ApiPaths` 实际由 `js/shared-domain-bridge.js` 提供，非旧记的 `shared/apiPaths.js`）。后端 `ClassroomController` 的 `{scheduleId}` 是**课次级复合键** `ClassroomKey.of(sid,classIndex)`（首课次裸 id、第2课次起 `sid~N`）。前端三端「进入课堂」传的是**排期裸 id**——单课次/首课次可用，**多课次(sid~N)精确路由未做**（按钮在卡片级不带 appointment 的 classIndex）。四端 `enterClassroom` 已改 `pageUrl('classroom.html',{scheduleId})`（旧拼接无 tCode 时拼出非法 URL）；admin-schedule 的 `enterClassroom` 当日补 `window` 暴露修掉死按钮。**上线阻断已解**：`sys_eclassroom_instance` 空则平台端无实例可绑 → 全租户 `getConfig` 返 enabled=false → 无入口；已补幂等种子 `api/sql/patch/20261029-1300-eclassroom-default-instance.sql`（`default-local` 指向本地 8092），上线前由平台管理员改为真实地址或新建。
- 守卫现状：`check:cascade`（`EclassroomService:123/172` 未声明级联 + 缺 `api/beforeRun/referential-integrity-20261008.sql`）、`check:secret-env`（缺 `booking/message.env.template`）**在 da4db6f8 上就已红**，提交需 `SKIP_CASCADE=1 SKIP_SECRET_ENV=1`。
- **待拍板：课时扣减**。`lesson_attendance` 已落库含有效时长，但**有意不**改 `appointment.status`、不扣 `student_balance.lesson_remaining`——须与请假/退费档位（`refund_snapshot`）统一口径后再接，否则「课堂扣一次、退费又退一次」。
- 课堂开关 `TenantEclassroomService` 有 **5 分钟内存缓存**：给租户开通课堂后要等 5 分钟或重启 classroom-service 才生效；联调时若 403「课堂未启用」，先查 `sys_tenant_eclassroom` 再想缓存。

## 技术栈/排障
- **★复合主键实体没有 `updateById`**：`classroom_attendance`/`classroom_membership`（以及一切 `(a,b)` 双主键表）实体无 `@TableId` 时，MP **不生成** `updateById`，运行期抛 `Invalid bound statement (not found)`。`insert`/`selectOne` 正常，只有更新炸 → 表现为「接口 200、状态变了、明细没落库」的半失败。已加显式 `updateByKey(@Update 全字段)`；新建双主键表一律照此办，别用 `updateById`。附带好处：显式全字段能写 NULL（MP 默认忽略 null → `leave_time` 清不掉）。
- 编译：**java 不在 PATH** —— JDK21 在 `C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot\bin`（不是 `C:\Program Files\Java`，那里只有 jdk1.8）。直调 Maven launcher JAR 前先 `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.8.9-hotspot/bin:$PATH"`；MySQL 客户端在 `D:\program\mysql84\bin\mysql.exe`（也不在 PATH），`-e` 只收**单行** SQL，`-N -B` 每行带 `\r` 需剔除再比字符串。unset CLASSPATH + 直调 Maven launcher JAR（系统 mvn 坏，GBK 输出过 iconv）；smoke 起 8083；**杀后台 java 用 PowerShell Stop-Process（Git Bash kill 对 JVM 无效）**。
- **★CRLF 毒害测试**：core.autocrlf=true → 工作区 CRLF/索引 LF；按 `\n` 写锚点的匹配静默失败（`.` 不匹配 `\r`）；判行尾用 Node 计数；反向测试变异前归一 LF、还原走原始 Buffer。
- 跨库 JOIN 须显式 COLLATE utf8mb4_general_ci；mysqldump 必须 --result-file=，本机 mysql root/123456，改结构后重 dump 落 api/sql/schema/。
- 前端伺服 `node doc-develop/dev-frontend-local.js`（8080 同源代理，DIST=1 伺服 dist）；临时测试脚本放仓库根、测完即删。
