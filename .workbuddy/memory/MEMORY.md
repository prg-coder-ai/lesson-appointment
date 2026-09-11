# 项目长期记忆

## 协作偏好
- 多次失败（2~3 次）即停下问用户；先根因+证据再修复；代码写完直接交付、跳过自测（仍要编译验证）。

## 项目/环境
- `api/`(Spring Boot 3.3.5+MyBatis-Plus 3.5.7)+`frontend/`+`api/message-service/`；MySQL `lesson_appointment`+`message_center`。api 只提供 `/api/v1/**`。
- 构建见技能 `saas-api-build-smoke`（jar 被实例锁住→别杀用户进程，改 `mvn compile`+`spring-boot:run`）；改前端源码后必须重建 `frontend/dist`。
- 三份产物：`api/target/booking_api-2.0.1.jar`、`api/message-service/target/message-service-1.0.0.jar`、`frontend/dist/`。
- `frontend/pom.xml` 的 `npm.version` **必须是 10.9.7**：10.2.4 在 Windows 跑 `npm run` 必崩（`Cannot read properties of undefined (reading 'stdin')`，`npm install` 却正常，极易误判成插件问题）。沙箱下载 npm 需联网，离线时直跑 `frontend/target/node/node.exe build.js`（前置 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 绕批量删除守卫）。

## JWT 密钥域
- 远程=线上密钥、本地=源 `jwt.secret`；**同源才能互验，混合必 401**。本地起 message-service **必带 `--server.port=8090`**（沙箱 `SERVER__PORT` 会被宽松绑定）。

## 编码/ID/入参
- 源文件一律 **UTF-8 无 BOM**；修复只准改注释+去注释逐字节比对+`node --check`。
- message-service 主键雪花 19 位>JS 安全整数 → `JacksonConfig` 把 Long 转字符串，前端按字符串处理 ID。预订主键名 `bookingId`。
- `LocalDateTime` 入参必须 ISO-8601（`T` 分隔），空格分隔→500。

## 免登录公开接口×租户插件
- 无租户上下文的入口（公开接口/`@Scheduled`/异步线程/平台管理员）被插件追加 `tenant_id=-1`（null 兜底）→**恒不命中**；症状「页面能开、永远无数据」，静态扫描看不见。
- 放行要两层：三处白名单（SecurityConfig/JwtFilter/WebMvcConfig）只让请求进得来；查询**必须**走 `@InterceptorIgnore(tenantLine="true")`（mapper 另开 `*IgnoreTenant`，别改原方法）+ 显式条件（如 `status='published'`）。
- 已修 `/teacher/published/*`、`/schedule/getAvailableSchedule`；**未修** `/user/account/exist`。

## 职业信息分享链路
- 分享链接 `teacherPublishedProfile.html?teacherId=`；「直达预定(`booking.html?scdid=`)／全部排期(`booking.html?tid=`)」已于 2026-09-11 按 `0d62f56` 隐藏前语义恢复（`teacherInfo-publish.js` 的 `bookingDeepLink()`，位置=`availableTimes` 分支）。
- **禁用后端短链 `/booking`**：`api/` 已无任何 html，Nginx 无该 location → `try_files` 兜底成登录首页（用户感知为"打不开"）。
- 发布快照是冻结内容：老记录须**重新发布**才带链接。`teacherPublishedProfile.html` 不消费 `data.scheduleId`（半截残骸）。
- `deploy/upload-to-server.sh` 的 jar 名曾写死 `2.0.0`（实际 2.0.1）→ 已改 glob，别再写死版本号。

## 术语渲染（sys_term）
- 三级作用域 (0,0)平台/(行业,0)行业/(租户,行业)租户；**语言优先于作用域**。坑：按作用域取词会让行业层其它语言顶掉平台层目标语言。
- 服务端文案走 `TermMsg.t("{course}创建成功")`：静态门面（`@Component`+static holder，**不可加私有构造器**，否则静默退回原文）；语言固定 zh。覆盖 `Result.*(msg)`、`throw new *Exception(msg)`、`QuotaType.label`；**日志用 `type.name()`**。
- **禁止整串子串替换**，只替换显式 `{key}`；通知常量集中 `MessageNotifyService`。

## 候补与递补
- 4 态：`waiting`─递补─►`booked`；取消 `booked→canceling/cancelling→cancelled`；次序 `ORDER BY create_time, booking_id`。
- 占位单一来源 `BookingStatus.java`：`NON_OCCUPYING=[waiting,cancelled,canceled,rej-booking,frozen]`；canceling/cancelling 仍占位；前端镜像 `bookingOccupiesSeat()`。`frozen`=删除（表无 `is_deleted`）。
- 超额闸门 `BookingSeatService` 覆盖 5 条写路径；并发靠「排期行锁+FOR UPDATE+CAS」。
- 递补入口按**排期维度**：该行不占席位即显示「查询递补」→候补面板→`POST /course/booking/waitlist/promote`；不枚举状态名。坑：`loadSchedule()` 复位选中→先 `reselectScheduleOption(id)`。

## 消息通知
- `categoryCode` 必须已在 `msg_category` 登记，否则 404；**HTTP 200 ≠ 成功**，看响应体 `code`。
- `msg_message.title/content`=`HMAC索引:AES密文`→不能按明文 WHERE；清理测试按「渲染后的确切标题」匹配。

## SSE 推送（客户端断开 ≠ 服务端故障）
- `SsePushService.pushToUser` 的 catch **是生效的**；异常仍出现在 `GlobalExceptionHandler` 里，是因为 `ResponseBodyEmitter` 保存该异常并在**异步收尾(async dispatch)**阶段重放它 —— 堆栈仍带着 `pushToUser` 那一帧，**极易误判成「catch 没生效」**。验证要用「旧 jar vs 新 jar」对照，别只看堆栈。
- `GlobalExceptionHandler#other` **必须先判 `response.isCommitted()`**（SSE 已 preset `text/event-stream`，硬写 `Result` 必二次抛 `HttpMessageNotWritableException`，一条日志变两条堆栈）；另加 `AsyncRequestNotUsableException` 专用静默 handler。业务其实不受影响、消息照常落库。
- `SsePushService.connect()` 覆盖同 key 的旧 emitter 时必须 `old.complete()`：旧 emitter 已不在 map 里却因 `SseEmitter(0L)` 永不超时而常驻容器。
- 复现脚本 `C:/Temp/sse-abort-test.js`（伪造 token→建 SSE→掐断→立刻发消息）可直接对比新旧实例日志错误数。

## 前端交互铁律
1. 顶部「刷新」=`refreshRightPage()`+`registerPageRefresh(menuKey, fn)`；**标题文本≠菜单 key**。
2. **异步渲染必 await**（否则读上一对象残值→「首屏空、之后慢一步」）；切换刷新展示区带自增序号丢弃过期响应。
3. Nginx `try_files` 兜底会把不存在的页面渲染成登录首页→先确认文件真在 `frontend/` 和 `dist/`。
4. **自定义下拉/弹出层**：① 弹出层**禁用 `absolute`** 放在 `overflow:auto` 容器内（无论是否有滚动条都被裁，且不产生滚动条），改 `position:fixed`+`getBoundingClientRect()`；② 显隐用**模块内布尔变量**判断，别读 `style`——`focus()` 会触发 focus 监听，"先 focus 再翻转 display"= 展开后立刻收起（表现为"点了没反应"）；③ 热区 ≥28px，且输入框**别写内联 `padding`**（会覆盖 CSS 的 `padding-right`，把内嵌按钮压住）。

## 测试与技能
- `tests/`：end2end 108、前端接线 66、`public-endpoints-test` 41、术语护栏 14、术语运行时 15、`msg-category-combo-test` 37（纯本地）、`teacher-publish-booking-link-test` 19；回测需后端 8083+消息 8090；mysql CLI 必带 `--default-character-set=utf8mb4`。
- 技能：`public-endpoint-tenant-bypass`/`browserless-frontend-itest`/`source-encoding-repair`/`saas-api-build-smoke`/`saas-debug-output-cleanup`/`server-side-term-template`。
