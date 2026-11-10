# 项目长期记忆�026-10-30 精简；详细历史见 .workbuddy/memory/2026-10-*.md�

## 协作偏好
- 连续失败 2~3 次即问用户；先根�证据（反编译/XML/日志）再修；代码写完直接交付、跳过自测，但要编译验证；不可逆操作拒绝�
- 改动既有校验先摆事实+选项让用户拍板；用户库数据只诊断不清理（自己的测试产物除外，测后清理）�
- 输出首行【YYYY-MM-DD HH:mm】，末尾 🔔🔔🔔�

## 守卫�7 道；core.hooksPath=tools/git-hooks，新克隆�npm run hooks:install�
shared-sync / authz / cascade / ddl-align / tz / global-collide / scheduler / actuator / tenant-xt / secret-env / result-contract / date-contract / status-contract / itest-sut / bridge-exports / endpoints / admin-self-lock；`npm run check:<name>`，逃生 `SKIP_<大写>`�
- 反向测试 tests/check_*_guard.js 必须证真会红；pre-commit 不跑 �会腐烂。禁 spawnSync（本�EBUSY）→ 同进�import(url+'?t=rand')+�process.exit；变异前断言真改动，结束按字节还原；**结尾必须 process.exit(failed?1:0)**（漏了＝假绿）�
- CRLF 毒害：core.autocrlf=true，工作区 CRLF / 索引 LF �mutate() 先把 `\r\n` 归一�`\n` �includes；backup 存原�Buffer、按字节还原�
- check-actuator-guard 用懒匹配 `Set\.of\(([\s\S]*?)\)` �*第一�* `)`：JwtFilter.WHITELIST_PATHS 区块注释里禁出现 ASCII 右括号�
- 免登录白名单四处缺一即整体失效：SecurityConfig permitAll / JwtFilter.WHITELIST_PATHS / check-authz PERMIT_ALL / **WebMvcConfig.EXCLUDE_PATTERNS**（漏第四��运行时裸 401）�
- 端点避开 `/api/v1/message` 前缀（守卫跳过授权校验）；新�`/api/v1/user/*` 必须�AuthzRules 登记�

## 契约治理
- `Result.code`=primitive int；fail() 白名�{200,400,401,403,404,409,500,1001}；Advice 只映�400/404/409/500�01/403/1001 保持 HTTP 200；真鉴权 401/403 走过滤器层�
- JacksonConfig：LocalDateTime 序列�`format(fmt)+"Z"`（withZone(UTC) 无效）；要裸串在 SQL �DATE_FORMAT�
- 分页契约 = PageResult{rows,total}，是 **rows** 不是 records�

## 前端/双端铁律
- 顶层标识符包 IIFE；内�onclick �window�*同文件禁同名函数**（JS 静默覆盖，两类守卫都拦不住）；小程序 Page 重复方法键同理�
- �shared/apiPaths.js �shared/domain/*.js：sync-miniprogram-shared �check-shared-sync �gen-shared-bridge �frontend/build.js 四步；桥�window.*Domain 是手工白名单（check:bridge-exports 钉住）�
- 消息中心：展示映射唯一权威�shared/domain/message.js；msg_* 三表 tenant_id=**发送方**租户；收件箱隔离只按 userId；代查边�`self || platform_admin`；已读真相源 msg_inbox.is_read�
- dist �terser 压缩产物：核�grep 字符串字面量/DOM id，别 grep 函数名�
- **构建**：`node frontend/build.js` 默认�rmSync(dist)�50 文件）被 safe-delete 闸拦（SAFE_DELETE_BULK_CONFIRM_REQUIRED）→ �`CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js` 全量重建�026-10-24 实测可用）。别手工定向重生（build-info �terser 参数难逐字对齐）�
- **三服务反代（2026-10-30�*：booking 8081 / message 8090 / classroom 8092。分流清单唯一事实�`doc-develop/dev-proxy.js`（与 `deploy/nginx/*.conf` 逐字一致）：消�`/api/v1/{messages,message-categories,message-templates,sensitive,sse,users/}`；课�14 个前缀（classrooms/attendance/recordings/uploads/files/schedules/rtc + 7 �`/admin/*`� `/ws/classrooms/`（需 Upgrade 头）�*`/api/v1/eclassroom`（课堂开关）�`/api/v1/classroom-callback/` �8081**。API �location 必须�`^~`，否�`\.mp4$` 静态正则会抢走 `/api/v1/files/x.mp4`。`dev-frontend-local-src.js` 无课堂路由（�`dev-frontend-local.js`，`CLASSROOM_PORT` 默认 8092）�
- **密钥 env �*：`AES_KEY` / `HMAC_KEY`（源�`crypto.aes-key=${AES_KEY:默认}` + `@Value`）；手册里旧写的 `CRYPTO_AESKEY` 无效且不报错 �静默用仓库公开默认密钥�
- **★前端请求路径必须自�`/api/v1`**：`utility_request.js` �`service` 虽设 `baseURL`，但**axios 对以 `/` 开头的 url 忽略 baseURL**（该文件�27 行注释即此意）。写 `/api/logs/x` 不会变成 `/api/v1/logs/x`，只会落�nginx `location /` �try_files �404。查这类 404 先比�Controller �`@RequestMapping` 前缀�026-11-08 logBrowser 四端点即因此�404�
- **★`build.js` �`copyAssets()` 用黑名单挡非站点文件，改名单时注意三个坑**：① 目录不参与判断（`path.dirname(rel)==='.'` 只匹配根级文件），根级目录要在最前面�`rel.split(/[\\/]/)[0]` 整段跳过；② `Set.has()` **区分大小�*，名单里�`README.md` 挡不�`readme.md`（曾静默失效）；�`.orig` 备份要单独按后缀排除�026-11-08 补齐�`frontend/dist`、`deploy/dist` 才真正干净（此前每次构建都会把 Dockerfile/nginx 模板/container.config.json 复制�dist 发到公网）。`cloudBased/frontend/Dockerfile` �`RUN rm -rf` 是第二道保险，勿删�*2026-11-09 已把 6 项源文件�`frontend/` 删除**（`Dockerfile`/`container.config.json`/`nginx/`/`docker-entrypoint.d/`/`legal.html.orig` 直接删，`readme.md` 移到 `doc-develop/前端程序说明.md`），黑名�*故意保留作防回归**——谁把部署资产放�`frontend/` 也不会静默随 dist 上线�

## 账户/租户
- 只有 active 能登录（login / wechatLogin / wechatRegister 三处一致）；pending/frozen/inactive 全拒；注册口�active 不发 token；前端只在拿�token 时写会话；禁用只�frozen；JwtAuthenticationFilter 不查 status �禁用后必须补 `/auth/kick`�
- 管理�bootstrap（勿改）：applyRoleAdmission �是否已有管理�**只数 role、不�status**（admin �tenant_id、platform_admin 全局）；assertNoAdminSelfLock �updateStatus/updateInfo 两入口传 (callerId, callerRole)，禁自我降级；前端对自己那行置灰可见。租户唯一 admin 被冻结无自助恢复�*有意保留**，勿�最后一�admin 不可冻结"�
- 保留�platform（方�B）：platform/default 只作登录标识词与展示锚点，永不作经营租户；隔离只�token.tenantId�=全量�0 拼租户）。三处硬拦：UserService.isReservedTenantCode �resolveTenantByCode **之前**、authController login �platform+�platform_admin�03、api.js/小程�core/auth.js �isRoleTenantCodeMatch。平台要租户态功��另开普通随机码租户�
- 取客户端 IP 只准 `ClientIpResolver.resolve(request)`；禁手写 `xff.split(",")[0]`。ServiceInfoService.buildConnection 有意豁免�
- JwtAuthenticationFilter 强制 `Bearer ` 前缀（不带不报错、只不设上下��denyAll 401）�
- user.name 入库加密、服务级解密（无 TypeHandler）：IgnoreTenant 裸查回显姓名前必�cryptoUtil.decrypt�

## 风控/推广/微信
- 登录防刷：`LoginGuardService#scoreOnly` 只算分不写库，insert/incrIdentity/touch 只在登录成功�recordDeviceAfterLogin 调；**挑战校验不得嵌在 guard 命中分支�*（带 ticket 就必�verify，与 guard 判定解耦）；auth_rate_counter.dim="newdev"（同 IP 窗口新建设备�0 �+30）。见 doc-develop/技术方�两端登录防刷统筹.md 第十五节�
- 微信 Phase B 待完成：wechatLogin/wechatRegister 只接 evaluateRateOnly；上滑块须改 miniprogram/core/auth.js + pages/login/login.js 处理 1002 并回�challengeId/moveX/trackPoints/costMs�
- 推广三表（IGNORE_TABLES，无 tenant_id 列）；路� 自助建租户（8 位码�0/O/1/I/l�4 天试用）+ 路径2 加入租户（pending）；防刷三闸；钩�updateStatus→onApproved、changePackage→onPaid；三期双�target 服务端派生；统计 GET /promo/achievement/{tenant,platform}�
- 数据清理铁律：删测试产物按条�DELETE（曾整表删误伤）；租�6(fbKxQRAd)/promoter 0dc6977b 是用户手动验证产物，勿清�

## 课堂（classroom-service�
- 有效时长口径（F2-03）：classroom_presence_segment 每进一段；合并间隙 �jitter-grace-seconds(60s) 的相邻段求和，再 min(总分� duration)；未闭合段按参考时刻闭合。duration 必须由事件带对�
- 收尾唯一入口 ClassroomClosingService.closeAfterEnd（闭�重算/归一 ABSENT·PRESENT·LATE/置离�回流），endClass 委托它；**回执必须在事务提交后�*；consumption_version 每次 +1，预约侧按版本丢弃旧报文�
- 多课次推送：逐课次发，eventId 必须�`-cN` 后缀；cancelled �1 条不�classIndex；listByScheduleGroup �`= sid OR LIKE 'sid~%'`（第 1 课次是裸 id）；删排期是先删行再推取��取消事件不依赖排期行�
- P0-D 七扫描器 ClassroomScheduler（就绪提�自动开�自动下课/学生掉线/点名超时/教师掉线结课/每日清理，池 8）；状态流转复�markReady/startClass/endClass；每扫描器自包含 try/catch；掉线以 Redis 在线 key 为唯一真相源；自动开课双闸（全局 classroom.auto-start + 单课 auto_start）；markReady 返回 boolean�
- 前端课堂入口：ClassroomController �{scheduleId} �*课次级复合键** ClassroomKey.of(sid,classIndex)（首课次�id、第 2 �sid~N）；前端三端传裸 id，多课次精确路由未做；window.ApiPaths �js/shared-domain-bridge.js 提供。sys_eclassroom_instance ��getConfig enabled=false �无入口；已补幂等种子 api/sql/patch/20261029-1300-eclassroom-default-instance.sql�
- TenantEclassroomService 课堂开关有 5 分钟内存缓存�03「课堂未启用」先查表再想缓存）�
- 待拍板：课时扣减（lesson_attendance 有有效时长，但有意不�appointment.status、不�lesson_remaining，须与请�退费口径统一）�

## 排障/技术栈
- 编译：java 不在 PATH，JDK21 �`C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot\bin`；系�mvn ��unset CLASSPATH + 直调 Maven launcher JAR（GBK 输出�iconv）；smoke 端口 8083；杀后台 JVM �PowerShell Stop-Process（Git Bash kill 无效）。MySQL 客户�`D:\program\mysql84\bin\mysql.exe`�e 只收单行�N -B 每行�\r）�
- **复合主键实体�updateById**：无 @TableId �MP 不生��`Invalid bound statement (not found)`，表现为「接�200、明细没落库」；一律写显式 updateByKey(@Update 全字�（还能写 NULL）�
- 跨库 JOIN 显式 COLLATE utf8mb4_general_ci；mysqldump �`--result-file=`；本�mysql root/123456；改结构后重 dump �api/sql/schema/�
- 前端伺服 `node doc-develop/dev-frontend-local.js`�080 同源代理，DIST=1 伺服 dist）；临时测试脚本放仓库根、测完即删�
- 待处理：check:cascade（EclassroomService:123/172 未声明级�+ �api/beforeRun/referential-integrity-20261008.sql）与 check:secret-env（缺 booking/message.env.template）在 da4db6f8 就已��提交�SKIP_CASCADE=1 SKIP_SECRET_ENV=1。CourseService.deleteById/deleteByTemplateId �@Transactional 待拍板。应用会被会话边界回收，重启�netstat 探活�
- **★微信云托管没有 K8s 服务发现�026-11-08 实测�*：`<服务�.<envid>.svc.cluster.local` 与短�`api` 全部 **NXDOMAIN**，容�`/etc/resolv.conf` 只有 `nameserver 127.0.0.1`（平�stub）。服务间调用只有两条路：�控制台「服务设��内网访问�*分配的「内网域名�*（`xxxxx.<region>.internal-run.tcloudbase.com`，开�重新部署才分配、可能变化，必须复制）；�公网域名 `https://<服务>-<envid>.sh.run.tcloudbase.com`（实�200）。写错的表现�*静态页正常、接口全 502**�
- **★变量形�proxy_pass 必须�resolver**：`set $up "${X}"` + `proxy_pass $up` �nginx 强制要求 `resolver`，缺失即每请�502（`no resolver defined to resolve`）；`nginx -t` **查不出来**（请求期行为）。所以启动脚本取不到 nameserver 必须 `exit 1`，宁可容器起不来也不要「Running 但全 502」�
- **★前端上游走运行时环境变量（2026-11-08 定案�*：`cloudBased/frontend` �`API_UPSTREAM`/`MSG_UPSTREAM` **不进镜像**，由 `/docker-entrypoint.d/00-resolver.sh` 启动时白名单 envsubst 渲染 `/opt/nginx/default.conf.template` �`/etc/nginx/conf.d/default.conf`，再生成 resolver、跑 `nginx -t`。换环境/换内网域名只改控制台环境变量 + 重启实例，不重建镜像。`docker build` **不再�--build-arg**。该目录只留 4 份文件（Dockerfile / container.config.json / default.conf.template / resolver-entrypoint.sh），`nginx/` �`docker-entrypoint.d/` 两套遗留已删�
- **★反代换上游域名后必然踩 CORS�026-11-08 实测�*：nginx 故意不透传 Host（云托管�Host 路由）→ 后端 `getServerName()` = api 域名，而浏览器同源 POST 仍带 `Origin` = frontend 域名 �Spring `CorsUtils` 判为跨域 �白名单空（`cloud` profile �`APP_CORS_ORIGIN_PATTERNS` 默认空）�**403 + 纯文�`Invalid CORS request`**。修法：nginx server �`proxy_set_header Origin "";`（根治，语义上本就同源，且后端无任何代码�Origin）或�api �`APP_CORS_ORIGIN_PATTERNS`。见纯文本而非 JSON �body 时先�CORS�
