# 项目长期记忆

## 协作偏好
- 多次失败（2~3 次）即问用户；先根因+证据再修复；代码写完直接交付跳过自测（仍要编译验证）。

## 技术栈与构建
- api(Spring Boot 3.3.5+MyBatis-Plus 3.5.7)+message-service 独立模块；MySQL lesson_appointment/message_center；api 只供 /api/v1/**，不伺服 html。
- 构建见技能 saas-api-build-smoke；改前端后必重 build dist（CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js，bulk-delete 守卫会拦开头 rm）。
- frontend/pom.xml 的 npm.version 必须 10.9.7（10.2.4 在 Win 跑 npm run 必崩）。
- 三产物：api/target/booking_api-2.0.1.jar、api/message-service/target/message-service-1.0.0.jar、frontend/dist/。

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

## SSE
- pushToUser 的 catch 生效；异常在 GlobalExceptionHandler 异步收尾重放（堆栈带 pushToUser 帧，易误判）。other handler 须先判 response.isCommitted()；connect 覆盖旧 emitter 必 old.complete()。

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
- 技能：saas-api-build-smoke/booking-deeplink-routing/public-endpoint-tenant-bypass/browserless-frontend-itest/source-encoding-repair/saas-debug-output-cleanup/server-side-term-template。
