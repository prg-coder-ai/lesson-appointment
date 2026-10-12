-- ============================================================
-- 课次时间 UTC 化（v1.1）
-- 目标：排期层保持"本地墙钟时间 + time_zone"不变；
--       自 appointment 起，后台时间一律 UTC；展示层按用户时区渲染。
-- 依据：doc-develop/课次时间UTC化改造方案.md
-- 日期：2026-10-08
-- ============================================================

-- ------------------------------------------------------------
-- 0. 备份（可回滚）。沿用既有 bak_YYYYMMDD 约定。
--    库内数据全为测试数据，用户已授权清空。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bak_booking_20261008           AS SELECT * FROM booking;
CREATE TABLE IF NOT EXISTS bak_appointment_20261008      AS SELECT * FROM appointment;
CREATE TABLE IF NOT EXISTS bak_notif_log_20261008        AS SELECT * FROM notification_dispatch_log;

-- ------------------------------------------------------------
-- 1. 清空存量测试数据
--    顺序有讲究：通知流水必须最先清。
--    notification_dispatch_log 上有幂等唯一键 uk_dispatch_once，
--    若留残留，后续重新生成的课次会被"已通知过"判定拦住。
--    然后课次 → 预订（appointment 没有指向 booking 的 FK，但保持逻辑顺序一致）。
--    course_schedule / course 保留 —— 排期是录入的模板数据，不是测试产物。
-- ------------------------------------------------------------
DELETE FROM notification_dispatch_log;
DELETE FROM appointment;
DELETE FROM booking;

-- ------------------------------------------------------------
-- 2. 课次时间列语义改为 UTC
--    列名保持不变（避免动全部 SQL / 索引 / 前端字段名），
--    只把注释写清楚，读者不会再误以为是本地时间。
--
--    ⚠️ 按方案 v1.1 修订，此处【不】新增 time_zone 列。
--    理由：课次存的已经是 UTC 瞬时值，转换在生成那一刻就完成了；
--    "排期时区日后被编辑不应追溯改变课次"这件事，UTC 本身已经防住，
--    再存一份排期时区快照不提供额外保护，反而制造了
--    "appointment.time_zone 与 course_schedule.time_zone 不一致该信谁"的新漂移面。
--    需要"这个课次当初按哪个时区排"时，走既有链路：
--    appointment → booking_id → booking → schedule_id → course_schedule.time_zone
-- ------------------------------------------------------------
ALTER TABLE appointment
  MODIFY COLUMN appointment_datetime datetime NULL
    COMMENT '课次时间（UTC）——由排期本地时间按 course_schedule.time_zone 换算写入',
  MODIFY COLUMN last_datetime datetime NULL
    COMMENT '改期前原课次时间（UTC）';
