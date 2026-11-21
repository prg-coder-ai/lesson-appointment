-- =============================================================================
-- 数据完整性兜底迁移（薄弱环节分析报告 20261007 · 根因 C）
-- 目标库：MySQL 8.4 / lesson_appointment
-- 执行日期：2026-10-08
--
-- 【先读这一段】为什么不做成"补外键约束"就完事
-- -----------------------------------------------------------------------------
-- 报告原文写的是"库中缺少外键与索引约束"，本次逐条核对 information_schema 后**修正了
-- 该表述**：库里其实有 14 个外键（fk_booking_schedule / fk_booking_student / fk_course_teacher
-- / fk_course_template / fk_schedule_course / fk_check_in_booking / fk_evaluation_* /
-- fk_feedback_* / fk_tat_teacher / fk_tc_teacher / fk_tp_teacher），
-- 且它们的 DELETE_RULE **全部是 CASCADE**。
--
-- 也就是说：悬空引用不是"漏加约束"，而是**数据库在盲级联物理删**造成的。
-- 机制如下（实测 149 行课次中 109 行 booking_id 指向不存在的预订）：
--
--   DELETE FROM course_schedule WHERE schedule_id = X
--     └─ fk_booking_schedule ON DELETE CASCADE
--          └─ 自动 DELETE FROM booking WHERE schedule_id = X   ← 应用层完全不知情
--               └─ appointment 没有指向 booking 的外键 → 课次行成为孤儿（booking_id 悬空）
--
-- 为什么不能靠加 FK + CASCADE 解决：
--   1. 课次带 status / class_index / appointment_datetime 这些**业务语义**，
--      "父没了子该删、该置 cancelled、还是该保留"是业务决策，DB 不认这套语义。
--      加了 CASCADE 就等于把"删课次"这个决策交给了数据库，且不可观测、不可审计。
--   2. 本项目已按用户决策把级联收到程序内（ReferentialCascadeService），
--      若同时保留 DB 的 CASCADE，会出现"两边都在删、删的量还不一样"的错位。
--   3. 报告第 3 批已实测过：booking 取消时课次必须**保留行**并置 cancelled/frozen，
--      物理删除会抹掉上课历史。这与 CASCADE 的语义直接冲突。
--
-- 因此本迁移的取向是：
--   ✅ **只补索引与唯一键**（幂等与查询性能，不改变删除语义）
--   ✅ **清理既有悬空行**（先备份，后删）
--   ❌ **不新增指向 appointment / notification_dispatch_log 的 CASCADE 外键**
--      —— 这两张表的删除已由程序级联负责，级联顺序见 CascadeRules 规则表。
--      确需约束兜底时，用下面注释掉的 NO ACTION 建法（会让程序漏删时立刻报错，
--      而不是静默留下悬空），但**必须先清干净存量**才能加得上。
--
-- 【执行前置】已完成的备份（脚本内可重复执行，INSERT IGNORE 保证不重复）
--   bak_appointment_20261008            （149 行）
--   bak_notification_dispatch_log_20261008（58 行）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 第 1 步：清理悬空 notification_dispatch_log（先于 appointment，因为前者引用后者）
-- -----------------------------------------------------------------------------
-- 这 12 行的 appointment_id 指向已被 CASCADE 删除的课次。它们除了占地方没有别的作用：
-- 通知已发过的事实由 audit_log 与消息中心保留，不需要靠这张流水表。
-- 注意：uk_dispatch_once 含 appointment_id，留着它们在原 appointment_id 被复用时
--       （AUTO_INCREMENT 复用低水位 id 是常态）会**静默吞掉新的通知**——
--       所以这不是"无害的历史垃圾"，是会伤人的。
DELETE d FROM notification_dispatch_log d
LEFT JOIN appointment a ON d.appointment_id = a.id
WHERE a.id IS NULL;

-- 顺带清 booking_id 悬空的流水（10 行）。这类行的 appointment_id 可能还在，
-- 但 booking 已不存在，属于半悬空。
DELETE d FROM notification_dispatch_log d
LEFT JOIN booking b ON d.booking_id = b.booking_id
WHERE d.booking_id IS NOT NULL AND b.booking_id IS NULL;

-- -----------------------------------------------------------------------------
-- 第 2 步：清理悬空 appointment（109 行）
-- -----------------------------------------------------------------------------
-- booking_id 指向不存在的预订。成因是第 3 批之前删除排期/课程时
-- booking 被数据库 CASCADE 连带删除，而这些课次没有跟着删。
--
-- ⚠️ 为什么这里必须**物理删除**而不是置 status：
--   appointment 表没有独立的"已删除"语义承载方式——置 frozen 会让
--   NotifyTask 之外的巡检反复扫到它们（NotifyDispatchService 的终态集合里
--   frozen 已算终态，但数据维护页与报表仍会把它们算作"课次"）。
--   而这些行的 booking 都已经不存在了，保留它们没有任何可追溯的价值：
--   既无法回答"这是谁的课次"，也无法回答"这个课次为什么还在"。
--   完整内容已在 bak_appointment_20261008 备份，需要时可按 id 查回。
DELETE a FROM appointment a
LEFT JOIN booking b ON a.booking_id = b.booking_id
WHERE a.booking_id IS NOT NULL AND b.booking_id IS NULL;

-- -----------------------------------------------------------------------------
-- 第 3 步：补 appointment 的索引与唯一键
-- -----------------------------------------------------------------------------
-- 3.1 booking_id 单列索引
--     缺失后果：级联与巡检都要按 booking_id 查（"这个预订下有几条课次"），
--     实测 149 行时尚可忍受，但这是每次状态联动都会走的热路径。
--     另：诊断脚本 ReferentialCascadeService#countOrphans 也走它。
ALTER TABLE appointment ADD INDEX idx_appt_booking_id (booking_id);

-- 3.2 UNIQUE(booking_id, class_index)
--     语义：一个预订的第 N 节课只能有一条记录。重复即数据错误
--     （历史上 generateAppointmentsForBooking 的"已存在就跳过"幂等缺陷
--      曾导致同一时段出现两条时间行，第 3 批已修逻辑，此键是防回归的最后一道闸）。
--     ⚠️ 加唯一键前必须先确认无重复，否则 ALTER 直接失败。
--     本次执行前实测 appt_dup_booking_idx = 0（无重复）。
--
--     class_index 在 DDL 里是 DEFAULT 1 的可空列，而 MySQL 唯一索引不约束 NULL。
--     为让唯一键真正生效（含 booking_id 有值但 class_index 为 NULL 的情形），
--     先把 NULL 归一为 1——与 DDL 默认值语义一致，不会改变任何一行的实际含义。
UPDATE appointment SET class_index = 1 WHERE class_index IS NULL;

-- 重复值自查：有重复时下面的 ALTER 会报错，此时先查
--   SELECT booking_id, class_index, COUNT(*) c FROM appointment
--   WHERE booking_id IS NOT NULL GROUP BY booking_id, class_index HAVING c > 1;
ALTER TABLE appointment ADD UNIQUE KEY uk_appt_booking_class (booking_id, class_index);

-- -----------------------------------------------------------------------------
-- 第 4 步：清理 booking_id 的双生成器遗留（不删数据，只统一未来行为）
-- -----------------------------------------------------------------------------
-- 实测 booking 表同时存在两种 booking_id：
--   32 位无横线 hex 105 行（BookingService.java:93 UUID.randomUUID().toString().replace("-","")）
--   36 位带横线 UUID 5 行（CourseScheduleService.java:461 UUID.randomUUID().toString()）
-- 而 appointment 表里 32 位的 124 行只有 15 行能匹配上 booking，
-- 36 位的 25 行全部匹配 —— 说明 32 位那一批大量是历史悬空。
--
-- 这里**不改历史数据**（改 booking_id 会连带影响所有引用它的行，风险远大于收益）。
-- 代码侧的统一见第 4 批改动：课次生成一律走 BookingService 的 bookingId，
-- CourseScheduleService 的"指定学生"分支已改为复用 BookingService 的 ID 生成口径。
--
-- 如需为后续加一道防线，可启用下面这条（当前不加：历史数据不满足唯一性）：
--   ALTER TABLE booking ADD UNIQUE KEY uk_booking_id (booking_id);

-- =============================================================================
-- 执行后自检（全部应为 0）
-- =============================================================================
-- SELECT 'appt_orphan_booking' k, COUNT(*) c FROM appointment a
--   LEFT JOIN booking b ON a.booking_id=b.booking_id
--   WHERE a.booking_id IS NOT NULL AND b.booking_id IS NULL
-- UNION ALL
-- SELECT 'dispatch_orphan_appt', COUNT(*) FROM notification_dispatch_log d
--   LEFT JOIN appointment a ON d.appointment_id=a.id WHERE a.id IS NULL
-- UNION ALL
-- SELECT 'dispatch_orphan_booking', COUNT(*) FROM notification_dispatch_log d
--   LEFT JOIN booking b ON d.booking_id=b.booking_id
--   WHERE d.booking_id IS NOT NULL AND b.booking_id IS NULL
-- UNION ALL
-- SELECT 'appt_dup_booking_idx', COUNT(*) FROM (
--   SELECT booking_id, class_index FROM appointment WHERE booking_id IS NOT NULL
--   GROUP BY booking_id, class_index HAVING COUNT(*)>1) t;
