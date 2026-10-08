# 课次时间 UTC 化改造方案

> 版本：v1.1（2026-10-08 21:15 修订：删除 `appointment.time_zone` 列，理由见 2.1）
> 　　　v1.0（2026-10-08 20:59 初版）
> 状态：**已批准，执行中**（用户 2026-10-08 21:17 指示"更新文档，然后继续进行"）
>
> 决策依据（用户 2026-10-08 20:59 拍板）：
> 1. 排期表 `course_schedule` **已含 `time_zone`，保持现状不动**——排期时间继续存"排期本地墙钟时间"。
> 2. **从 `appointment`（课次）开始的相关时间信息，后台一律用 UTC**，展示层用用户时区渲染。
> 3. 存量 `booking` / `appointment` 数据**全部是测试数据，可直接删除**，不做迁移换算。

---

## 0. 一句话目标

```
排期层（course_schedule）：本地墙钟时间 + time_zone 标记   ← 不动
                            ↓ 生成课次时转换
课次层（appointment）：     UTC（唯一的真相源）             ← 本次改造
                            ↓ 读取/返回时按用户时区渲染
前端展示：                 用户本地时间                    ← 本次改造
```

**唯一转换点**：排期本地时间 → UTC，只发生在"生成课次"那一刻。此后一切时间比较（提醒、退改、看板）都在 UTC 空间做。

---

## 1. 现状盘点（已逐处核实，非推测）

### 1.1 已就位，不必重做

| 项 | 位置 | 说明 |
|---|---|---|
| 排期时区列 | `course_schedule.time_zone varchar(36) NOT NULL` | 704 条数据：Edmonton 697 / Shanghai 7 |
| 时区工具类 | `ScheduleGenerator.toUtc/toUserZone/timeSwitchWithZone` | **方法完整、注释齐全，但 `toUtc` 全仓零调用（死代码）** |
| 任意时区互转接口 | `TzSwitchService.tzSwitchTo` | 前后端展示转换已在用 |
| 通知时间口径 | `NotifyRuleService:56-58` | 注释明确"时间口径只有一个 = `offsetMinutes`"，应发 = `课次时间 − offset` |
| 前端格式化收敛点 | `shared/domain/datetime.js` | 已统一为 `window.DatetimeDomain.formatDateTime`，**本次只需扩展它** |

### 1.2 待改造清单（9 处，全部有代码级证据）

| # | 位置 | 现状 | 归属 |
|---|---|---|---|
| M1 | `CourseScheduleService:575-582` | 课次时间 = 排期本地时间直接落库，**未转 UTC** | P0 |
| M2 | `NotifyDispatchService:475-476` | `gt(appointmentDatetime, now)`，`now` 是服务器时区 | P0 |
| M3 | `NotifyDispatchService:214/253/350` | `lesson.isAfter(now)`、`now=LocalDateTime.now()` | P0 |
| M4 | `NotifyDispatchService:128` | 派发入口 `now` 取服务器时区 | P0 |
| M5 | `RefundRuleService:416` | `Duration.between(LocalDateTime.now(), lessonTime)` | P0 |
| M6 | `AppointmentController:226/261/311` | 查询窗口 `now` 取服务器时区 | P1 |
| M7 | `MessageNotifyService:288` | 通知正文 `a.getAppointmentDatetime().toString()` **裸输出 UTC** | P0 |
| M8 | 小程序 `schedule-edit.js:60` | 硬编码 `Asia/Shanghai` | P1 |
| M9 | `application.properties:48` | `serverTimezone=UTC` | **保持不改**（改了就与"存 UTC"一致了） |

### 1.3 关键事实澄清（避免误判）

- **`Appointment.timeZone` 字段是死代码**：`Appointment.java:80` 那行在 `/* */` 注释块内（旧版实体草稿），实际生效的字段只有 `appointmentDatetime` / `lastDatetime`。
- **`lastDatetime` 实际未被任何业务读写**：全仓仅 `AppointmentDTO:40` 有定义，`generateAppointmentsForBooking` 写入后无人读。改期功能目前**没有实现**。
- **`appointment` 表无 `time_zone` 列**，也无 UTC 标记列 —— 这**不是缺陷**：课次存 UTC 本身就不需要时区列
  （见 2.1 的 v1.1 修订）。本次 DDL 只改列注释，不加列。
- 通知规则用 `offsetMinutes`（相对偏移）**而非绝对时刻**，所以**规则表不需要改**，只要课次时间是 UTC，整个通知计算自动正确。

---

## 2. 目标数据模型

### 2.1 表结构变更

```sql
-- 课次时间列语义改为 UTC（列名不改，避免动全部 SQL）
ALTER TABLE appointment
  MODIFY COLUMN appointment_datetime datetime NULL
    COMMENT '课次时间（UTC）——由排期本地时间按 course_schedule.time_zone 换算写入',
  MODIFY COLUMN last_datetime datetime NULL
    COMMENT '改期前原课次时间（UTC）';
```

> **v1.1 修订（2026-10-08 21:15，用户质疑后）**：原方案还有一条 `ADD COLUMN time_zone varchar(36)`
> （课次来源时区快照），**已删除**。理由见下。
>
> **为什么不需要这一列**：原设计的理由是"排期时区日后被编辑，不应追溯改变已生成的课次"。
> 但**课次存的已经是 UTC 瞬时值**，换算在生成那一刻就完成了 —— 排期时区事后怎么改都碰不到
> 这个已固化的数值。**"快照"想防的那件事，UTC 本身已经防住了**，加列提供不了额外保护。
>
> 需要"这个课次当初按哪个时区排"时，链路**已经存在**：
> `appointment → booking_id → booking → schedule_id → course_schedule.time_zone`
> （`NotifyDispatchService.loadCourseIds` 走的就是这条）。为一次文案渲染加列并长期维护，
> 属于**用写成本换读便利**；更要紧的是它会自造一类漂移风险 ——
> 若 `appointment.time_zone` 与 `course_schedule.time_zone` 不一致，代码该信哪个？
> 这正是 DDL 守卫要防的那类问题，没必要自己制造一个。

### 2.2 语义约定（写进注释与文档，勿再漂移）

| 层 | 列 | 语义 |
|---|---|---|
| 排期 | `course_schedule.start_time/end_time` | **排期本地墙钟时间**，须结合 `course_schedule.time_zone` 解读 |
| 课次 | `appointment.appointment_datetime` | **UTC**，唯一的真相源，**与时区无关** |
| 课次 | `appointment.last_datetime` | 改期前原课次时间（UTC） |
| 展示 | — | 用户本地时间；时区来源见下 |

**取时区的两条路（按用途分，不可混用）**：

| 用途 | 时区取自 | 理由 |
|---|---|---|
| 课次时间**比较**（提醒窗口、退改档位、查询区间） | **不需要时区** —— 双方都是 UTC | UTC 是绝对时刻，同源比较天然正确 |
| 课次时间**展示**（页面、通知正文、导出） | 用户时区；通知场景用排期时区 | 异步派发拿不到阅读者时区，见步骤 4 |

---

## 3. 实施步骤

### 步骤 0：清空存量测试数据（用户已授权）

**必须按级联顺序删，顺序错了会触发 FK 约束失败。**

```sql
-- 备份（沿用既有 bak_ 约定，可回滚）
CREATE TABLE bak_appointment_20261008      AS SELECT * FROM appointment;
CREATE TABLE bak_notification_log_20261008 AS SELECT * FROM notification_dispatch_log;
CREATE TABLE bak_booking_20261008           AS SELECT * FROM booking;

-- 清空顺序：先子表后父表
DELETE FROM notification_dispatch_log;   -- 通知流水（有幂等唯一键 uk_dispatch_once，不先清会挡住后续通知）
DELETE FROM appointment;                 -- 课次
DELETE FROM booking;                     -- 预订
-- course_schedule / course 保留（排期是录入的模板数据，不是测试产物）
```

> ⚠️ 删完必须跑一次验证：新建预订 → 应能重新生成课次。若课次不生成，说明 `notification_dispatch_log` 残留导致幂等拦截。

### 步骤 1：新增时区转换工具（统一收口，禁止散落）

在 `ScheduleGenerator` 基础上补三个方法，**所有转换必须走这里**：

```java
/** 排期本地时间 + 排期时区 → UTC。写入库的唯一入口。 */
public static LocalDateTime scheduleLocalToUtc(LocalDateTime scheduleLocal, String scheduleZone)

/** UTC → 用户时区本地时间。返回前端的唯一出口。 */
public static LocalDateTime utcToUserZone(LocalDateTime utc, String userZone)

/** 取"当前时刻"的 UTC 表示，替换全仓裸 LocalDateTime.now()。 */
public static LocalDateTime nowUtc()
```

**容错**：`ZoneId.of()` 对非法输入抛 `ZoneIdRulesException`（继承 `DateTimeException`，是 RuntimeException）。必须包一层兜底 —— 前端传了 `CST`/`GMT+8` 这类非 IANA 值时，**降级到 UTC 并记 warn，不允许 500**。

> 依据：`tzSwitch` 是公开接口，用户可以传任意字符串。异常必须在前端可见成"时区格式无效"，而不是后端堆栈。

### 步骤 2：改造课次生成（M1，唯一写入点）

`CourseScheduleService.generateAppointmentsForBooking:570-585`：

```java
List<ScheduleVO> instanceList = ScheduleGenerator.generateUserZoneSchedule(genDto);
String scheduleZone = schedule.getTimeZone();   // 从排期实体取，不是从 DTO 猜

for (ScheduleVO vo : instanceList) {
    LocalDateTime scheduleLocal = LocalDateTime.parse(vo.getDate() + " " + vo.getTime(), FMT);
    LocalDateTime utc = ScheduleGenerator.scheduleLocalToUtc(scheduleLocal, scheduleZone);

    appt.setAppointmentDatetime(utc);
    appt.setLastDatetime(utc);
    appt.setStatus("active");
}
```

> v1.1：删掉了 `appt.setTimeZone(scheduleZone)` —— 表里没有这一列，也不该有（见 2.1）。

**注意**：`generateUserZoneSchedule` 的 `toZone` 必须传 `scheduleZone`（不是用户时区）—— 它在**冲突检测**和**课次生成**两处被复用，而这两处要的都是在**排期时区空间**比较。现在两处都传排期时区（`CreateDtoToGenerateDto:474-475` 已如此），**语义正确，不要动**。

### 步骤 3：统一"当前时间"来源（M2~M6）

全仓替换 `LocalDateTime.now()` 为 `ScheduleGenerator.nowUtc()`，**仅限业务时间判定点**：

| 文件 | 行 | 改法 |
|---|---|---|
| `NotifyDispatchService` | 128 | `LocalDateTime now = ScheduleGenerator.nowUtc();` |
| `NotifyDispatchService` | 257 | 同上（手动发送） |
| `NotifyDispatchService` | 475-476 | `now` 已是 UTC，wrapper 条件**不用改**（列也是 UTC，同源了） |
| `NotifyDispatchService` | 214/350 | `lesson.isAfter(now)` 双方都是 UTC，**不用改** |
| `RefundRuleService` | 416 | `Duration.between(ScheduleGenerator.nowUtc(), lessonTime)` |
| `AppointmentController` | 226/261/311 | 查询窗口边界改 `nowUtc()` |

**不要改的**（审计/监控时间，与业务时区无关）：
`AuditAspect`、`MonitorService`、`MetricSample`、`RefreshTokenService`、`TenantService`、各实体 `createTime/updateTime`。

### 步骤 4：通知正文时间文案（M7）

`MessageNotifyService.firstAppointmentText:288` 现在会把 UTC 裸字符串塞进用户可见文案：

```java
// 改前：用户看到 "2026-09-07 19:30:00"（UTC，与本地差 6~7 小时）
return a.getAppointmentDatetime().toString().replace("T", " ");
```

**做法：取值处转换，时区从排期链取。**

```
bookingId → booking.schedule_id → course_schedule.time_zone → utcToUserZone(utc, tz)
```

链路已存在（`NotifyDispatchService.loadCourseIds` 走的就是这条），只需在 `firstAppointmentText`
里多做一次排期查询，把 UTC 转成排期时区再渲染。

**为什么不用消息模板占位符（v1.1 修正）**：v1.0 曾建议改成 `{lessonTime}` 占位符由 `TermMsg` 渲染，
理由是"通知正文拿不到用户时区"。这个理由成立，但**多加一层模板改造并不划算** ——
时区本来就能从 `booking → schedule` 关联查到，在取值处直接转即可，少改一层、少一处可能失效的链路。

> ⚠️ 通知是异步派发的，**拿不到"阅读者是谁"**。所以通知正文里的时间只能按**排期/租户时区**渲染，
> 不能按阅读者时区渲染。若同一租户下师生分处不同时区，正文时间对双方都成立（都等于排期时区的墙上时间），
> 页面展示则各自按本地时区渲染 —— 两者语义不同，是刻意的取舍。

### 步骤 5：返回前端的 VO 转换

课次列表接口（`AppointmentController` 全部 GET）返回前，把 `appointmentDatetime` 转成用户时区：

```
入参可选 timeZone（不传则用前端传的 userTimeZone，再不传则用 UTC 原值）
出参：appointmentDatetime / lastDatetime 均为用户本地时间字符串
```

**取舍**：推荐 **前端传 `userTimeZone`、后端转换**（而非前端转），理由是——同一份数据在列表页、详情页、导出 Excel、消息预览里都要转，后端转一次能保证四处一致；前端转则每个页面各写一遍，迟早漂移。

### 步骤 6：扩展前端 `DatetimeDomain`

`shared/domain/datetime.js` 增加：

```javascript
export function utcToZoned(iso, timeZone)   // UTC 字符串 → 指定时区显示串
export function nowUserTz()                  // 取用户浏览器时区 ID
```

- 现有 `formatDateTime` **保持不变**（它是"格式化"，不涉及时区），另立新函数做时区渲染，避免改坏既有调用点。
- 改造 `appointmentNotes.js:726/966`、`datamaintain_delete.js:359/385/396` 三处课次展示，改为按用户时区渲染。
- **改 `shared/` 后必须重跑**：`frontend/tools/gen-shared-bridge.js` + `tools/sync-miniprogram-shared.js` + `check-miniprogram-shared-sync.js` + `node frontend/build.js`。

### 步骤 7：小程序端时区对齐（M8）

`miniprogram/package-teacher/schedule-edit/schedule-edit.js:60` 硬编码 `Asia/Shanghai`。改为运行时获取：

```javascript
// 微信小程序取用户时区
const tz = wx.getSystemInfoSync().timeZone || DEFAULT_TIME_ZONE;
```

**注意**：小程序展示课次时间时**不能直接 `new Date(utcString)`** —— iOS 微信对非 ISO 格式字符串的解析不可靠，必须带 `Z` 后缀或用 `Date.parse` 显式转换。

### 步骤 8：新增守卫（防退化）

这次改造的价值会被未来的改动悄悄推翻。加两条检查（新守卫 `tools/check-tz-guard.mjs`）：

1. **课次生成必须经过 UTC 转换**：`CourseScheduleService.generateAppointmentsForBooking` 方法体内若出现
   `setAppointmentDatetime` 但**没有** `scheduleLocalToUtc` 调用 → 判红。
   > 这条是防"有人为了省事直接把本地时间 set 进去"——那正是本次要消灭的缺陷，且**不报任何错**。
2. **业务时间判定禁用裸 `LocalDateTime.now()`**：`NotifyDispatchService` / `RefundRuleService` /
   `AppointmentController` 三个文件内出现 `LocalDateTime.now()` → 判红（审计/监控类文件白名单豁免）。

挂进 `pre-commit`（`SKIP_TZ=1` 可跳过）。

> v1.1：原第 1 条守卫写的是"`appointment.time_zone` 必须落库"，随该列一起作废。

---

## 4. 改动文件清单

| 文件 | 改什么 | 风险 |
|---|---|---|
| `api/sql/patch/20261008-xxxx-appointment-utc.sql` | 两个 `MODIFY COLUMN`（**不加列**，v1.1） | 低（表 0 数据） |
| `api/src/main/java/com/reservation/common/ScheduleGenerator.java` | 新增 3 方法（含容错） | 低（纯新增） |
| `CourseScheduleService.java` | 步骤 2 课次生成 | **高**（核心写入点） |
| `NotifyDispatchService.java` | 步骤 3，4 处 `now` | 中 |
| `RefundRuleService.java` | 1 处 `now` | 中 |
| `AppointmentController.java` | 3 处 `now` + 返回前转换 | 中 |
| `MessageNotifyService.java` | 通知正文取值处转换（v1.1：非占位符） | 中 |
| `shared/domain/datetime.js` | 新增 2 函数 | 低 |
| `frontend/js/public/appointmentNotes.js` 等 3 处 | 展示转换 | 低 |
| `miniprogram/.../schedule-edit.js` | 时区运行时获取 | 低 |
| `tools/check-tz-guard.mjs`（新） | 两条守卫 | 低 |

---

## 5. 验证清单

| # | 场景 | 期望 |
|---|---|---|
| 1 | 排期时区 `America/Edmonton`，北京时间 09:00 上课 | 课次 UTC = 前一日 21:00 |
| 2 | 上述课次，学生在 `Asia/Shanghai` 查看 | 显示 09:00 正确 |
| 3 | 上述课次，教师在 `America/Edmonton` 查看 | 显示 09:00 正确 |
| 4 | 通知"课前 1 天"档 | 提前 24h 发出，不受服务器 TZ 影响 |
| 5 | **把服务器 TZ 改为 `America/New_York` 重跑 1~4** | 结果完全不变（这是本方案的核心验收点） |
| 6 | 退改档位：距课 3h 申请 | 判为 partial，与预期档位一致 |
| 7 | 前端传 `timeZone=CST`（非法值） | 返回可读错误，**不 500** |
| 8 | 重复生成课次 | 幂等，无重复（现有 `anyActive` 逻辑不变） |
| 9 | DDL 守卫 + 时区守卫 | 全绿 |

**第 5 条是关键**——它验证的正是原设计第 6 节"服务器时区变了 → 全表排期错乱"这个症状是否真的被消除了。

---

## 6. 不做的事（明确边界，避免范围蔓延）

| 不做 | 理由 |
|---|---|
| 改排期表为 UTC | 用户已明确"排期已含时区，不用处理" |
| 改 `serverTimezone` | 改成 UTC 后它恰好与新语义一致，**保持不动** |
| 实现课次改期功能 | `lastDatetime` 本就无读取方，属独立需求，不夹带 |
| 通知规则表改造 | `offsetMinutes` 相对偏移，课次转 UTC 后自动正确 |
| 存量数据换算 | 用户已授权直接清空 |
| 引入 Flyway | 独立议题，尚未拍板 |

---

## 7. 风险与前置确认

| 风险 | 处置 |
|---|---|
| **清空数据连带清掉真实演示数据** | 执行前确认 `booking` 704 条是否全为测试数据（用户已确认） |
| **课次生成是唯一写入点，漏改则数据不一致** | 步骤 2 完成后立即跑验证清单 #1/#2 |
| **`Appointment.java` 注释块里的旧字段误导** | 本次顺手清理该注释块，避免后人误以为有 `timeZone` 字段可用 |
| **通知正文拿不到阅读者时区** | 已在步骤 4 说明，只能按排期/租户时区渲染 |
| **前端三处展示改造可能漏** | 交给步骤 8 的守卫兜底 |

**建议执行顺序**：步骤 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
每步独立可验证，出问题能精确回滚到上一步。
