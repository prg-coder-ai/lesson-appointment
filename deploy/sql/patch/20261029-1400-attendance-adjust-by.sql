-- F2-04 补签审计：课堂出勤表增加操作人列，记录补签教师 userId（此前只有原因、没有"谁签的"）。
-- 幂等：列已存在则跳过 ALTER。
SET @dbname = DATABASE();
SET @tbname = 'classroom_attendance';
SET @colname = 'adjust_by';
SET @exist = (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tbname AND COLUMN_NAME = @colname);
SET @sql = IF(@exist = 0,
    'ALTER TABLE classroom_attendance ADD COLUMN adjust_by VARCHAR(64) NULL COMMENT ''补签操作人(教师 userId)'' AFTER adjust_reason',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
