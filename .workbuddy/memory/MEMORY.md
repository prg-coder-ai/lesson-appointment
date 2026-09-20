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

## 前端铁律
1. 顶部刷新=refreshRightPage()+registerPageRefresh(menuKey,fn)；标题≠菜单key。
2. 异步必 await；切换刷新带序号丢弃过期响应。
3. Nginx try_files 把不存在页渲染成登录首页→先确认文件在 frontend/与 dist/。
4. 弹出层禁放 overflow:auto 容器；显隐用布尔变量；热区≥28px。
5. 侧栏静态 HTML，菜单不显示先查 CSS：.layout-container overflow:hidden + .sidebar 须 overflow-y:auto(admin/student/teacher 已加)；菜单总高≈1040px<视口即裁底部组。

## 微信登录(2026-09-20 屏蔽)
- 不考虑微信登录：User.wxOpenid 标 @TableField(exist=false)；UserMapper.getByWxOpenid/updateWxOpenid、UserService.wechatLogin/bindWechat、authController /wechat-login /bind-wechat 均块注释屏蔽(可恢复)。
- 恢复：去 exist=false + 取消注释 + ALTER TABLE user ADD COLUMN wx_openid VARCHAR(64) DEFAULT NULL, ADD UNIQUE uk_user_wx_openid(wx_openid)。

## 文档/技能
- 三手册：腾讯云(权威)＞预约系统(原理排障)＞前端(仅前端)。scp -r 源目录/ 目标/(结尾/传内容)。
- 技能：saas-api-build-smoke/booking-deeplink-routing/public-endpoint-tenant-bypass/browserless-frontend-itest/source-encoding-repair/saas-debug-output-cleanup/server-side-term-template/seat-oversell-concurrency-audit/saas-tenant-config-rule-module。
