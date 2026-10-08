# 数据库脚本（权威单一事实源）

本目录是 **所有数据库相关脚本的唯一存放处**。新建库、重建环境、交接给他人，都只从这里取脚本。

- 命名规范：`YYYYMMDD-HHMM-<库名或范围>-<用途>.sql`，**按文件名字典序即执行顺序**
- 编码统一 UTF-8（无 BOM）
- 建表脚本由**现网 mysqldump 直接导出**，不手工维护 —— 手写的 DDL 一定会漂移出真相

## 目录结构

| 子目录 | 用途 | 是否幂等 | 何时执行 |
|---|---|---|---|
| `schema/` | 建库建表（含索引、外键、CHECK 约束） | 是（`DROP TABLE IF EXISTS` + `CREATE`） | 新环境初始化，第1 步 |
| `seed/` | 系统必需的基础数据（字典、术语、分类） | 否（纯 INSERT，重复执行会主键冲突） | 新环境初始化，第 2 步 |
| `patch/` | 历史增量补丁，**已并入当前 schema** | 各不相同 | 仅供追溯"某约束何时加的"，**新环境不需要执行** |

## 新环境初始化顺序

```bash
# 0. 前置：确认密码（勿把密码写进脚本）
export MYSQL_PWD='<你的密码>'

# 1. 建库建表（主库 + 消息中心，两库独立，可任意顺序）
mysql -uroot -h127.0.0.1 < sql/schema/20261008-1526-lesson_appointment-schema.sql
mysql -uroot -h127.0.0.1 < sql/schema/20261008-1527-message_center-schema.sql

# 2. 基础数据（术语/行业/套餐/系统配置；消息分类/敏感词/模板）
mysql -uroot -h127.0.0.1 lesson_appointment < sql/seed/20261008-1527-lesson_appointment-seed-dict-config.sql
mysql -uroot -h127.0.0.1 message_center   < sql/seed/20261008-1528-message_center-seed-sys.sql
```

执行完后应满足：

- `lesson_appointment` **29 张表**
- `message_center` **8 张表**
- `sys_term` 317 行、`msg_category` 14 行（含 `BOOKING_CREATED` / `BOOKING_CONFIRMED` / `LEAVE_CREATED` 三个业务分类编码，缺了消息一律被拒收）

验证：

```bash
mysql -uroot -h127.0.0.1 -N -e "
SELECT table_name FROM information_schema.tables WHERE table_schema='lesson_appointment';
SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='lesson_appointment';"
```

## 当前 schema 已包含的关键约束（勿手工重建）

| 约束 | 表 | 作用 |
|---|---|---|
| `uk_booking_schedule_student` | booking | 同一学生不可重复预订同一排期 |
| `uk_appt_booking_class` | appointment | `(booking_id, class_index)` 唯一，防重复课次 |
| `idx_appt_booking_id` | appointment | 课次按预订检索（**悬空引用治理的配套索引**） |
| `uk_dispatch_once` | notification_dispatch_log | 通知幂等键，重复发送会被 DB 挡住 |
| `course_schedule_chk_sites` | course_schedule | `available_sites >= 0`，防容量被改成负数 |
| `course_schedule_chk_1` | course_schedule | `end_time > start_time` |
| `uk_notify_rule_tenant_course` / `uk_refund_rule_tenant_course` | 规则表 | 租户+课程维度唯一 |

> **`available_sites` 的语义是「总席位」，不是剩余席位。**
> 剩余席位每次由 `BookingSeatService.countOccupyingForUpdate` 从 `booking` 表实时聚合。
> 因此"超卖判定"的输入是跨表聚合值，**数据库约束表达不了它**——防超卖必须靠接口层闸门
> （排期行锁 + 锁定读计数），DB 的 CHECK 和唯一键只是第二道兜底。改这两处前先读
> `BookingSeatService` 类注释。

## `patch/` 里的补丁为什么不用执行

这些补丁描述的是「**约束是什么时候、为什么加的**」，其效果已全部包含在当前 `schema/` 里。
重复执行反而会报 `Duplicate key name` / `Duplicate check constraint name`。

| 补丁 | 内容 | 已并入 schema |
|---|---|---|
| `20260900-0000-user-add-wx_openid.sql` | `user` 表加 `wx_openid` 列 | 是 |
| `20260918-0000-seat-oversell-hardening.sql` | 防超卖唯一键 + CHECK | 是 |
| `20260918-0000-course-notify-rule-schema.sql` | 上课通知规则表（2 张） | 是 |
| `20260918-0000-course-refund-rule-schema.sql` | 退改规则表 | 是 |
| `20260920-0000-message_center-sensitive-words-seed.sql` | 敏感词种子 | 是 |
| `20261008-0000-referential-integrity-cleanup.sql` | 清理悬空课次/流水 + 补课次索引 | 是 |

## 规范：约束变更必须回到这里

新增或修改任何表结构时：

1. 在**现网**执行变更（开发阶段）
2. 重新导出结构，落到本目录，文件名用当天的 `YYYYMMDD-HHMM`
3. 旧文件不删（保留演进历史），但新文件必须反映**完整的当前状态**（mysqldump 全量导出，不是增量片段）
4. 同步更新本 README 的「关键约束」表

**不要**在别处留 DDL 片段。`api/beforeRun/sql/` 下的旧脚本已标注废弃（少 4 张表），
`api/message-service/src/main/resources/sql/schema.sql` 与本目录 `message_center-schema.sql`
内容重复，以本目录为准。