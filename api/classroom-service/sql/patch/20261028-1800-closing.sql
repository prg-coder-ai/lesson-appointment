-- ==============================================================================
-- classroom-service 增量补丁：课时核算正确性（P0-C）
-- 日期：2026-10-28 18:00
--
-- 背景：需求 F2-03「有效时长累计：扣除 60 秒内抖动重连，封顶课时时长」。
-- 修复前 AttendanceService 只算「首次签到 → 最后一次签退」的单段差并取 max，
-- 导致①离线时长被计入②抖动不扣③不封顶。要按在线区间累加就必须有「多段区间」，
-- 而 classroom_membership 是 (schedule_id,user_id) 单行、只保留最后一次 join/leave，
-- 装不下多次进出，故新增独立区间表。
--
-- 执行环境：已存在 classroom 库（新建环境直接跑 sql/classroom-schema.sql 即可，已含本表）
-- ==============================================================================

USE `classroom`;

-- ------------------------------------------------------------
-- 1. 在线区间（每进一次课堂一段）
--    join_at 必填、leave_at 可空（NULL = 该段尚未闭合）。
--    有效时长 = 合并间隙 ≤ jitter 的相邻段后各段秒数之和，再封顶课时时长。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `classroom_presence_segment` (
  `id`           BIGINT      NOT NULL AUTO_INCREMENT,
  `schedule_id`  VARCHAR(64) NOT NULL COMMENT '排期id=课堂id',
  `user_id`      VARCHAR(64) NOT NULL COMMENT '用户id',
  `join_at`      DATETIME    NOT NULL COMMENT '进入时间',
  `leave_at`     DATETIME    NULL     COMMENT '离开时间(NULL=尚未闭合)',
  `leave_reason` VARCHAR(20) NULL     COMMENT 'active/disconnect/kicked/closed',
  `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ps_schedule_user` (`schedule_id`, `user_id`, `join_at`),
  KEY `idx_ps_open` (`schedule_id`, `user_id`, `leave_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课堂在线区间(有效时长核算依据)';

-- ------------------------------------------------------------
-- 2. 课堂表增加课时消耗版本号
--    每次「下课收尾」+1 并随出勤回调下发；预约侧按 (schedule_id,user_id) 落库时
--    低于库内版本的报文整条丢弃，防止重放乱序把已结算的明细覆盖回旧值。
-- ------------------------------------------------------------
SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'classroom' AND TABLE_NAME = 'classroom'
    AND COLUMN_NAME = 'consumption_version'
);
SET @ddl := IF(@exist = 0,
  'ALTER TABLE `classroom` ADD COLUMN `consumption_version` INT NOT NULL DEFAULT 0 COMMENT ''课时消耗版本号(每次下课收尾+1)'' AFTER `version`',
  'DO 0');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
