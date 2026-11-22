# 数据库脚本（权威单一事实源）

本目录是 **所有数据库相关脚本的唯一存放处**。新建库、重建环境、交接给他人，都只从这里取脚本。

- 命名规范：`YYYYMMDD-HHMM-<库名或范围>-<用途>.sql`，**按文件名字典序即执行顺序**
- 编码统一 UTF-8（无 BOM）
- 建表脚本由**现网 mysqldump 直接导出**，不手工维护 —— 手写的 DDL 一定会漂移出真相

## 目录结构

| 子目录 / 文件 | 用途 | 是否幂等 | 何时执行 |
|---|---|---|---|
| `00-create-databases.sql`（本目录根） | **建三库 + 应用账号授权 + root 远程登录收口**（三个库的字符集/排序规则与现网逐库对齐；末尾含 `root@localhost` 存在性硬断言） | 是（`IF NOT EXISTS` / `DROP USER IF EXISTS` 全程幂等） | 新环境初始化，**第 0 步** |
| `schema/` | 建库建表（含索引、外键、CHECK 约束） | 是（等保 P0-4：DROP 已注释禁用，`CREATE TABLE IF NOT EXISTS`；仅 10-25 两个补丁里的 `ALTER` 不可重跑，见下） | 新环境初始化，第 1~2 步 |
| `seed/` | 系统必需的基础数据（字典、术语、分类、法律文档） | 否（纯 INSERT，重复执行会主键冲突） | 新环境初始化，第 3 步 |
| `patch/` | 历史增量补丁，**绝大多数已并入当前 schema** | 各不相同 | **仅 `20261029-1300` 与 `20261113-1200` 两条必须执行**（课堂实例种子 + ws_base_path 修正，见下文「课堂开关两条必跑」）；**若 `classroom` 库是后建的，再跑 `20261122-1430-classroom-db-grant.sql` 补授权**（漏了 = 课堂全 500 + 管理端全 403，见该文件头注释）；其余仅供追溯"某约束何时加的" |

## 新环境初始化顺序

> 表数量口径（2026-11-20 核对）：`lesson_appointment` **45 张** =
> 基线 dump 34 张 + 手写文件 11 张：协议与政策 2（legal-doc）+ 登录风控 3（auth-guard）
> + 授课语言 1（work-language）+ **课堂实例与租户开关 2（eclassroom-tenant）
> + 出勤 1（lesson-attendance）+ 学生课时台账 2（student-lesson-ledger）**。
> `message_center` **8 张**、`classroom` **13 张**。
> 现网 `lesson_appointment` 是 49 张，多出的 4 张为 `bak_*_20261008`（2026-10-08 清理前的一次性备份表），新环境不需要。
>
> ⚠️ **2026-11-20 修正**：上一版本口径写「40 张 = 34 + 6」，并把课堂/出勤/课时台账三组
> 漏在初始化步骤之外。这三组的表**都不在**基线 dump 里，按旧文档建库会少 5 张表，表现为
> `sys_tenant_eclassroom` 不存在 → `/api/v1/eclassroom/config` 抛 1146 → 三端课堂入口永远出不来，
> 以及出勤 / 课时台账整组 500。

```bash
# 0. 建三库 + 应用账号（幂等；三条 CREATE DATABASE 的 collation 与现网逐库对齐，勿统一）
mysql -uroot -p < deploy/sql/00-create-databases.sql
#    ★ 执行前把文件里的 CHANGE_ME 换成真实密码；三份 /etc/lesson/*.env 的 DB_PASSWORD 必须一致
#    ★ 文件末尾会删掉 root 的**远程 host**（保留 root@localhost）并断言它仍存在。
#      若某镜像上 root 只有 'root'@'%'、没有 localhost，**先 RENAME 再跑**，否则会一个 root 都不剩
#      —— 判定口径见 deploy/README.md 第四节「MySQL 安全基线」

# 1. 基线表结构（两个库各自独立，可任意顺序。命令必须带库名 —— schema 文件里没有 USE）
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261013-0400-lesson_appointment-schema.sql
mysql -uroot -p message_center     < deploy/sql/schema/20261008-1527-message_center-schema.sql

# 2. 基线之外的手写表（11 张，缺任一组 → 对应功能整组 500）
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261014-legal-doc.sql                 # 协议与政策 2 表
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261022-1700-auth-guard.sql           # 登录风控 3 表
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261025-1700-work-language.sql        # 授课语言 1 表 + 内置六项种子
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261027-0900-eclassroom-tenant.sql    # 课堂实例 + 租户课堂开关 2 表 ★
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261028-1700-lesson-attendance.sql     # 出勤 1 表 ★
mysql -uroot -p lesson_appointment < deploy/sql/schema/20261028-1900-student-lesson-ledger.sql # 课时余额 + 流水 2 表 ★
#    ★ 带星号的三行是 2026-11-20 补进本清单的：sys_eclassroom_instance / sys_tenant_eclassroom /
#      lesson_attendance / student_lesson_balance / student_lesson_flow 都**不在**基线 dump 里。
#      sys_tenant_eclassroom 缺失时，EclassroomService.getTenantEclassroom 直接抛 1146，
#      课堂开关判定链断在第一步（三端"进入课堂/课程准备"永远不出现）。
#    ★ 20261025-1500-teaching-lang-duration.sql 新库【跳过】：基线已含目标列，
#      再跑报 Duplicate column（该文件只服务 2026-10-25 之前的老库升级）。
#    ★ 1700-work-language.sql 在新库上末尾三条 ALTER 报 Duplicate column 属预期：
#      建表+种子在文件前部已生效；老库（<2026-10-25）则全量生效。

# 3. 基础数据（术语/行业/套餐/系统配置；消息分类/敏感词/模板；法律文档）
mysql -uroot -p lesson_appointment < deploy/sql/seed/20261008-1527-lesson_appointment-seed-dict-config.sql
mysql -uroot -p message_center     < deploy/sql/seed/20261008-1528-message_center-seed-sys.sql
mysql -uroot -p lesson_appointment < deploy/sql/seed/20261015-legal-doc-seed.sql

# 4. 课堂库（该文件自带 CREATE DATABASE classroom + USE，13 张表）
mysql -uroot -p < api/classroom-service/sql/classroom-schema.sql

# 5. 课堂开关的两条必跑补丁（新环境唯一需要执行的 patch，均幂等）
mysql -uroot -p lesson_appointment < deploy/sql/patch/20261029-1300-eclassroom-default-instance.sql
mysql -uroot -p lesson_appointment < deploy/sql/patch/20261113-1200-eclassroom-education-tenant-bind.sql
#    第一条种默认课堂实例。sys_eclassroom_instance 为空时，平台端「课堂配置」无实例可绑，
#    **课堂功能首次部署后完全不可用**（该 patch 头部注释有完整说明）。
#    第二条把它种歪的 ws_base_path='/ws' 归一回 ''，否则前端会拼出
#    ws://host:port/ws/ws/classrooms/... → 白板/心跳/信令全连不上。

# 6. 授权自检（★ 漏跑第 0 步时，唯一能看见的症状就在这里 —— 2026-11-22 实战）
#    classroom 库常常是后建的（课堂是第三个上线模块），第 0 步那三条 GRANT 就不会生效，
#    lesson 账号能连前两个库、唯独没有 classroom 的权限。
#    症状：平台端「课堂监视」每行 500 MyBatisSystemException（连接层，响应里没有任何 SQL 文案），
#          管理端凡是课堂接口一律 403「课堂未启用」（开关判定的查询异常被 catch 降级成 false）。
#    修：跑本目录 patch/20261122-1430-classroom-db-grant.sql（幂等，不建账号不改密码）
mysql -uroot -p < deploy/sql/patch/20261122-1430-classroom-db-grant.sql
# 必须用应用账号、按 JDBC 的方式（127.0.0.1 而非 localhost）真连一次：
mysql -h127.0.0.1 -ulesson -p classroom -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='classroom';"
#   期望 13。报 1044/1142 Access denied = 授权还没生效，先别去查业务代码。
```

执行完后应满足：

- `lesson_appointment` **45 张表**、`message_center` **8 张表**、`classroom` **13 张表**
- `sys_term` 317 行、`sys_work_language` 内置 6 行（tenant_id=0）、
  `msg_category` 14 行（含 `BOOKING_CREATED` / `BOOKING_CONFIRMED` / `LEAVE_CREATED` 三个业务分类编码，缺了消息一律被拒收）
- `sys_eclassroom_instance` **1 行**：`instance_code='default-local'`、`api_port=8092`、`ws_base_path=''`

验证：

```bash
mysql -uroot -p -N -e "
SELECT table_schema, COUNT(*) FROM information_schema.tables
 WHERE table_schema IN ('lesson_appointment','message_center','classroom') GROUP BY table_schema;
SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='lesson_appointment';
SELECT instance_code, api_host, api_port, ws_base_path FROM lesson_appointment.sys_eclassroom_instance;"
```

### 2026-11-20 修掉的三处 DDL 缺陷（都会让新库"少表"却不报明显错）

| 文件 | 缺陷 | 修前的症状 |
|---|---|---|
| `schema/20261013-0400-lesson_appointment-schema.sql`（`course_schedule`） | `class_duration` 列**重复定义两次** | 整条 `CREATE TABLE` 报 1060 Duplicate column → `course_schedule` 一张表都建不出来；加 `--force` 时"看起来导入成功"，实际少表 |
| `schema/20261025-1700-work-language.sql` | 文件中部有一条 `USE lesson_appointment;` | **静默切库**：`mysql <别的库> < 本文件` 里的库名失效，从该行起全部语句写进 `lesson_appointment`（表已存在被 `IF NOT EXISTS` 跳过），临时库始终少一张 `sys_work_language` |
| `schema/20261027-0900-eclassroom-tenant.sql`、`schema/20261028-1700-lesson-attendance.sql` | 未注释的 `DROP TABLE IF EXISTS` | 在**已有环境**重跑会直接删表 → 课堂绑定关系 / 出勤记录全丢，且无任何提示。与本目录"等保 P0-4：DROP 已注释禁用"的口径自相矛盾 |

修法：重复列删除（语义保留为注释）、`USE` 与三处 `DROP` 一并注释禁用、对应 `CREATE TABLE` 统一为 `IF NOT EXISTS`。

> 验证方式（修完已实跑）：临时库（utf8mb4_unicode_ci）按上文第 0~3 步连跑**两轮**，
> 两轮结果都是 **45 张表**（幂等）；两条必跑 patch 连跑两次仍只有 1 条 `default-local` 实例，
> `ws_base_path` 为空串。跑完删库，未触碰现网（现网 `sys_work_language` 的 `update_time` 仍是 2026-10-25）。

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

## `patch/` 里的补丁：两条必跑，其余只是追溯

### 必跑的两条（2026-11-20 补记）

| 补丁 | 为什么新环境也必须跑 |
|---|---|
| `20261029-1300-eclassroom-default-instance.sql` | 它**不是结构补丁，是种子数据** —— `sys_eclassroom_instance` 的建表脚本只建表不种实例，表为空时平台端「课堂实例」页没有实例可绑，课堂功能首次部署后完全不可用。文件已做成 `SELECT ... WHERE NOT EXISTS` 幂等形式，可重复执行 |
| `20261113-1200-eclassroom-education-tenant-bind.sql` | ① 把上一条种歪的 `ws_base_path='/ws'` 归一回 `''`（留着会拼出 `ws://host:port/ws/ws/classrooms/...`，白板/心跳/信令全连不上）；② 给 `industry_id=4`（教育培训）且启用中的租户绑定默认实例。新环境若还没有教育培训租户，第 ② 步自然无操作 |

> 早先本节标题是「patch 里的补丁为什么不用执行」，把上面两条也一起排除了 ——
> 结果是**课堂在新环境开不起来**，且报错指向 `sys_tenant_eclassroom` 为空而不是这条 patch。

### 其余补丁为什么不用执行

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

> 另有 `schema/` 内的「手写表」不走 patch/ 目录（它们的表**不在**基线 dump 里，必须显式执行）：
> `20261014-legal-doc.sql`、`20261022-1700-auth-guard.sql`、`20261025-1700-work-language.sql`、
> `20261027-0900-eclassroom-tenant.sql`、`20261028-1700-lesson-attendance.sql`、
> `20261028-1900-student-lesson-ledger.sql`（共 11 张表），见上文初始化顺序第 2 步。

## 规范：约束变更必须回到这里

新增或修改任何表结构时：

1. 在**现网**执行变更（开发阶段）
2. 重新导出结构，落到本目录，文件名用当天的 `YYYYMMDD-HHMM`
3. 旧文件不删（保留演进历史），但新文件必须反映**完整的当前状态**（mysqldump 全量导出，不是增量片段）
4. 同步更新本 README 的「关键约束」表

**不要**在别处留 DDL 片段。历史上这个目录曾叫 `api/sql/`，更早的 `api/beforeRun/sql/` 废弃副本
已在提交 `f0bf2fbd` 删除；2026-11-18 起权威目录就是本 `deploy/sql/`。
若旧文档仍引用旧路径，按本目录 `schema/` 的同名快照执行即可。
`api/message-service/src/main/resources/sql/schema.sql` 与本目录
`schema/20261008-1527-message_center-schema.sql` 内容重复，**以本目录为准**。

> 另注：`schema/` 下的脚本是 mysqldump 导出的**表结构**，不带 `CREATE DATABASE` / `USE`，
> 导入前必须先建库并显式指定库名（`mysql <库名> < schema/xxx.sql`）。
> 建库这一步由本目录根的 `00-create-databases.sql` 负责（顺带建 `lesson` 应用账号并授权三库），
> 必须先于所有 `schema/*.sql` 执行。
> 唯一自带建库的是 `api/classroom-service/sql/classroom-schema.sql`（`CREATE DATABASE classroom` + `USE`），
> 它在初始化顺序的第 4 步单独执行。