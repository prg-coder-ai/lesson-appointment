# 项目长期记忆

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测(仍要编译验证)。
- 库内数据都是测试数据(2026-09-18确认)：脏数据/历史状态一律不清理、不刷、不必再问；只诊断报告。
- **改动已有校验时**：先摆事实与选项让用户拍板（范围/严格度/是否双层），别机械执行"教科书最优"；本项目用户偏好分步推进 + 保留既有实现（双层并行）而非一次性大改。

## 声明式授权（第2批，2026-10-08 落地）
- **单一权威源 = `api/.../config/AuthzRules.java`**（170 条「方法+路径+角色数组+出处注释」）。SecurityConfig 只做 `applyDeclarativeAuthz(auth)` 展开成 hasRole/hasAnyRole。角色数组常量 4 个：PLATFORM_ONLY / PLATFORM_OR_TENANT_ADMIN / TEACHER_OR_ADMIN / ALL_ROLES。
- **兜底仍 `.anyRequest().authenticated()`，故意不换 denyAll**：171 端点中学生/教师共用读接口的角色归属只能从前端调用链反推，一处推断错 denyAll 立刻变线上 403。已回归确认后**改这一行即可**切换（规则表已完整 182/182）。
- **两层并存不是替换**：路径层管"能否进接口"(AuthzRules)；方法层继续管"能否操作这条数据"(PermissionCheck 120 处，含 checkTeacherOwner/checkStudentOwner 需查库比对归属，SpEL 表达不了)。
- **守卫 = `tools/check-authz-declarative.mjs`（npm run check:authz），已挂 .git/hooks/pre-commit（SKIP_AUTHZ=1 跳过）**。改 Controller 端点必须同步 AuthzRules，否则提交被拒。5 类判红：漏声明/陈旧规则/非法角色/空角色数组/重复声明。改 AuthzRules 后必跑 `npm run test:authz-guard`（7 项反向测试）。
- 排除范围：message-service 前缀（message/sensitive/sse/users，Nginx 分流 8090 不到 booking-api）、页面路由(/ /favicon.ico /booking)、permitAll 白名单。
- **造测试 token**（起真实实例验证用）：JwtUtil 是 **HS512**（非 HS256），payload `{sub:userId, role, tenantId, iat, exp}`，密钥取 application.properties 的 jwt.secret。`sub` 必须是**真实 user_id**，误传 account 会让 PermissionCheck 查库落空 → 兜底 403，误判成"规则配错"。
- **SecurityConfig 用块体 lambda** `auth -> { ... }`（非表达式体）——表达式体里插语句会被分号截断，报错位置还指向更早的无关行。
- 待第3批：兜底切 denyAll；8 个 Controller 方法级授权；P1-1~P1-7 逐条补；`/course/list|page|{id}` 三者方法体校验现状不一致（/list 活着会 403 学生，/page 与 /{id} 已注释）。

## 技术栈与构建
- api(Spring Boot 3.3.5+MyBatis-Plus 3.5.7)+message-service 独立模块；MySQL lesson_appointment/message_center；三产物：booking-api jar / message-service-1.0.0.jar / frontend/dist/。
- 改前端必重 node frontend/build.js(CODEBUDDY_SAFE_DELETE_ENABLED=0)；编译验证用 saas-api-build-smoke(GBK输出iconv)。

## 铁律
- JWT：远程=线上密钥、本地=源 jwt.secret；同源才互验；本地起 message-service 必 --server.port=8090(后端 --server.port=8081)。
- 编码 UTF-8 无 BOM；雪花ID 19位→Long 转字符串；入参 LocalDateTime 须 ISO-8601(T)；data-* 经 dataset 读须核对驼峰名。

## 本地全栈拓扑与排障
- 端口：8080=dev代理(源码直出frontend/)；8081=booking API；8090=message-service；3306=MySQL。
- **后台 java 会被回收**：`run_in_background` 起的 booking/message-service 进程偶发被回收(exit 0 无 shutdown 日志)，导致 8081/8090 双双掉线、前端全挂。**本地起全栈须确认两端都在**：`netstat` 查 8081+8090；掉了就 `java -jar .../booking-api-2.0.2.jar --server.port=8081`(路径 api/beforeRun/) 与 `message-service-1.0.1.jar --server.port=8090` 各起一份。**登录须带 tenantCode**：租户端 `/auth/login` 必传 `tenantCode`(如 TENANT_A)，否则 403「租户编码无效」；平台管理员 tenantCode="platform"、role="platform_admin"。
- **API分流(根因坑)**：dev代理 toMessageService(doc-develop/dev-proxy.js)+Nginx booking*.conf 须覆盖 message-service 全部 /api/v1 前缀(message/sensitive/sse/users)。漏配→请求误路由 booking→返回"资源不存在"。(2026-10-03 敏感词 /api/v1/sensitive 漏配已修：dev-proxy.js + booking.conf + booking-ip.conf 三处加 sensitive 分支)
- 后端挂死：非API路径秒回404、/api/**全超时；jstack见http-nio线程BLOCKED@StandardWrapper.allocate；处置：java启动必 > 日志 2>&1 后taskkill重启。
- 排障：netstat -ano|grep LISTENING→PID；jcmd <pid> VM.command_line；jstack <pid>。wmic禁用；**Git Bash 下 taskkill /PID 会被 MSYS 路径转换误判→用 MSYS_NO_PATHCONV=1 taskkill /PID <pid> /F 强杀代理/后端**；命令行含password触发敏感审批→curl -d @json文件(Write落盘UTF-8)。
- **异常堆栈去 `api/logs/spring-boot-app.log` 找**（相对 jar 启动目录）：logback-spring.xml:8 是 `LOG_DIR=${LOG_PATH:-./logs}`，认**环境变量 LOG_PATH**、**不认** spring 的 `--logging.file.name`（传了也不落盘，别在它上面浪费时间）。要完整堆栈直接查该文件，比重定向 stdout 可靠（后者 GBK 混杂会被截断）。
- **curl 前先查注解的 method 与路径，别猜**：`/course/booking/updateStatus` 是 **@PostMapping**（PUT 会 500 `HttpRequestMethodNotSupportedException`）；候补递补是 `/booking/waitlist/promote` 且字段 `id`（非 `bookingId`）。造 token 用 HS512、sub 须真实 user_id。

## 登录/注册/公开页
- login.html：index→landing→login→角色页；tCode锁tenant、registered=1须跳过自动跳转；submitRegister返回false不得弹成功。
- 后端口径：POST /auth/login、POST /user/register、GET /user/account/exist；登录仅拦frozen/inactive。
- 公开页防跳登录：utility_request.js 401拦截(__PUBLIC_LANDING__||noAuthRedirect)+api.js InitUserInfo顶层守卫(isPublicPage)；__PUBLIC_LANDING__=true须在api.js前注入。

## 业务规则
- **booking→appointment 联动（2026-10-08 第3批已收回服务端）**：单一实现 `BookingAppointmentSyncService`，接入 `BookingService` 三入口(updateStatus/update/create含复用分支)。**仅 booked 生成课次**；映射表：cancelling→`cancelling`(学生/整单发起)、cancelled→`cancelled`、frozen→`frozen`(课次保留行不物理删)、waiting/rej-booking→不生成+置cancelled、booking/rej-cancelling→还原active、**未登记状态→不动**(宁不同步不盲写)。`completed`/`changed` 课次**不覆写**(真实已发生的事实)。
- **课次状态前缀语义（铁律，混用即失去可追溯性）**：`s-`=学生课次级 / `t-`=教师课次级 / 无前缀=整单级。`t-cancelling`/`t-cancelled` 已被教师端「申请改期」占用(`appointmentState.js:26`)，**整单取消绝不可用 t-**；学生/整单发起的取消待确认用 `cancelling`。权威源 `common/AppointmentStatus.java` ↔ `shared/domain/appointmentState.js` 须同步登记。
- **课次生成幂等缺口(已修)**：`generateAppointmentsForBooking` 原「已存在就跳过」会让 `booked→cancelled→booked` 后课次永远停在 cancelled(**时间表凭空消失**)。现校验是否存在仍生效课次(`occupiesTime`)，全失效才 removeByBookingId+重生成。
- 术语(sys_term)：三级(0,0)平台/(行业,0)行业/(租户,行业)租户；语言优先作用域；TermMsg.t("{key}")只替换显式{key}。
- 候补/名额并发：排期行锁+锁定读计数(禁COUNT+FOR UPDATE)+加锁顺序"排期→booking"+CAS。(详见seat-oversell-concurrency-audit)
- 退改规则：course_id=''租户默认；两阈值+partial_refund_percent；生效课程>租户默认>内置兜底(24h/12h/50%)。
- 上课通知规则：三表(头/明细/流水)；明细进IGNORE_TABLES；整组覆盖；生效课程>租户默认>内置兜底(3天/1天/1h/30min)；NotifyTask每60s逐租户setTenantId+finally clear。
- SSE：pushToUser catch生效；connect覆盖旧emitter必old.complete()。
- **`booking.teacher_id` NOT NULL 无默认值**：直接调 `POST /booking/create` 不带 teacherId 必 500(前端正式链路会带)。

## 免登录接口×租户插件
- 无租户上下文入口被追加tenant_id=-1→恒不命中；放行=白名单(进得来)+查询@InterceptorIgnore(tenantLine="true")；admin侧先requireTenantContext()。

## 微信登录(2026-09-20屏蔽)
- User.wxOpenid exist=false；wechatLogin/bindWechat块注释。恢复：去exist=false+取消注释+ALTER TABLE user ADD COLUMN wx_openid。

## 一码多端(Web+微信小程序,2端)
- 不上uni-app(≤2端净负收益)；视图层可不一致；管理端多数不进小程序(仅booking-audit/lesson-notice)；漂移校验=阻断(check-miniprogram-shared-sync.js+pre-commit)。
- shared/(ESM零DOM)单一权威源：P0桥接window.*Domain/*Adapter；P1 domain已7模块；P2适配器net/storage/ui/router已接线。
- 关键坑：①桥接须IIFE包裹(否则const冲突→整段内联崩溃) ②STORE垫片归一getItem/setItem/removeItem。

## 跨端冗余收敛（2026-10-07 完成）
- **端点常量唯一权威源 = `shared/apiPaths.js`（87 个）**。Web 各文件顶部 `const EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};`（桥接挂 `window.ApiPaths`）；小程序端 ESM 直 `import`。代码层 `/api/v1/...` 字面量已清零（仅注释保留说明）。
- **守卫**：`node tools/check-endpoints-refs.mjs` —— ①引用完整性(两端 `ENDPOINTS.X`/别名 `EP.X`) ②硬编码防回归(**含 `frontend/*.html` 的内联 `<script>`**) ③`BACKEND_PROBES` 降级快照一致性。自测 `node tests/check_endpoints_guard.js`（15 项反向测试，证明守卫真会红）。npm: `check:endpoints` / `test:endpoints-guard`。**改 shared/apiPaths.js 后必重跑** `frontend/tools/gen-shared-bridge.js` + `tools/sync-miniprogram-shared.js` + `check-miniprogram-shared-sync.js` + `node frontend/build.js`。
- **扫 html 必须先掩码**：`maskHtmlForScan()` 把 `<!-- -->` 与 `<script>` 标签及外围内容替换成**等长空格**（`s.replace(/[^\n]/g,' ')`）——去掉换行会毁掉行号/偏移、报告指错位置。现状 12 个 html / 19 段有效内联 script，零硬编码。**index.html 原 5 处 `/api/v1/` 全在注释内无需收敛**；另 `index.html:306-321` 的 `showApiError` script 整块位于 275-331 注释区间，是从未执行的历史遗留。
- **`BACKEND_PROBES`**：后端探测目标(key/label/url/prefix)权威源在 shared/apiPaths.js；`admin-dataMaintainPage.js` / `platform-admin-backend-info.js` 各留一份**降级快照**（守卫逐字段校验，防退化成"第二份会漂移的真相"）。**`prefix` 是载荷字段**（决定 Nginx/dev 代理分流到 8081 还是 8090），不是展示字段。desc/icon 属界面文案，各页自持。
- **文案"重复"要参数化，不要统一**：`bookingStatusText(status, {profile:'web'|'default'})` + `STATUS_TEXT_PROFILES`。Web=「预定待确认/预定已确认」，小程序=「待确认/已确认」——合成一套＝把已拍板的差异单方面回退（用户可见）。
- `frontend/index.html` 内联脚本仍 5 处 `/api/v1/...` 未收敛：该文件含需单独审批内容，**未读未改**；收敛后把 `*.html` 并入守卫 ROOTS。

## 前端铁律(补充)
1. 顶部刷新=refreshRightPage()+registerPageRefresh(menuKey,fn)；标题≠菜单key。
2. 异步必await；切换刷新带序号丢弃过期响应。
3. 判定链接正则勿用$锚定文件名(末尾是查询串)。
4. 显示≠判定口径：数值进data-*、文案进value；<input type=number>静默丢文本→须text；只读须readonly属性+class双全。
5. 刷新≠切换课程：刷新须保持当前排期(fillScheduleSelect(list,keepScheduleId))。
6. 小程序标题双源：json `navigationBarTitleText`(首帧) vs 运行时 `wx.setNavigationBarTitle`(**会覆盖 json**)——固定标题页须 grep 清掉运行时设标题，否则"改了没生效"。
7. 教师端菜单名固定=「预订管理」(与 Web/文档一致)，**不参与行业词转换**；仅页内描述性文案走 `{{terms.*}}`。
8. **用字口径（2026-10-06 用户拍板）**：**小程序内统一用「预订」**（`miniprogram/` 已零「预定」）；**Web/API 维持「预定」不动**（含状态「预定待确认」、深链「直达预定」、后端 TermMsg）——跨端用字不一致是**已知且接受**的状态，勿擅自"修正"Web 侧(会连动 tests 断言 + frontend/dist 重建)。
9. **小程序表单页写库前必查 4 项**（排期编辑 2026-10-06 实证，同类页复用）：① 目标表 NOT NULL 且**无默认值**的列必须显式给值（`course_schedule.time_zone`/`name`；mapper XML 是显式列清单，传 `undefined` 会写成 NULL 而非走 DDL 默认 → 500）② `tinyint(1)` 列取值 −128..127（`available_sites` 上限 127）③ 表级 `CHECK` 约束要在前端先拦（`end_time > start_time`）④ 数值输入用**字符串承载 + text 类型**，允许空中间态，`bindblur` 再归一——`type="number"` 配 `Number(v)||1` 会让「清空重输」反弹成拼接。`setData` 路径写错（写到页面顶层而非 `form.x`）不会报错，只会静默漏清值——改完 grep 一遍旧字段名。
10. **WXML 绑定里禁止函数调用**（2026-10-06 排期编辑「每周星期/每月日期点了没反应」根因）：WXML 表达式只支持 三元/算数/逻辑/字符串拼接/属性与下标取值，`{{arr.indexOf(x)>=0?'on':''}}` 编译期失败且**静默渲染成空**（不报错、值其实已改、就是不变色）。铁律：多选/列表类选中态一律由 JS 派生（`withSel(list,set)` → `item.on`）并**与数据同一次 setData**；命中点用 `<view>`（`<text>` 可点区只有字形）＋`hover-class` 反馈。扫全仓判据：`grep -rnE '\{\{[^}]*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(' miniprogram --include=*.wxml` 须零命中。
11. **学生端约课链路三处契约（2026-10-06 实证，详见技能 student-booking-flow-align）**：① 提交预订必带 `teacherId`——`booking.teacher_id` NOT NULL 而 `course_schedule` **无 teacher_id 列**，只能取 `Course.teacherId`（缺了必 500 `Column 'teacher_id' cannot be null`）② 学生侧预约过滤字段是 **`userId` + `userRole:'student'`**（`BookingQueryPage` 无 studentId；传错＝`<choose>` 不生效＝返回本租户全部学生预约，是越权读）③ 「延期/请假」是**课次级**动作（`PUT /appointment/updateStatusById {id,status}`，申请=cancelling、取消延期=active），不是整单动作；`completed/cancelled/changed/t-cancelling` 不放出按钮。另：`selectByCourseId` 的 Authorization 头**必填**（不能 tokenOnly）；`teacher/published/public-list` 的 `tenantCode` 为空会**静默返回空数组**，且 VO 只有 `{publishedProfileId,teacherId,name,title,summary,coverUrl}` 五个字段。
12. **学生端底部 tab/入口改名（2026-10-06）**：学生端「浏览约课/约课」统一为「课程预订」，走行业词 `{{course}}预订`（课程预订/咨询话题预订/健身科目预订）——含 `booking.json` 首帧标题、`home.wxml` 图标与快速开始文案、`shared/constants.js` 的 `textTerm`。该页标题**确实随行业变**，故保留运行时 `wx.setNavigationBarTitle`（与铁律 6 的"固定标题页"相反）。

## 消息中心(message-service)
- 分类CRUD已全(CategoryController)；发送弹窗#msg-category readonly仅下拉(首项"不分类")；admin-messageCategory.js挂admin+platform_admin「系统配置」。
- 数据模型双轨：msg_message(主,全局唯一) vs msg_inbox(按收件人写扩散,联表取主消息)。**架构红线：绝不可单独DELETE主消息(会让收件人副本空白)**。
- 删除三档：①收件人软删→回收站→purge(只删msg_inbox个人副本) ②withdraw(撤未读+改主消息status) ③管理员全局删deleteMessageGlobal(级联主消息+所有inbox+delivery+SSE message_deleted,限admin/platform_admin,非平台仅本租户)。
- 前端：sentRowHtml管理员"彻底删除"+admin-messageManage.js(「消息管理」页,GET /api/v1/messages历史+筛选+彻底删除)挂双端；SSE消费message_deleted即时移除。
- message-service不挂TenantLineInnerInterceptor，租户隔离靠显式tenantId；mvn离线编译通过。

## 文档/技能/工具
- 技能：saas-api-build-smoke/shared-domain-sink/shared-adapter-wire/seat-oversell-concurrency-audit/public-endpoint-tenant-bypass/browserless-frontend-itest/server-side-term-template/source-encoding-repair/miniprogram-page-registry-audit/paged-response-field-contract-audit/miniprogram-grouped-enrich-list/miniprogram-term-localization/**miniprogram-form-schema-align**(表单页↔表结构对齐)/**student-booking-flow-align**(学生端约课链路:课程→排期→预订/候补→我的预约→课次请假→浏览教师,含 6 坑)。
- 工具踩坑：并行同文件多Edit只最后生效→串行+grep核验；替换前探测行尾(CRLF/LF)；Maven GBK输出先iconv。
- **Windows `path.join` 陷阱**（2026-10-07 实证）：`path.join` 在 Windows 产**反斜杠**，与 `path.relative().split(path.sep).join('/')` 产出的正斜杠比对恒 false → Set.includes 静默失效（生成产物没被跳过、子检查空跑**假通过**）。脚本内相对路径清单一律写 **POSIX 正斜杠**，另加"必须真校验过 N 份"的断言。
- **node 内 `spawnSync(process.execPath)` → EBUSY**（托管 node.exe 占用/沙箱）：需在脚本里跑另一个 node 脚本时，改用**同进程动态导入 + 临时接管 `process.exit`** 取退出码。`tests/miniprogram-itest/static.mjs` 的 63 FAIL 也是它自己 `spawnSync cmd.exe EBUSY`，非代码问题。
- 缺 `jsdom` 的用例：`export NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules`（该工作区已装 jsdom）。
- **vm 源码切片测试易被"外层新增声明"打断**：改被切片文件顶部后，切片内引用的绑定可能不在切片里 → ReferenceError。修法＝把源码那**一行原样**补在切片前 + 断言该行仍存在（形状变了 exit 2，不静默降级）。

## 薄弱环节审计结论（2026-10-07，报告=预约系统薄弱环节分析报告-20261007.md）
- **五根因**（比缺陷清单更重要）：A 授权模型缺失(全仓0处hasRole/@PreAuthorize，只认证不授权，靠手写PermissionCheck→抽样命中) B 业务正确性外包前端(课次生成/级联取消/状态机合法性都在浏览器) C DB定义无单一事实源(完整DDL被.gitignore排除) D 密钥明文入库(jwt/aes/hmac/DB密码，**AES泄露不可靠轮换补救，须+历史数据重加密**) E 可观测性与后端测试真空。
- **已实测脏数据**：appointment 142行中102行 booking_id 悬空——根因是 booking_id 有**两个生成器**(BookingService.java:74 产32位hex vs CourseScheduleService.java:464 产36位dashed UUID)，且 appointment **无FK无索引**。notification_dispatch_log 12行悬空。
- **提权链已于 2026-10-08 修复**（勿再按旧描述当现存缺陷）：① 角色白名单+首账号 bootstrap 统一收口到 `UserService.applyRoleAdmission`，两入口共用；`/register` 走 bootstrap(本租户首个 admin / 全系统首个 platform_admin，其余 pending)，`/add` 按调用者角色裁定(须管理员；租户管理员禁建 platform_admin)。并发用 `countByTenantAndRoleForUpdate/countByRoleGlobalForUpdate` 的 FOR UPDATE 锁定读，**已双会话实测阻塞 4115ms**（user 表只有单列 idx_tenant_id，锁范围偏宽但不影响正确性）。② `/auth/password/reset` 加 checkAdmin（零前端调用点，收窄安全）。③ changePassword 改**两态**：管理员同租户代管免原密码 / 本人改密必填 oldPassword(前端已 prompt 采集) / 其余 403。④ `assertUserScope` 接入 listInbox/unreadCount/listMessageIds。⑤ purgeOne 改 deleteById(in.getId())。
- **做得好、勿误伤**：BookingSeatService 席位闸门(行锁+锁定读+CAS，5路径全覆盖)、通知幂等 uk_dispatch_once、备份脚本、调试输出0残留。
- **待用户确认**：各租户是否都已有 admin（bootstrap 改造后"无人可审批"会死锁）；hardening脚本是否已执行 / refreshToken是否真NPE不可达 / jwt.expiration=360000000(100h)是否笔误 / 8081-8090是否公网可直连。
- **`/user/add` 口径勿再改回"只允许 student/teacher"**：`platform-admin-user.js:161` 的新增用户下拉只有 platform_admin/admin 两项，平台管理员靠它开租户管理员，一刀切会打死该功能。
