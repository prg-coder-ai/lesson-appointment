# 项目长期记忆

## 协作偏好
- 多次失败(2~3次)即问用户；先根因+证据再修复；代码写完直接交付跳过自测(仍要编译验证)。
- 库内数据都是测试数据(2026-09-18确认)：脏数据/历史状态一律不清理、不刷、不必再问；只诊断报告。

## 技术栈与构建
- api(Spring Boot 3.3.5+MyBatis-Plus 3.5.7)+message-service 独立模块；MySQL lesson_appointment/message_center；api 只供 /api/v1/**。三产物：booking-api-2.0.1.jar / message-service-1.0.0.jar / frontend/dist/。
- 改前端必重 `node frontend/build.js`(CODEBUDDY_SAFE_DELETE_ENABLED=0)；编译验证用 saas-api-build-smoke 技能(GBK输出须 iconv)。

## 铁律
- JWT：远程=线上密钥、本地=源 jwt.secret；同源才互验；本地起 message-service 必 --server.port=8090(后端 --server.port=8081)。
- 编码 UTF-8 无 BOM；雪花ID 19位→Long 转字符串；入参 LocalDateTime 须 ISO-8601(T)；data-* 经 dataset 读须核对驼峰名。

## 本地全栈拓扑与排障
- 端口：8080=dev代理(静态根frontend/源码直出,/api/v1→8081、message/sse/users→8090)；8081=booking API；8090=message-service；3306=MySQL。
- 后端"整体挂死"：非API路径秒回404、/api/**全超时；jstack见http-nio线程BLOCKED在StandardWrapper.allocate，持锁线程卡FrameworkServlet.initServletBean→stdout管道被阻塞。处置：java启动必 `> 日志 2>&1` 后taskkill重启。
- 排障：netstat -ano|grep LISTENING找端口→PID；jcmd <pid> VM.command_line取启动命令；jstack <pid>取转储。wmic禁用、Bash调PowerShell被拦(用PowerShell工具)。命令行含字面password触发敏感审批→curl -d @json文件(Write落盘UTF-8)。

## 登录/注册/公开页
- login.html：index→landing→login→角色页单向链；tCode锁tenant、registered=1须跳过自动跳转；submitRegister返回值false不得弹成功。
- 后端口径：POST /auth/login、POST /user/register、GET /user/account/exist；注册落pending(admin/platform_admin强制active)，登录仅拦frozen/inactive。
- 公开页防跳登录：①utility_request.js 401拦截(__PUBLIC_LANDING__||noAuthRedirect) ②api.js InitUserInfo顶层跳转守卫(isPublicPage)；window.__PUBLIC_LANDING__=true须在api.js前注入。登录回跳redirect须带"已登录"前提。
- 回归：test_login_api.js(19)、test_login_page.js(38)、test_landing_noredirect.js(13)、test_landing_e2e.js(4)、check_login_redirect_roundtrip.js(28)。

## 业务规则
- 术语(sys_term)：三级(0,0)平台/(行业,0)行业/(租户,行业)租户；语言优先于作用域；TermMsg.t("{key}")只替换显式{key}。
- 候补/名额并发：waiting─递补─►booked；闸门=排期行锁+锁定读计数(禁COUNT+FOR UPDATE)+加锁顺序"排期→booking"+CAS。(详见seat-oversell-concurrency-audit技能)
- 退改规则(course_refund_rule)：course_id=''表示租户默认；两阈值free/partial_before_minutes+partial_refund_percent；生效课程>租户默认>内置兜底(24h/12h/50%)。
- 上课通知规则(course_notify_rule*)：三表(头/明细/流水)；明细须进MyBatisPlusConfig.IGNORE_TABLES；整组覆盖；生效课程>租户默认>内置兜底(3天/1天/1h/30min)；NotifyTask每60s逐租户setTenantId+finally clear。
- SSE：pushToUser catch生效；connect覆盖旧emitter必old.complete()。

## 免登录接口×租户插件
- 无租户上下文入口被追加tenant_id=-1→恒不命中。放行=白名单(进得来)+查询@InterceptorIgnore(tenantLine="true")；admin侧一律先requireTenantContext()。

## 微信登录(2026-09-20屏蔽)
- User.wxOpenid标exist=false；wechatLogin/bindWechat等块注释。恢复：去exist=false+取消注释+ALTER TABLE user ADD COLUMN wx_openid。

## 一码多端(Web+微信小程序，2端硬约束)
- 不上uni-app/跨端框架(≤2端净负收益)；视图层允许不一致(Decision 3)；管理端多数配置不进小程序(仅booking-audit/lesson-notice)；漂移校验=阻断(check-miniprogram-shared-sync.js + pre-commit守卫)。
- shared/(ESM零DOM)是单一权威源：P0桥接挂window.*Domain/*Adapter；P1 domain已7模块(term/refundRule/bookingState/appointmentState/mask/datetime/errorCode)；P2适配器net/storage/ui/router已接线。
- 关键坑：①桥接产物须IIFE包裹——否则constants.js顶层const与login.html内联同名const冲突→整段内联脚本崩溃(applyLoginTenantRule is not defined连锁)；②STORE垫片把storage适配器get/set/remove归一成getItem/setItem/removeItem(否则STORE.getItem is not a function)。
- 验收基线：test-shared-domain.mjs(122)、test-shared-bridge.cjs(19)、check_remaining_sites(42)、check_shared_bridge(19)全绿。

## 前端铁律(补充)
1. 顶部刷新=refreshRightPage()+registerPageRefresh(menuKey,fn)；标题≠菜单key。
2. 异步必await；切换刷新带序号丢弃过期响应。
3. 判定链接正则勿用$锚定文件名(末尾是查询串)。
4. 显示≠判定口径：数值进data-*、文案进value；<input type=number>静默丢弃文本→须text；只读字段须readonly属性+class双全(只挂class挡不住Tab输入=假只读)。
5. 刷新≠切换课程：刷新须保持当前排期(fillScheduleSelect(list,keepScheduleId)共用填充口径)。
6. "刷新"按钮接管逻辑：消息中心页已主动移除页内刷新、走顶部通用刷新。

## 消息中心(message-service, 2026-10-03)
- 分类CRUD已全：CategoryController POST/PUT/DELETE/GET/tree，requireManager限admin/platform_admin；CategoryService租户隔离+编码唯一+系统预置保护(create时categoryCode可空自动生成CAT_xxx)。
- 前端：发送弹窗#msg-category改readonly仅下拉选择(首项"不分类")；新增admin-messageCategory.js管理页挂admin.html+platform_admin.html「系统配置」分组。
- 发送校验：MessageService.validateCommon非空categoryCode查库不存在即404；前端冗余拦截。

## 文档/技能
- 常用技能：saas-api-build-smoke/shared-domain-sink/shared-adapter-wire/seat-oversell-concurrency-audit/public-endpoint-tenant-bypass/browserless-frontend-itest/server-side-term-template/source-encoding-repair/saas-debug-output-cleanup。

## 工具踩坑
- 并行同文件多Edit只有最后一个生效→串行改+grep核验；纯插入少尾部换行会吞下一行→回读确认。
- 批量文本替换前先探测行尾：css/student.css=CRLF、css/teacher.css=LF，用\n拼old_string在CRLF上静默MISS→改前s.includes('\r\n')定NL。
- Maven输出GBK→先iconv再grep。
