# 数据库脚本（权威单一事实源）

本目录是 **所有数据库相关脚本的唯一存放处**。新建库、重建环境、交接给他人，都只从这里取脚本。

- 命名规范：`YYYYMMDD-HHMM-<库名或范围>-<用途>.sql`，**按文件名字典序即执行顺序**
- 编码统一 UTF-8（无 BOM）
- 建表脚本由**现网 mysqldump 直接导出**，不手工维护 —— 手写的 DDL 一定会漂移出真相

## 目录结构

| 子目录 | 用途 | 是否幂等 | 何时执行 |
|---|---|---|---|
| `schema/` | 建库建表（含索引、外键、CHECK 约束） | 是（等保 P0-4：DROP 已注释禁用，`CREATE TABLE IF NOT EXISTS`；仅 10-25 两个补丁里的 `ALTER` 不可重跑，见下） | 新环境初始化，第 1 步 |
| `seed/` | 系统必需的基础数据（字典、术语、分类、法律文档） | 否（纯 INSERT，重复执行会主键冲突） | 新环境初始化，第 2 步 |
| `patch/` | 历史增量补丁，**已并入当前 schema** | 各不相同 | 仅供追溯"某约束何时加的"，**新环境不需要执行** |

## 新环境初始化顺序

> 表数量口径（2026-11-04 核对）：`lesson_appointment` **40 张** =
> 基线 dump 34 张 + 手写文件 6 张（协议与政策 2 + 登录风控 3 + 授课语言 1）。
> `message_center` 8 张。**基线 dump 已含 2026-10-25 的三列**
> （course_template/course/course_schedule 的 language_type + work_language + class_duration），
> 但 `sys_work_language` 表只在 1700 补丁里定义——所以手写文件一个都不能少。

```bash
# 0. 前置：确认密码（勿把密码写进脚本）
export MYSQL_PWD='<你的密码>'

# 1. 建库建表（主库基线 + 消息中心，两库独立，可任意顺序）
mysql -uroot -h127.0.0.1 < api/sql/schema/20261013-0400-lesson_appointment-schema.sql
mysql -uroot -h127.0.0.1 < api/sql/schema/20261008-1527-message_center-schema.sql

# 2. 基线之外的 6 张手写表（缺一组，对应功能整组 500）
mysql -uroot -h127.0.0.1 < api/sql/schema/20261014-legal-doc.sql        # 协议与政策 2 表
mysql -uroot -h127.0.0.1 < api/sql/schema/20261022-1700-auth-guard.sql  # 登录风控 3 表
mysql -uroot -h127.0.0.1 < api/sql/schema/20261025-1700-work-language.sql # 授课语言 1 表 + 内置六项种子
#    ★ 20261025-1500-teaching-lang-duration.sql 新库【跳过】：基线已含目标列，
#      再跑报 Duplicate column（该文件只服务 2026-10-25 之前的老库升级）。
#    ★ 1700-work-language.sql 在新库上末尾三条 ALTER 报 Duplicate column 属预期：
#      建表+种子在文件前部已生效；老库（<2026-10-25）则全量生效。

# 3. 基础数据（术语/行业/套餐/系统配置；消息分类/敏感词/模板；法律文档）
mysql -uroot -h127.0.0.1 lesson_appointment < api/sql/seed/20261008-1527-lesson_appointment-seed-dict-config.sql
mysql -uroot -h127.0.0.1 message_center     < api/sql/seed/20261008-1528-message_center-seed-sys.sql
mysql -uroot -h127.0.0.1 lesson_appointment < api/sql/seed/20261015-legal-doc-seed.sql
```

执行完后应满足：

- `lesson_appointment` **40 张表**、`message_center` **8 张表**
- `sys_term` 317 行、`sys_work_language` 内置 6 行（tenant_id=0）、
  `msg_category` 14 行（含 `BOOKING_CREATED` / `BOOKING_CONFIRMED` / `LEAVE_CREATED` 三个业务分类编码，缺了消息一律被拒收）

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
| `20261008-2130-appointment-utc.sql` | 预约/课次时间 UTC 化迁移（⚠ 含清空 appointment/booking 的 DELETE，只许在迁移窗口跑） | 是 |
| `20261011-0100-appointment-refund-snapshot.sql` | 课次退款快照列 | 是 |
| `20261013-0200/0300-wx-userid/promo-create.sql` | 微信关联表 + 推广三表 | 是 |
| `20261014-1935/2000-wx-*.sql` | wx_userid 补 unionid、微信登录状态表 | 是 |
| `20261104-2330-align-course-teaching-cols.sql` | **幂等补列**：按 information_schema 判断后补 `course`/`course_schedule` 的 language_type / class_duration / work_language（10-25 那两份裸 ALTER 撞 Duplicate 就中止，会"只补一半"；老库/半补库用本文件收敛） | 是 |

> 另有 `schema/` 内三个「手写表 + 一个升级补丁」不走 patch/ 目录（它们的表**不在**基线 dump 里）：
> `20261014-legal-doc.sql`、`20261022-1700-auth-guard.sql`、`20261025-1500/1700-*.sql`，见上文初始化顺序。

## 规范：约束变更必须回到这里

新增或修改任何表结构时：

1. 在**现网**执行变更（开发阶段）
2. 重新导出结构，落到本目录，文件名用当天的 `YYYYMMDD-HHMM`
3. 旧文件不删（保留演进历史），但新文件必须反映**完整的当前状态**（mysqldump 全量导出，不是增量片段）
4. 同步更新本 README 的「关键约束」表

**不要**在别处留 DDL 片段。历史上有过 `api/beforeRun/sql/` 副本，已在提交 `f0bf2fbd` 删除
（内容与本目录重复且少 4 张表）；若旧文档仍引用它，按本目录 `schema/` 的同名快照执行即可。
`api/message-service/src/main/resources/sql/schema.sql` 与本目录
`schema/20261008-1527-message_center-schema.sql` 内容重复，**以本目录为准**。

> 另注：`schema/` 下的脚本是 mysqldump 导出的**表结构**，不带 `CREATE DATABASE` / `USE`，
> 导入前必须先建库并显式指定库名（`mysql <库名> < schema/xxx.sql`）。
> 唯一例外是 `api/classroom-service/sql/classroom-schema.sql`（自带建库）。