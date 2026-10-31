# 项目长期记忆（2026-10-30 精简；详细历史见 .workbuddy/memory/2026-10-*.md）

## 协作偏好
- 连续失败 2~3 次即问用户；先根因+证据（反编译/XML/日志）再修；代码写完直接交付、跳过自测，但要编译验证；不可逆操作拒绝。
- 改动既有校验先摆事实+选项让用户拍板；用户库数据只诊断不清理（自己的测试产物除外，测后清理）。
- 输出首行【YYYY-MM-DD HH:mm】，末尾 🔔🔔🔔。

## 守卫（17 道；core.hooksPath=tools/git-hooks，新克隆跑 npm run hooks:install）
shared-sync / authz / cascade / ddl-align / tz / global-collide / scheduler / actuator / tenant-xt / secret-env / result-contract / date-contract / status-contract / itest-sut / bridge-exports / endpoints / admin-self-lock；`npm run check:<name>`，逃生 `SKIP_<大写>`。
- 反向测试 tests/check_*_guard.js 必须证真会红；pre-commit 不跑 → 会腐烂。禁 spawnSync（本机 EBUSY）→ 同进程 import(url+'?t=rand')+拦 process.exit；变异前断言真改动，结束按字节还原；**结尾必须 process.exit(failed?1:0)**（漏了＝假绿）。
- CRLF 毒害：core.autocrlf=true，工作区 CRLF / 索引 LF → mutate() 先把 `\r\n` 归一成 `\n` 再 includes；backup 存原始 Buffer、按字节还原。
- check-actuator-guard 用懒匹配 `Set\.of\(([\s\S]*?)\)` 到**第一个** `)`：JwtFilter.WHITELIST_PATHS 区块注释里禁出现 ASCII 右括号。
- 免登录白名单四处缺一即整体失效：SecurityConfig permitAll / JwtFilter.WHITELIST_PATHS / check-authz PERMIT_ALL / **WebMvcConfig.EXCLUDE_PATTERNS**（漏第四处 → 运行时裸 401）。
- 端点避开 `/api/v1/message` 前缀（守卫跳过授权校验）；新增 `/api/v1/user/*` 必须在 AuthzRules 登记。

## 契约治理
- `Result.code`=primitive int；fail() 白名单 {200,400,401,403,404,409,500,1001}；Advice 只映射 400/404/409/500，401/403/1001 保持 HTTP 200；真鉴权 401/403 走过滤器层。
- JacksonConfig：LocalDateTime 序列化 `format(fmt)+"Z"`（withZone(UTC) 无效）；要裸串在 SQL 层 DATE_FORMAT。
- 分页契约 = PageResult{rows,total}，是 **rows** 不是 records。

## 前端/双端
- 顶层标识符包 IIFE；内联 onclick 挂 window；同文件禁同名函数；小程序 Page 禁重复方法键。
- 改 shared/apiPaths.js 或 shared/domain/*.js 四步：sync-miniprogram-shared → check:shared-sync → gen-shared-bridge → frontend/build.js；window.*Domain 是手工白名单（check:bridge-exports 钉住）。
- dist 是 terser 压缩产物：核验 grep 字符串字面量/DOM id，别 grep 函数名。
- **构建**：`node frontend/build.js` 默认先 rmSync(dist)（>50 文件）被 safe-delete 闸拦（SAFE_DELETE_BULK_CONFIRM_REQUIRED）→ 用 `CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js` 全量重建（2026-10-24 实测可用）。别手工定向重生（build-info 与 terser 参数难逐字对齐）。
- **三服务反代（2026-10-30）**：booking 8081 / message 8090 / classroom 8092。分流清单唯一事实源 `doc-develop/dev-proxy.js`（与 `deploy/nginx/*.conf` 逐字一致）：消息=`/api/v1/{messages,message-categories,message-templates,sensitive,sse,users/}`；课堂=14 个前缀（classrooms/attendance/recordings/uploads/files/schedules/rtc + 7 个 `/admin/*`）+ `/ws/classrooms/`（需 Upgrade 头）；**`/api/v1/eclassroom`（课堂开关）与 `/api/v1/classroom-callback/` 属 8081**。API 的 location 必须带 `^~`，否则 `\.mp4$` 静态正则会抢走 `/api/v1/files/x.mp4`。`dev-frontend-local-src.js` 无课堂路由（用 `dev-frontend-local.js`，`CLASSROOM_PORT` 默认 8092）。
- **密钥 env 名**：`AES_KEY` / `HMAC_KEY`（源码 `crypto.aes-key=${AES_KEY:默认}` + `@Value`）；手册里旧写的 `CRYPTO_AESKEY` 无效且不报错 → 静默用仓库公开默认密钥。

## 账户/租户
- 只有 active 能登录（login / wechatLogin / wechatRegister 三处一致）；pending/frozen/inactive 全拒；注册口非 active 不发 token；前端只在拿到 token 时写会话；禁用只写 frozen；JwtAuthenticationFilter 不查 status → 禁用后必须补 `/auth/kick`。
- 管理员 bootstrap（勿改）：applyRoleAdmission 判"是否已有管理员"**只数 role、不看 status**（admin 按 tenant_id、platform_admin 全局）；assertNoAdminSelfLock 在 updateStatus/updateInfo 两入口传 (callerId, callerRole)，禁自我降级；前端对自己那行置灰可见。租户唯一 admin 被冻结无自助恢复＝**有意保留**，勿加"最后一个 admin 不可冻结"。
- 保留字 platform（方案 B）：platform/default 只作登录标识词与展示锚点，永不作经营租户；隔离只认 token.tenantId（0=全量、>0 拼租户）。三处硬拦：UserService.isReservedTenantCode 在 resolveTenantByCode **之前**、authController login 里 platform+非 platform_admin→403、api.js/小程序 core/auth.js 的 isRoleTenantCodeMatch。平台要租户态功能 → 另开普通随机码租户。
- 取客户端 IP 只准 `ClientIpResolver.resolve(request)`；禁手写 `xff.split(",")[0]`。ServiceInfoService.buildConnection 有意豁免。
- JwtAuthenticationFilter 强制 `Bearer ` 前缀（不带不报错、只不设上下文 → denyAll 401）。
- user.name 入库加密、服务级解密（无 TypeHandler）：IgnoreTenant 裸查回显姓名前必须 cryptoUtil.decrypt。

## 风控/推广/微信
- 登录防刷：`LoginGuardService#scoreOnly` 只算分不写库，insert/incrIdentity/touch 只在登录成功后 recordDeviceAfterLogin 调；**挑战校验不得嵌在 guard 命中分支里**（带 ticket 就必须 verify，与 guard 判定解耦）；auth_rate_counter.dim="newdev"（同 IP 窗口新建设备≥10 → +30）。见 doc-develop/技术方案-两端登录防刷统筹.md 第十五节。
- 微信 Phase B 待完成：wechatLogin/wechatRegister 只接 evaluateRateOnly；上滑块须改 miniprogram/core/auth.js + pages/login/login.js 处理 1002 并回传 challengeId/moveX/trackPoints/costMs。
- 推广三表（IGNORE_TABLES，无 tenant_id 列）；路径1 自助建租户（8 位码去 0/O/1/I/l，14 天试用）+ 路径2 加入租户（pending）；防刷三闸；钩子 updateStatus→onApproved、changePackage→onPaid；三期双码 target 服务端派生；统计 GET /promo/achievement/{tenant,platform}。
- 数据清理铁律：删测试产物按条件 DELETE（曾整表删误伤）；租户16(fbKxQRAd)/promoter 0dc6977b 是用户手动验证产物，勿清。

## 课堂（classroom-service）
- 有效时长口径（F2-03）：classroom_presence_segment 每进一段；合并间隙 ≤ jitter-grace-seconds(60s) 的相邻段求和，再 min(总分钟, duration)；未闭合段按参考时刻闭合。duration 必须由事件带对。
- 收尾唯一入口 ClassroomClosingService.closeAfterEnd（闭合/重算/归一 ABSENT·PRESENT·LATE/置离线/回流），endClass 委托它；**回执必须在事务提交后发**；consumption_version 每次 +1，预约侧按版本丢弃旧报文。
- 多课次推送：逐课次发，eventId 必须加 `-cN` 后缀；cancelled 只 1 条不带 classIndex；listByScheduleGroup 用 `= sid OR LIKE 'sid~%'`（第 1 课次是裸 id）；删排期是先删行再推取消 → 取消事件不依赖排期行。
- P0-D 七扫描器 ClassroomScheduler（就绪提醒/自动开课/自动下课/学生掉线/点名超时/教师掉线结课/每日清理，池 8）；状态流转复用 markReady/startClass/endClass；每扫描器自包含 try/catch；掉线以 Redis 在线 key 为唯一真相源；自动开课双闸（全局 classroom.auto-start + 单课 auto_start）；markReady 返回 boolean。
- 前端课堂入口：ClassroomController 的 {scheduleId} 是**课次级复合键** ClassroomKey.of(sid,classIndex)（首课次裸 id、第 2 起 sid~N）；前端三端传裸 id，多课次精确路由未做；window.ApiPaths 由 js/shared-domain-bridge.js 提供。sys_eclassroom_instance 空 → getConfig enabled=false → 无入口；已补幂等种子 api/sql/patch/20261029-1300-eclassroom-default-instance.sql。
- TenantEclassroomService 课堂开关有 5 分钟内存缓存（403「课堂未启用」先查表再想缓存）。
- 待拍板：课时扣减（lesson_attendance 有有效时长，但有意不改 appointment.status、不扣 lesson_remaining，须与请假/退费口径统一）。

## 排障/技术栈
- 编译：java 不在 PATH，JDK21 在 `C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot\bin`；系统 mvn 坏 → unset CLASSPATH + 直调 Maven launcher JAR（GBK 输出过 iconv）；smoke 端口 8083；杀后台 JVM 用 PowerShell Stop-Process（Git Bash kill 无效）。MySQL 客户端 `D:\program\mysql84\bin\mysql.exe`（-e 只收单行；-N -B 每行带 \r）。
- **复合主键实体无 updateById**：无 @TableId 时 MP 不生成 → `Invalid bound statement (not found)`，表现为「接口 200、明细没落库」；一律写显式 updateByKey(@Update 全字段)（还能写 NULL）。
- 跨库 JOIN 显式 COLLATE utf8mb4_general_ci；mysqldump 用 `--result-file=`；本机 mysql root/123456；改结构后重 dump 到 api/sql/schema/。
- 前端伺服 `node doc-develop/dev-frontend-local.js`（8080 同源代理，DIST=1 伺服 dist）；临时测试脚本放仓库根、测完即删。
- 待处理：check:cascade（EclassroomService:123/172 未声明级联 + 缺 api/beforeRun/referential-integrity-20261008.sql）与 check:secret-env（缺 booking/message.env.template）在 da4db6f8 就已红 → 提交用 SKIP_CASCADE=1 SKIP_SECRET_ENV=1。CourseService.deleteById/deleteByTemplateId 缺 @Transactional 待拍板。应用会被会话边界回收，重启前 netstat 探活。
