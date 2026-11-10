-- =============================================================
-- 远端库对齐：补齐 course / course_schedule 的「教学语言 / 课时长度 / 授课语言」列
-- 2026-11-04
-- -------------------------------------------------------------
-- 为什么需要这个文件（而不是直接重跑 20261025-1500 / -1700）：
--   那两份补丁用的是**裸 ALTER**，列已存在时报 Duplicate column 并**中止整个文件**，
--   于是"只补了一半"——典型症状：模板保存通了，但新建课程 500
--   （CourseService.addCourse 强制把模板的 languageType / workLanguage / classDuration
--     写进课程实体，MyBatis-Plus insert 会带上这三列；库里缺列 → Unknown column → 500）。
--
-- 本文件的特性：
--   · 逐列判断 information_schema 后再动态执行 —— **可反复执行**，存在的列自动跳过；
--   · 只加列、不删不改，不动任何已有数据；
--   · 末尾带回填（只回填空值，幂等）与核对查询。
--
-- 执行：mysql -uroot -p < 本文件        （自带 USE lesson_appointment）
-- =============================================================

USE `lesson_appointment`;

-- ------------------------------------------------------------
-- 0. 先看现状（缺哪些列一目了然）
-- ------------------------------------------------------------
SELECT '=== 补列前 ===' AS step;
SELECT table_name, column_name, column_type
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name IN ('course_template', 'course', 'course_schedule')
   AND column_name IN ('language_type', 'work_language', 'class_duration')
 ORDER BY table_name, column_name;

-- ------------------------------------------------------------
-- 1. course：language_type / class_duration / work_language
-- ------------------------------------------------------------
SET @n := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'course' AND column_name = 'language_type');
SET @s := IF(@n = 0,
  'ALTER TABLE `course` ADD COLUMN `language_type` varchar(20) NOT NULL DEFAULT '''' COMMENT ''教学语言（创建课程时从模板导入，可在排期上覆盖）'' AFTER `template_id`',
  'SELECT ''course.language_type 已存在，跳过'' AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @n := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'course' AND column_name = 'class_duration');
SET @s := IF(@n = 0,
  'ALTER TABLE `course` ADD COLUMN `class_duration` int NOT NULL DEFAULT ''60'' COMMENT ''课时长度（分钟，创建课程时从模板导入）'' AFTER `language_type`',
  'SELECT ''course.class_duration 已存在，跳过'' AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @n := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'course' AND column_name = 'work_language');
SET @s := IF(@n = 0,
  'ALTER TABLE `course` ADD COLUMN `work_language` varchar(20) NOT NULL DEFAULT '''' COMMENT ''授课语言（创建课程时从模板继承；空=未指定）'' AFTER `language_type`',
  'SELECT ''course.work_language 已存在，跳过'' AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ------------------------------------------------------------
-- 2. course_schedule：language_type / class_duration / work_language
--    （排期创建与冲突检查都读这几列；缺了会在"建排期"时 500）
-- ------------------------------------------------------------
SET @n := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'course_schedule' AND column_name = 'language_type');
SET @s := IF(@n = 0,
  'ALTER TABLE `course_schedule` ADD COLUMN `language_type` varchar(20) NOT NULL DEFAULT '''' COMMENT ''教学语言（默认取自课程，可在本条排期覆盖）'' AFTER `course_id`',
  'SELECT ''course_schedule.language_type 已存在，跳过'' AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @n := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'course_schedule' AND column_name = 'class_duration');
SET @s := IF(@n = 0,
  'ALTER TABLE `course_schedule` ADD COLUMN `class_duration` int NOT NULL DEFAULT ''60'' COMMENT ''课时长度（分钟，默认取自课程，可在本条排期覆盖）'' AFTER `language_type`',
  'SELECT ''course_schedule.class_duration 已存在，跳过'' AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @n := (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'course_schedule' AND column_name = 'work_language');
SET @s := IF(@n = 0,
  'ALTER TABLE `course_schedule` ADD COLUMN `work_language` varchar(20) NOT NULL DEFAULT '''' COMMENT ''授课语言（默认取自课程，可在本条排期覆盖；空=跟随课程）'' AFTER `language_type`',
  'SELECT ''course_schedule.work_language 已存在，跳过'' AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ------------------------------------------------------------
-- 3. 存量回填（只填空值，幂等；顺序不能颠倒——排期读回填后的 course）
--    只回填 language_type / class_duration：work_language 按设计"存量不迁移"，留空串。
-- ------------------------------------------------------------
UPDATE `course` c
  JOIN `course_template` t ON c.`template_id` = t.`template_id`
   SET c.`language_type`  = t.`language_type`,
       c.`class_duration` = t.`class_duration`
 WHERE c.`language_type` = '';

UPDATE `course_schedule` s
  JOIN `course` c ON s.`course_id` = c.`course_id`
   SET s.`language_type`  = c.`language_type`,
       s.`class_duration` = c.`class_duration`
 WHERE s.`language_type` = '';

-- ------------------------------------------------------------
-- 4. 补列后核对：三表 × 三列应齐全（9 行）；course 不应有 language_type 空值
-- ------------------------------------------------------------
SELECT '=== 补列后（应为 9 行）===' AS step;
SELECT table_name, column_name, column_type, column_default
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name IN ('course_template', 'course', 'course_schedule')
   AND column_name IN ('language_type', 'work_language', 'class_duration')
 ORDER BY table_name, column_name;

SELECT '=== 回填结果（empty_lang 应为 0）===' AS step;
SELECT 'course' AS tbl, COUNT(*) AS total, SUM(language_type = '') AS empty_lang,
       SUM(class_duration IS NULL OR class_duration < 15) AS bad_duration
  FROM `course`
UNION ALL
SELECT 'course_schedule', COUNT(*), SUM(language_type = ''),
       SUM(class_duration IS NULL OR class_duration < 15)
  FROM `course_schedule`;
