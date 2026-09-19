# 项目长期记忆

## 协作偏好
- 多次失败（2~3 次）即问用户；先根因+证据再修复；代码写完直接交付跳过自测（仍要编译验证）。
- **库内数据都是测试数据**（用户 2026-09-18 明确）：既有脏数据/历史状态（如 1 条超卖、4 条 noted1/noted2 遗留值）一律不清理、不必再问是否刷数据。发现脏数据只做诊断与报告，不做数据变更。

## 技术栈与构建
- api(Spring Boot 3.3.5+MyBatis-Plus 3.5.7)+message-service 独立模块；MySQL lesson_appointment/message_center；api 只供 /api/v1/**，不伺服 html。
- 构建见技能 saas-api-build-smoke；改前端后必重 build dist（CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js，bulk-delete 守卫会拦开头 rm）。
- frontend/pom.xml 的 npm.version 必须 10.9.7（10.2.4 在 Win 跑 npm run 必崩）。
- 三产物：api/target/booking-api-2.0.1.jar、api/message-service/target/message-service-1.0.0.jar、frontend/dist/。

## 铁律
- JWT：远程=线上密钥、本地=源 jwt.secret；同源才互验，混合必 401；本地起 message-service 必带 --server.port=8090。
- 编码：源文件一律 UTF-8 无 BOM；修复只准改注释+逐字节比对+node --check。
- ID：message-service 雪花19位>JS安全整数→JacksonConfig 把 Long 转字符串；预订主键名 bookingId。
- 入参 LocalDateTime 必须 ISO-8601(T 分隔)；data-* 经 dataset 读须核对驼峰名（写错不报错恒 undefined）。

## 免登录接口×租户插件
- 无租户上下文入口（公开接口/@Scheduled/异步/平台管理员）被插件追加 tenant_id=-1→恒不命中，症状"页面能开永远无数据"。
- 放行两层：三处白名单(进得来)+查询须 @InterceptorIgnore(tenantLine="true")（mapper 另开 *IgnoreTenant）。已修 /teacher/published/*、/schedule/getAvailableSchedule；/user/account/exist 未修（查重失效）。

## 术语(sys_term)
- 三级 (0,0)平台/(行业,0)行业/(租户,行业)租户；语言优先于作用域。服务端文案走 TermMsg.t("{course}创建成功")（不可加私有构造器，否则静默回原文）；禁止整串替换，只替换显式 {key}。

## 职业信息分享(teacherInfo.html 三模式)
- 分享 teacherPublishedProfile.html?teacherId=；直达预定(booking.html?scdid=)/全部排期(booking.html?tid=) 已恢复(0d62f56 隐藏前语义)。
- scdid 链：edit→teacher_available_time.schedule_id→normalizeDetail→view checkbox 的 data-extra-scheduleid→generatePublishHtml；dataset 大小写断点 extraScheduleid vs extraScheduleId 已兼容。
- 发布快照冻结：历史记录须重新保存+重新发布才带链接/优选徽章。

## 候补/递补
- waiting─递补─►booked；取消 booked→canceling/cancelling→cancelled。占位单一来源 BookingStatus.NON_OCCUPYING（canceling/cancelling 仍占位；frozen=删除也归非占位）。闸门 BookingSeatService 覆盖5条写路径，并发靠排期行锁+锁定读计数+CAS。递补入口排期维度。

## 名额并发（超卖）
- 闸门 857a233(2026-09-11) 引入。防线：排期行锁 selectByIdForUpdate + booking 锁定读 selectOccupyingBookingIdsForUpdate（禁用 COUNT+FOR UPDATE）+ 加锁顺序统一"排期行→booking 行"+ CAS。booking 写操作全工程仅 10 处（BookingService 8 / CourseScheduleService 2）。
- 闸门原本只覆盖"预定/改订/状态回置/递补/指定学生"5 条路径；**2026-09-18 已补齐 P0/P1/P2**：席位调整过闸门（assertSitesNotBelowOccupied + SQL 下界）、排期编辑不得改小到低于已占位（并修 Integer→int 拆箱 NPE）、create 加同学生查重并复用行、asgn_student 查重移入锁内、状态写走 CAS。DDL 已落地 uk_booking_schedule_student 唯一索引 + available_sites>=0 CHECK。
- 容量口径 available_sites = 总席位（非剩余），DDL 注释已改正。仍是 tinyint（上限127）。
- 误判排除：countBookingByScheduleIdIgnoreTenant 只服务公开只读展示；/api/v1/course/booking/* 不在白名单故必有租户上下文，计数不会恒 0。

## SSE
- pushToUser 的 catch 生效；异常在 GlobalExceptionHandler 异步收尾重放（堆栈带 pushToUser 帧，易误判）。other handler 须先判 response.isCommitted()；connect 覆盖旧 emitter 必 old.complete()。

## 退改规则（course_refund_rule，2026-09-18）
- 表：tenant_id+course_id 唯一；**course_id='' 表示租户默认规则**（不能用 NULL，MySQL 唯一索引下 NULL 不去重）。字段 free_before_minutes / partial_before_minutes / partial_refund_percent / *_unit(仅回显)。DDL 在根目录 course-refund-rule-20260918.sql。
- 只存两个阈值，**不退费区由「不足部分退费线」推导**（用户确认的方案）：≥免责线免责100%、≥部分线退 N%、不足则0%。
- 生效顺序：课程专属(启用) > 租户默认(启用) > 内置兜底(24h/12h/50%)；停用即视为未配置继续回落，并在 fallbackNotice 说明。时间基准=**课次** appointment_datetime（非排期首课）。
- `/refund-rule/*`：list/save/delete/course-options/preview 需租户管理员；hint 需登录即可（学生+管理员共用同一判定，前端不自己算时间差）。
- **坑**：checkAdmin 也放行平台管理员，而插件 ignoreTable 在 tenantId=0 时返回 true（不拼租户条件）→ selectOne 会跨租户命中默认规则行。故 admin 侧方法一律先 requireTenantContext()。
- 学生请假按钮=studentApplyLeaveWithRule(先弹规则提示再置 cancelling)；管理员审核=adminConfirmLeaveWithRule(先弹提示再置 cancelled)。提示弹窗用内联样式原生 DOM（student/teacher/admin 三页 CSS 不同，且不能放进 overflow:auto 容器）。
- 余额调整＝预留：StudentBalanceService 接口 + StudentBalanceServiceStub（只打 warn 日志不入账，isAvailable()=false）；真实实现需 student_balance/student_balance_flow 两表 + adjustId 幂等 + FOR UPDATE 锁账户。LeaveRefundSettleService 在确认请假时**重算**档位并调用之，全程吞异常不阻断主流程。

## 上课通知规则（course_notify_rule + course_notify_rule_point + notification_dispatch_log，2026-09-18）
- 三表：规则头（tenant_id+course_id 唯一，'' = 租户默认）/ 时间点明细（**无 tenant_id 列**，故必须登记进 MyBatisPlusConfig.IGNORE_TABLES，否则租户插件拼 `tenant_id = ?` 直接 Unknown column）/ 发送流水（幂等键所在）。DDL 在根目录 course-notify-rule-20260918.sql，并给 appointment 补了 idx_appt_datetime_status。
- 取代原先写死在 frontend/js/public/appointmentNotes.js 的 3天/1天/课前60分钟。旧那套：判定跑在浏览器（改系统时间可绕过）+ **sendNotesTo 是空函数 → 通知从未真正发出过**，「已发」标记还复用了 appointment.status（noted1/noted2）。
- 档位字段：seq（顺序，越大离上课越近）+ stage（文案档 PRE_FIRST/PRE_AGAIN/PRE_SOON/FINAL_CALL）+ offset_minutes（**唯一计算口径**，天=1440，input_unit 仅回显）+ audience(STUDENT/TEACHER/BOTH) + enabled（停用不删行，保 seq 无洞）。保存时服务端按 offset 降序**重排 seq**，不采信前端顺序（顺序是派生量，不让两处真相并存）。
- 生效顺序：课程(启用且至少一档启用) > 租户默认 > 内置兜底(3天/1天/课前1h/课前30min)；**整组覆盖、不逐点继承**（配置省事靠界面预填租户默认档位）。
- 发送策略：只看未来窗口 `[应发时刻, 应发时刻+5min)` 且未上课 → 过期不补、已过上课时间绝不补发；一个订单只对**最近一个未完成课次**发（5 课次×4 档=20 条会刷屏）。
- 幂等：流水唯一键 (appointment_id, seq, receiver_user_id, dedup_key)。**先 insert 抢发送权再推送**，严禁"先查有没有再插"（每分钟扫一次，查后插天然有并发窗口）；推送失败**删该行**让窗口内重试（窗口只有 5 分钟，重试天然有限；留 FAILED 行会永久占位不再重试）。收件人级而非事件级，教师那条失败不牵连学生那条。
- 手动发送：dedup_key=MANUAL#时间戳 → 可重复发且留审计；档位按当前提前量自动判定（取 offset ≤ 距上课分钟数 中 offset 最大者；全不满足则取最小档）。
- NotifyTask 每 60s（fixedDelay），**必须逐租户 setTenantId + finally clear**（否则插件兜底 -1 → 查询恒空，"任务在跑但永远没通知"）；开关 notify.task.enabled（缺省开，无需预插记录）。
- 消息走 message-service **/api/v1/messages/system**（role=system，无登录上下文可调用；MessageNotifyService.sendAsSystem 现签令牌，返回 boolean 供流水落 FAILED），分类 SYSTEM_SCHEDULE。文案模板集中在 MessageNotifyService；动态占位符用 {lessonAt}/{offsetText}，**刻意避开术语 key {lessonTime}**（否则 vars.put 会覆盖术语词）。
- `/notify-rule/*`（list/detail/save/delete/course-options/options/preview/manual-send/dispatch-log）管理侧同样要先 requireTenantContext()（与退改规则同因：checkAdmin 放行平台管理员 + tenantId=0 时插件不拼条件）。
- 界面 admin-notify-rule.js：菜单「系统配置 → 通知规则」；档位明细行可增删改；**应发时刻试算是纯前端本地实时算**（公式与服务端一致），不调 /preview——那样只能试算已保存规则，而弹窗里改的往往还没存，结果会对不上。
- **前端本地通知逻辑已摘除（2026-09-18 收尾）**：`appointmentNotes.js` 的 `checkStatusAndDate/sendNotesToUsers/sendNotesToTeacher/sendNotesToStudent/sendNotesTo` 整段删除（`sendNotesTo` 本是空函数→消息从未发出过）。管理端行内入口＝`openLessonNotifyDialog(appointmentId)`：先 `/notify-rule/preview?appointmentId=` 摊开各档（待发/已发/已过期），再 `/notify-rule/manual-send`；**结果就地回显且不关弹窗**（手动补发可重复，要能确认发出去没有）。按钮显示条件用 `isNotifyActionable(status)`，名单与服务端 `DEAD_APPOINTMENT_STATUS` 对齐——原条件是 `&& checkStatusAndDate(...)` 拿**对象**当布尔、恒真，按钮一直显示（已修）。
- **noted1/noted2 语义收敛**：后端零引用、前端不再产生，处理方式＝保留但标「历史」+ 文案动态化。`loadNotifyStageLabels()` 拉 `/notify-rule/detail`（租户默认规则）→ `notifyStageLabel(seq)`＝「已发第1档·提前3天」；`notifyLegacyNotedText(seq)` **分角色**（管理端给档位信息，学生/教师只给「已提醒」）。student/teacher 页直接跳过该请求，判断写成排除法避免角色串细分后静默失效。`admin-AppointmentNotes.js` 下拉「7日内通知/当日通知已发」已改为动态；该页补注册 `registerPageRefresh('lesson_notice', refreshLessonNoticeTable)`（原未注册，顶部刷新会重置筛选与分页）。

## 工具踩坑（本机 agent 行为）
- **并行对同一文件发多个 Edit，只有最后一个生效**（静默丢失，返回仍是 success）。改同一文件必须串行逐个改，改完 grep 核验。**同理：用 Edit 做"纯插入"时若 new_string 比 old_string 少了尾部换行，会静默把下一行吞成同一行**（本次 MEMORY.md 标题就被并进正文），插入类编辑务必回读确认。
- Maven 输出是 GBK 中文，`grep` 会判为二进制只回 "Binary file matches" 并吞掉报错行 → 先 `iconv -f GBK -t UTF-8` 再 grep，或直接看 tail。

## 前端铁律
1. 顶部刷新=refreshRightPage()+registerPageRefresh(menuKey,fn)；标题文本≠菜单key。
2. 异步渲染必 await（否则读上一对象残值→"首屏空之后慢一步"）；切换刷新带自增序号丢弃过期响应。
3. Nginx try_files 兜底把不存在页渲染成登录首页→先确认文件在 frontend/与 dist/。
4. 自定义下拉/弹出层：禁用 absolute 放 overflow:auto 容器（必被裁）；显隐用模块内布尔变量别读 style；热区≥28px；输入框别写内联 padding。

## 文档(doc-develop)
- 三手册：腾讯云手册(权威操作)＞预约系统手册(原理排障)＞前端手册(仅前端)；前两份重叠严重须同步。
- scp/rsync 复制集中出处=腾讯云手册 3.4.1。核心 scp -r 源目录/ 目标/（结尾/传内容，无斜杠多一层→403）。

## 测试/技能
- 回测：后端8083+消息8090；mysql CLI 带 --default-character-set=utf8mb4。护栏测试在 tests/。
- 技能：saas-api-build-smoke/booking-deeplink-routing/public-endpoint-tenant-bypass/browserless-frontend-itest/source-encoding-repair/saas-debug-output-cleanup/server-side-term-template/seat-oversell-concurrency-audit/saas-tenant-config-rule-module。
