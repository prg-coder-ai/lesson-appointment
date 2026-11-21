-- 录制模式列（2026-11-17，P2）
-- 背景：录制支持「人像 / 教学区域」二选一，P1 阶段只写事件流水、
--       回放列表无法区分类型；本脚本给 classroom_recording 加列，供回放标注。
-- 幂等：重复执行安全（information_schema 判存）。
-- 兼容：DEFAULT 'video'，历史记录一律视为人像录制；老客户端不传 captureMode 也默认 video。

SET @db = DATABASE();

SET @exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'classroom_recording' AND COLUMN_NAME = 'record_mode'
);
SET @sql = IF(@exists = 0,
  'ALTER TABLE `classroom_recording` ADD COLUMN `record_mode` VARCHAR(16) NOT NULL DEFAULT ''video'' COMMENT ''录制模式：video=人像 / screen=教学区域'' AFTER `status`',
  'SELECT ''record_mode 已存在，跳过'' AS msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
