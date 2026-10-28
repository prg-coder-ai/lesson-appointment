-- ============================================================
-- course_schedule 增加单课时长列 class_duration（分钟）
-- 库：lesson_appointment
-- 日期：2026-10-28（多课次事件推送配套）
--
-- 为什么要加：
--   重复排期的 end_time 承载的是「重复结束日期」（如每周二 10:00 共 8 周，
--   end_time 是第 8 周那天的时刻），拿它减 start_time 算不出「一节课有多长」。
--   此前课堂侧只能回落默认 60 分钟：30/45 分钟的课被按 60 分钟封顶核算，
--   有效时长与课时消耗跟着一起错。
--
-- 存量环境执行本文件即可（幂等：ADD COLUMN 前先判存在）。
-- 新环境直接跑 sql/schema/20261013-0400-lesson_appointment-schema.sql（已含该列）。
-- ============================================================

USE `lesson_appointment`;

SET @s := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='course_schedule'
             AND COLUMN_NAME='class_duration');
SET @ddl := IF(@s=0,
  'ALTER TABLE `course_schedule` ADD COLUMN `class_duration` int NOT NULL DEFAULT 60 '
    + 'COMMENT ''单课时长（分钟；重复排期的 end_time 是重复结束日期，不能用于推算单课时长）'' '
    + 'AFTER `available_sites`',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 校验：列必须存在且默认值为 60（与实体 CreateDtoToObject 的兜底口径一致）
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='lesson_appointment' AND TABLE_NAME='course_schedule'
  AND COLUMN_NAME='class_duration';
