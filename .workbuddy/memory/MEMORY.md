# 项目长期记忆

## 协作偏好
- 多次尝试仍失败就停下问用户（2~3 次即汇报现状 + 给选项）。技术讨论先根因 + 代码级证据再修复；输出结构化。

## 项目/环境
- SaaS 迁移：`api/`（Spring Boot 3.3.5 + Java 17/21 + MyBatis-Plus 3.5.7）、`frontend/`、`api/message-service/`。MySQL 8.4：`lesson_appointment` + `message_center`。
- 构建见技能 `saas-api-build-smoke`（**jar 被运行实例锁住会让 package 报 rename 失败**：别杀用户进程，改 `mvn compile` + `spring-boot:run`）。前端 `node build.js`。
- 部署根 = `frontend/dist`（Nginx `root`），**改源码必须重建 dist**；terser 保留 `window.*` 全局名。booking api = 纯后台（只 `/api/v1/**`）。
- 术语表 `sys_term`：0 哨兵三级作用域 (0,0)平台 / (行业,0)行业 / (租户,行业)租户；优先级 **租户 > 行业 > 平台** 逐级回退；加 `language` 不得破坏该优先级。

## JWT 密钥域铁律
- 远程用线上密钥、本地用源 `jwt.secret`（882 串），**同源才能互验：要么全本地要么全远程，混合必 401**。
- 本地起 message-service **必带 `--server.port=8090`**（沙箱 `SERVER__PORT=55058` 会被宽松绑定）。

## 编码 / ID 契约
- **源文件一律 UTF-8 无 BOM**；修复只准改注释 + 去注释逐字节比对 + `node --check`。
- message-service 主键雪花 19 位 > JS 安全整数 → 已加 `JacksonConfig`（Long→ToStringSerializer），前端按字符串处理 ID。
- **预订主键字段名 = `bookingId`**（无 `id`）；写 `.id` 会静默提交 `"undefined"`。

## 候补与递补契约（2026-09-11）
- **4 态**：`waiting` ─递补─► `booked`；取消侧 `booked → canceling/cancelling → cancelled`。**不引入** `waitlist_pending`/`join_waitlist`/`available`。候补次序 = `ORDER BY create_time ASC, booking_id ASC`，不入库。
- **占位规则单一来源 `common/BookingStatus.java`**：`NON_OCCUPYING=[waiting,cancelled,canceled,rej-booking,frozen]`；**canceling/cancelling 仍占位**。剩余席位 = 总席位 − 占位数。
- **`frozen` = 删除**：booking 表**无 `is_deleted` 列**，前端 `deleteBookingByFrozen` 就是置 frozen。曾漏在不占位名单外 → 删一条预订席位被永久吃掉。
- **前端镜像 `bookingOccupiesSeat()`** 必须与后端名单逐项一致（测试 A12 守）。
- **超额闸门 `BookingSeatService`** 覆盖 5 条写路径；并发靠「排期行锁 + 锁定读计数（必须 FOR UPDATE，普通 count 在 REPEATABLE READ 下读旧快照）+ CAS」三件套，加锁顺序「先 course_schedule 再 booking」。
- 递补入口在**排期维度**：预订管理页**凡该行不占席位**即显示「查询递补」→ `pendingDeepLink={scdid,sid:null}` → 排期页锁定课程+排期 → 候补面板 → `POST /course/booking/waitlist/promote`。**按「是否占席位」判，不枚举状态名**（枚举必漏）。
- **刷新链的坑**：`loadSchedule()` 重建下拉会把选中复位 → 递补后必须先 `reselectScheduleOption(id)` 再 `displySchedule()`。
- 候补不生成 appointment → 别往今日课程页状态下拉加 waiting；学生候补入口是顶部提示条 `#waitlist-banner`。

## 消息通知必要条件
- **categoryCode 必须已在 `msg_category` 登记**（tenant_id=0 平台预置），否则业务码 **404 拒收**；**HTTP 200 ≠ 成功**，要看响应体 `code`。
- `msg_message.title/content` = `HMAC索引:AES密文` → **不能按明文 WHERE**，按 HMAC 索引前缀查 + 自行解密。

## 前端交互铁律
1. 顶部「刷新」= `refreshRightPage()` + `registerPageRefresh(menuKey, fn)`；**标题文本 ≠ 菜单 key**。每页定义唯一 `refreshXxxView()` 供两处共用；返回 `false` 兜底。
2. **异步渲染必 await**（否则读上一对象残值，症状「首屏空、之后总慢一步」）；切换后刷新展示区带**自增序号**丢弃过期响应。
3. **父级选择变更 → 子级展示区必须在发请求之前重置**。
4. 「块内声明、块外引用」`node --check` 查不出，只能靠跑到该分支的用例暴露。

## Nginx `try_files` 兜底掩盖 404
- 会把不存在的页面渲染成登录首页 → 表象"闪回登录页"。排查：确认文件真在 `frontend/` 与 `dist/`。防线 `js/public/missingPageGuard.js`。公开免登录页不引 api.js → 自拼 `/api/v1`。

## 测试与技能
- `tests/`：`waitlist-promote-e2e-test.js`（后端 70 例）、`waitlist-frontend-wiring-test.js`（前端 vm，66 例），需真实后端 + MySQL，含阴性对照。
- 技能：`browserless-frontend-itest`、`source-encoding-repair`、`saas-api-build-smoke`、`saas-debug-output-cleanup`。
