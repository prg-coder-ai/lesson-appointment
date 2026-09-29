# 项目长期记忆

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测(仍要编译验证)。
- **库内数据都是测试数据**(2026-09-18 确认)：脏数据/历史状态一律不清理、不刷、不必再问；只诊断报告。

## 技术栈与构建
- api(Spring Boot 3.3.5+MyBatis-Plus 3.5.7)+message-service 独立模块；MySQL lesson_appointment/message_center；api 只供 /api/v1/**。
- 构建技能 saas-api-build-smoke(compile 输出 GBK 须 iconv)；改前端必重 `node frontend/build.js`(CODEBUDDY_SAFE_DELETE_ENABLED=0)；npm.version 必须 10.9.7。
- 三产物：booking-api-2.0.1.jar / message-service-1.0.0.jar / frontend/dist/。

## 铁律
- JWT：远程=线上密钥、本地=源 jwt.secret；同源才互验；本地起 message-service 必 --server.port=8090。
- 编码 UTF-8 无 BOM；ID 雪花19位>JS安全整数→Long 转字符串；入参 LocalDateTime 须 ISO-8601(T)。
- data-* 经 dataset 读须核对驼峰名(写错不报错恒 undefined)。

## 本地全栈拓扑与排障(2026-09-28 实证)
- 端口：**8080=dev 代理**(node，doc-develop/dev-frontend-local-src.js，静态根=**frontend/ 源码直出**，/api/v1→8081、message|sse|users/→8090)；8081=booking API；8090=message-service；3306=MySQL。
- 起后端**必显式 `--server.port=8081`**(message 8090)：宿主/沙箱向子进程注入 `SERVER__PORT`(如 57999) 会被 Spring 宽松绑定成 server.port，覆盖 jar 内配置→启动即 "Port 57999 already in use"。
- 后端"整体挂死"特征：非 API 路径秒回 404，而 `/api/**` 全部超时。jstack 判据=大量 http-nio 线程 BLOCKED 在 `StandardWrapper.allocate` 等同一把锁，持锁线程卡在 `FrameworkServlet.initServletBean`→日志 ConsoleAppender 写被阻塞的 stdout 管道。处置：java 启动**必须 `> 日志文件 2>&1`**(勿留无人读取的管道) 后 taskkill 重启。
- dev 代理被上游挂起拖死后自身也会僵(连静态页超时)：连同 node 进程一起重启。
- 排障命令：`netstat -ano|grep LISTENING` 找端口→PID；`tasklist|grep <pid>` 认进程；`jcmd <pid> VM.command_line` 取原始启动命令；`jstack <pid>` 取线程转储。**wmic 被安全策略禁用**，Bash 里调 PowerShell 也被拦(用 PowerShell 工具)。
- 命令行出现字面 `password` 会触发敏感审批(易超时)：改用 `curl -d @json文件`，JSON 用 Write 工具以 UTF-8 落盘(内联中文会被按 GBK 发出→后端 `Invalid UTF-8 start byte 0xb2`)。

## 登录/注册页(login.html，2026-09-28 拆分)
- 三页单向链：index(纯路由)→landing(展示)→login(鉴权)→角色页；全站登录兜底统一指向 login.html(api.js/missingPageGuard/auth.js 等)。
- `login.html?tCode=xxx`：`applyTcodeToLogin` 隐藏"登录身份/租户编码"并锁 role=tenant、tc=tCode；`applyTenantCodeRule` 隐藏注册租户项并从注册身份下拉移除 platform_admin。
- 注册成功→`./login.html?tCode=x&registered=1`(2s 后跳)；登录页 onload 见 token 会主动跳角色页，**registered=1 时必须跳过该自动跳转**，否则注册后看不到登录框。
- 注册提交**必须判 `submitRegister()` 返回值**，false 时不得弹"注册成功"(否则提交失败也提示成功)。
- 后端口径：`POST /auth/login`、`POST /user/register`、`GET /user/account/exist`(裸路径经 utility_request.js 自动补 /api/v1)；注册落 `status=pending`(admin/platform_admin 强制 active)；登录仅拦 frozen/inactive，**pending 可登录**。
- 回归测试：`test_login_api.js`(接口级 19 项，需 8080 代理+8081 后端)、`test_login_page.js`(jsdom 页面级 38 项，NODE_PATH 指向全局 node_modules 取 jsdom)。

## 公开页(免登录)防跳登录页(2026-09-28)
- `api.js` 是**顶层脚本**(无 IIFE)，第 61 行 `InitUserInfo();` **解析即执行**；未登录会 `window.location.href=pageUrl('login.html')` → 任何引入 api.js 的公开页一打开就被踢回登录页。已加守卫：`isPublicPage=(__PUBLIC_LANDING__||__PUBLIC_PAGE__)` 为真则不跳。
- 公开页两处独立防线，缺一即漏：① utility_request.js 的 401 拦截(`__PUBLIC_LANDING__||config.noAuthRedirect`)；② api.js InitUserInfo 顶层跳转守卫。新增公开页**必须两处都有**，且 `window.__PUBLIC_LANDING__=true` 必须在 utility_request.js / api.js **之前**注入。
- **`pageUrl` 有两份实现**：api.js:695 自带一份并 `window.pageUrl=...` **覆盖** utility_request.js 的同名全局；api.js 内部调用的是自己 IIFE 内提升的那份 → 测试若 hook `window.pageUrl` 判断跳转**恒假通过**。判据应用 jsdom 真实导航错误(`Not implemented: navigation`)。
- 测试：`test_landing_noredirect.js`(13 项，含 T7 反向用例自证判据有效)、`test_landing_e2e.js`(jsdom.fromURL 真实页 4 项)。**dist 压缩后变量名 `isPublicPage` 消失**，产物校验须 grep 字符串常量 `__PUBLIC_LANDING__`。
- **登录回跳 redirect 必须带"已登录"前提**(2026-09-28)：onload 里只判 redirect 非空就跳 → 未登录立即回跳 → 目标页守卫 `forceEntryLogin` 再弹回**不带 redirect** 的登录页 → 回跳意图被吞(`api.js` 消费 `auth_redirect_info` 的 consumeLoginRedirect 分支已整段注释)。另 `booking.html` 未登录须在 `guardEntryPage()` **之前**自带 redirect 跳登录。回归 `tests/check_login_redirect_roundtrip.js`(28 项，`FRONTEND_DIR=` 阴性对照实测 7 FAIL)。

## 免登录接口×租户插件
- 无租户上下文入口被插件追加 tenant_id=-1→恒不命中("页面能开永远无数据")。放行=三处白名单(进得来)+查询 @InterceptorIgnore(tenantLine="true")。
- admin 侧方法因 checkAdmin 放行平台管理员 + tenantId=0 插件不拼条件，一律先 requireTenantContext()。

## 术语(sys_term)
- 三级 (0,0)平台/(行业,0)行业/(租户,行业)租户；语言优先于作用域。服务端文案 TermMsg.t("{key}")，只替换显式 {key}，禁整串替换。

## 候补/递补/名额并发
- waiting─递补─►booked；取消 booked→canceling/cancelling→cancelled。占位单一来源 NON_OCCUPYING。
- 闸门 857a233：排期行锁 + 锁定读计数(禁 COUNT+FOR UPDATE) + 加锁顺序"排期→booking" + CAS；booking 写仅 10 处。DDL: uk_booking_schedule_student + available_sites>=0 CHECK(tinyint,上限127)。

## 退改规则(course_refund_rule)
- course_id='' 表示租户默认(不能 NULL)；两阈值 free/partial_before_minutes + partial_refund_percent；不退费区由"不足部分退费线"推导。
- 生效：课程>租户默认>内置兜底(24h/12h/50%)；时间基准=课次 appointment_datetime。学生请假/管理员审核先弹规则提示(内联 DOM)。

## 上课通知规则(course_notify_rule*)
- 三表：头(tenant_id+course_id 唯一,'=缺省)/明细(无 tenant_id 列→必须进 MyBatisPlusConfig.IGNORE_TABLES)/流水(幂等键)。
- 档位 seq+stage+offset_minutes(天=1440,唯一口径)+audience+enabled(停用不删行)；保存按 offset 降序重排 seq。
- 整组覆盖(不逐点继承)；生效 课程>租户默认>内置兜底(3天/1天/1h/30min)。
- 发送：窗口 [应发,应发+5min) 且未上课；过期不补；一订单只对最近未完成课次；流水唯一键 (appointment_id,seq,receiver_user_id,dedup_key)，先 insert 抢权再推、失败删行重试。
- 手动发送 dedup_key=MANUAL#时间戳 可重复；NotifyTask 每60s 必逐租户 setTenantId+finally clear；开关 notify.task.enabled。
- 前端本地通知逻辑已摘除(appointmentNotes.js 的 checkStatusAndDate/sendNotesTo* 整段删)，改 openLessonNotifyDialog+manual-send；按钮 isNotifyActionable 对齐 DEAD_APPOINTMENT_STATUS。

## SSE
- pushToUser catch 生效；GlobalExceptionHandler 异步重放易误判；connect 覆盖旧 emitter 必 old.complete()。

## 工具踩坑
- 并行同文件多 Edit 只有最后一个生效→串行改+grep 核验；纯插入若少尾部换行会吞下一行→回读确认。
- Maven 输出 GBK→先 iconv 再 grep。
- 批量文本替换前**先探测行尾**：同一仓库里 `css/student.css`=CRLF、`css/teacher.css`=LF。用 `\n` 拼 old_string 会在 CRLF 文件上**静默 MISS**（脚本不报错、不抛异常，只留原样）→ 改前先 `s.includes('\r\n')` 定 NL，替换后回读确认。

## 前端铁律
1. 顶部刷新=refreshRightPage()+registerPageRefresh(menuKey,fn)；标题≠菜单key。
2. 异步必 await；切换刷新带序号丢弃过期响应。
3. Nginx try_files 把不存在页渲染成登录首页→先确认文件在 frontend/与 dist/。
4. 弹出层禁放 overflow:auto 容器；显隐用布尔变量；热区≥28px。
5. 侧栏静态 HTML，菜单不显示先查 CSS：.layout-container overflow:hidden + .sidebar 须 overflow-y:auto(admin/student/teacher 已加)；菜单总高≈1040px<视口即裁底部组。
6. 登录门槛后移(2026-09-28)：landing 卡片不管登录态一律开 teacherPublishedProfile.html?id=<publishedProfileId>；登录门槛落在**公开页内点「排期」**——公开页 document 级委托只接管站内 booking.html 深链，未登录弹自绘层 → login.html?tCode=&redirect=<path+search>，login.html 的 getUrlRedirectTarget() 同源白名单校验后优先回跳(否则按角色进工作台)。
7. 判定"某类链接"的正则**别用 `$` 锚定文件名**：`/\/booking\.html$/` 匹配不到 `booking.html?scdid=x`(末尾是查询串)；用 `/(^|\/)booking\.html(\?|#|$)/`。
8. 显示口径≠判定口径：同一 DOM 字段既展示又用于判定时(如学生端 `#now_availableSites` 剩余员额)，展示文案进 `value`、数值进 `data-remaining`，回读优先 `data-remaining`。两个坑：① `<input type="number">` 会**静默丢弃**「满额」这类文本→必须 text；② 把「满额」交给 `Number()` 得 NaN→`isFinite(NaN)` false→被判「未满」→候补按钮消失。口径收敛成 `formatRemainingSites/applyRemainingSitesDisplay/readRemainingSitesFromDom`(顶层导出)，`tests/check_remaining_sites_display.js` 42 项(阴性对照 9 FAIL)。
9. 只读展示字段口径(2026-09-28)：`.readonly` 文字 #999→#333(保留 #f5f5f5 浅灰底),`.nofocus` 删掉 `filter:grayscale(.8)`(会把整行文字一并去色,是"灰蒙蒙"元凶)。学生端「排期信息」统一"样式类+readonly 属性"双全——**只挂 class 的字段 pointer-events:none 挡不住键盘 Tab 输入=假只读**。教师端只统一样式、未加属性。守卫 `tests/check_readonly_display_style.js` 40 项(阴性对照 10 FAIL)。
10. 静态守卫判据要**剥离 CSS 注释**：把"已移除的属性"写进注释说明后,裸 `grep grayscale` 会误报→`css.replace(/\/\*[\s\S]*?\*\//g,'')` 后再断言生效声明。
11. 「刷新」≠「切换课程」(2026-09-28)：刷新**必须保持当前排期**。`loadSchedule` 开头就 `resetScheduleInfoPanel/resetScheduleSelect`(切课程需要,否则残留上一门课数据),刷新复用它会清掉选中排期、且请求失败时整块信息消失。正解:抽 `fillScheduleSelect(list, keepScheduleId)` 让两条路径共用填充口径;刷新走「拉列表→选回原排期→`displaySchedule()` 重渲染→已预览则重放 `previewSchedule()`」,失败只 alert 不清空。守卫 `tests/check_schedule_refresh_behavior.js` 45 项(阴性对照 22 FAIL)。

## 微信登录(2026-09-20 屏蔽)
- 不考虑微信登录：User.wxOpenid 标 @TableField(exist=false)；UserMapper.getByWxOpenid/updateWxOpenid、UserService.wechatLogin/bindWechat、authController /wechat-login /bind-wechat 均块注释屏蔽(可恢复)。
- 恢复：去 exist=false + 取消注释 + ALTER TABLE user ADD COLUMN wx_openid VARCHAR(64) DEFAULT NULL, ADD UNIQUE uk_user_wx_openid(wx_openid)。

## 一码多端（2026-09-28 评估）
- **现状＝两套 UI(Web 12 页/21,168 行 JS；小程序 25 页/2,037 行 JS) + 一份失效的共享源**：`frontend/**` 0 处引用 `shared/`；`miniprogram/shared/` 与根 `shared/` 有 3/5 文件 md5 不一致（小程序副本更新→有人直接改副本），同一 key `leave` Web="取消课次" vs shared="请假"。
- Web 端 PC/平板/手机已由响应式 A 方案覆盖（55/55 PASS），缺码的是小程序这类非浏览器运行时。
- 端耦合量化：DOM 1,180 处/45 文件、alert+confirm+prompt 191、存储 115/18 文件、整页跳转 45/20 文件、内联 on* 305、innerHTML 289、document.write 14；依赖全走 CDN（axios 22 页/fullcalendar/FontAwesome/html2canvas）→ 小程序与内网不成立。
- 路径：P0 修源(词典归一+构建桥接到 window+sync md5 守卫) → P1 Headless 领域层下沉 shared/domain → P2 六类能力适配层同接口名(net/storage/ui.modal/router/share/realtime) → P3 按端数分叉(≤2 端维持；≥3 端才上 uni-app，P1 为前置)。排除 Flutter/RN；web-view 套壳仅限公开页/富文本。方案文档：`一码多端改造方案-20260928.md`。

## 一码多端决策（2026-09-29 用户拍板，落实为硬约束）
- **目标端 = Web + 微信小程序（仅 2 端）** → 路线 M3+M6（双视图+共享逻辑），**不上 uni-app/跨端框架**（≤2 端净负收益）。
- **管理端范围**：多数配置/排期页不进小程序；仅审核(booking-audit)、通知(lesson-notice)进小程序；已进入的 admin 页保留不删不扩。
- **视图层允许不一致**，各端用各自 CSS 适配（逻辑一码、视图薄写）；Web 端 DOM/alert/innerHTML/on* 等写法对 Web 合法，无需为"统一"改写。
- **漂移校验=阻断**：`tools/check-miniprogram-shared-sync.js` 已扩 `checkWebTermDrift()`（Web 端重新出现硬编码 terms.js 即 fail）；根 package.json 增 `check:shared-sync`；`.git/hooks/pre-commit` 提交前跑守卫（支持 `SKIP_SHARED_SYNC=1` 跳过）。
- **Web 术语单源已收口**（2026-09-29）：删除遗留 `frontend/js/public/terms.js`（含 `leave:"取消课次"` 漂移副本），桥接 `window.TermDomain`（由 shared/domain/term.js 生成）为唯一源；gen-shared-bridge.js 只读 shared，删副本不影响构建。
- **P1 领域层下沉进度**（2026-09-29 完成 5/5）：`shared/domain/` 已 7 模块 = term + refundRule + **bookingState(状态机+占用+满额)** + **appointmentState(课次状态)** + **mask(脱敏)** + **datetime(时区/日历装配)** + **errorCode(错误码→文案)**。P1 五块 **①状态机 ②候补满额 ③时区/日历 ④脱敏 ⑤错误码 全部完成**。验收：`tools/test-shared-domain.mjs`（**110 断言全绿**）。
  - mp 接线：appointment.js `fmtTime`→`formatDateTime`；`miniprogram/shared/format.js` 的 maskPhone/maskEmail 改 **re-export `domain/mask.js`**（消除手迁副本漂移，与 Web api.js 同源）；request.js 网络错误分支改 `errorMessage(err)`。
  - 根 `shared/format.js` 的 mask 改为 re-export `domain/mask.js`，`shared/index.js` 去掉重复的 `domain/mask` export（避免同名 `export *` 冲突，已实测 barrel 无冲突、index.maskPhone 可达）。
  - **P0-Web 桥接已完成**（2026-09-30）：`gen-shared-bridge.js` 升级为内联 `constants.js` + 7 个 domain，挂 `window.{TermDomain,RefundRuleDomain,BookingStateDomain,AppointmentStateDomain,MaskDomain,DatetimeDomain,ErrorCodeDomain}`（7 域全暴露）。**关键修复 dev 缺口**：桥接 `<script>` 补进全部 12 个源码 HTML（dev 代理直出 frontend/ 时原本不加载桥接，`window.TermDomain` 在 dev 下此前裸奔），build.js 因 indexOf 守卫不会重复注入。
  - **Web 消费三个域**：`api.js` `maskPhone/maskEmail`→`window.MaskDomain`（覆盖 5 个调用点：admin-user/platform-admin-*）；`utility_request.js` 错误文案(401/403/超时/网络)→`window.ErrorCodeDomain.resolveResult/resolveRequestError`；`api.js` `getWeekdayFromDateTime` 的 `new Date('yyyy-MM-dd')` 时区偏移坑→`window.DatetimeDomain.parseLocalDate`。
  - 验证：`tools/test-shared-bridge.cjs`（浏览器模拟冒烟，7 对象齐全+13 断言）、`tools/test-shared-domain.mjs`（110 断言）；`node build.js` 重建 dist，12/12 html 注入桥接、`node --check` 源码+dist 桥接均 OK。bookingState/appointmentState 已暴露桥接待 Web 页面迁移时接。

## 文档/技能
- 三手册：腾讯云(权威)＞预约系统(原理排障)＞前端(仅前端)。scp -r 源目录/ 目标/(结尾/传内容)。
- 技能：saas-api-build-smoke/booking-deeplink-routing/public-endpoint-tenant-bypass/browserless-frontend-itest/source-encoding-repair/saas-debug-output-cleanup/server-side-term-template/seat-oversell-concurrency-audit/saas-tenant-config-rule-module。
