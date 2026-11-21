-- ============================================================
-- 出勤回流表增加结算列（教案：课时扣减方案 v2 第四节）
-- 库：lesson_appointment
-- 日期：2026-10-28（S3）
--
-- 为什么要加：出勤事实（上了多久）与账务动作（扣几课时）要能各自追溯。
--   · consumed_lessons / consumption_state 记「这一课次扣了多少、扣没扣」
--   · appointment_id 是结算与状态推进的锚点（课次级升级后由此定位具体课次）
--   · adjust_reason 供管理员改判时留痕
--
-- 存量环境执行本文件即可（幂等：ADD COLUMN 前先判存在）。
-- 新环境直接跑 sql/schema/20261028-1700-lesson-attendance.sql（已含这些列）。
-- ============================================================

USE `lesson_appointment`;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='lesson_attendance'
             AND COLUMN_NAME='class_index');
SET @ddl := IF(@s=0,
  'ALTER TABLE `lesson_attendance` ADD COLUMN `class_index` int NOT NULL DEFAULT 1 COMMENT ''课次序号'' AFTER `consumption_version`',
  'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='lesson_attendance'
             AND COLUMN_NAME='appointment_id');
SET @ddl := IF(@s=0,
  'ALTER TABLE `lesson_attendance` ADD COLUMN `appointment_id` int DEFAULT NULL COMMENT ''对应 appointment.id''',
  'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='lesson_attendance'
             AND COLUMN_NAME='consumed_lessons');
SET @ddl := IF(@s=0,
  'ALTER TABLE `lesson_attendance` ADD COLUMN `consumed_lessons` decimal(4,2) NOT NULL DEFAULT 0.00 COMMENT ''本次计扣课时：0=请假/取消，1=未请假''',
  'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='lesson_attendance'
             AND COLUMN_NAME='consumption_state');
SET @ddl := IF(@s=0,
  'ALTER TABLE `lesson_attendance` ADD COLUMN `consumption_state` varchar(16) NOT NULL DEFAULT ''pending'' COMMENT ''pending/settled/waived''',
  'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='lesson_attendance'
             AND COLUMN_NAME='settled_at');
SET @ddl := IF(@s=0,
  'ALTER TABLE `lesson_attendance` ADD COLUMN `settled_at` datetime DEFAULT NULL COMMENT ''扣减生效时间''',
  'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='lesson_attendance'
             AND COLUMN_NAME='adjust_reason');
SET @ddl := IF(@s=0,
  'ALTER TABLE `lesson_attendance` ADD COLUMN `adjust_reason` varchar(255) DEFAULT NULL COMMENT ''人工改判原因''',
  'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;
