-- 课程 / 排期新增「教学语言」「课时长度」（2026-10-25）
--
-- 背景：
--   course_template 早就有 language_type / class_duration，但这两个属性只活在模板上：
--   · course 表没有 → 课程页面显示不出语言/时长，只能左连模板现查；
--   · course_schedule 表没有 → 排期冲突检查只能**硬编码每节课 1 小时**
--     （CourseScheduleService.checkScheduleOwnerConflict 里 plusHours(1)），
--     一门 90 分钟的课与 20:00 的课在系统眼里"不冲突"。
--
-- 本次把两个属性下沉成 course / course_schedule 的持久化列：
--   创建课程时从模板导入 → 创建排期时从课程带入 → 排期上可单独覆盖。
--   覆盖后冲突检查按各自 class_duration 判断重叠，不再猜 1 小时。
--
-- 为什么要 DEFAULT：
--   存量数据必须先回填，否则新增列 NOT NULL 无默认值会直接让下一步的 UPDATE 无从落地；
--   DEFAULT '60' 同时兼作兜底，避免历史路径（手写 SQL、老版前端）插入时撞 NOT NULL。
--
-- 幂等：重复执行会报 "Duplicate column name"，属预期；执行前请确认列不存在。

ALTER TABLE `course`
  ADD COLUMN `language_type` varchar(20) NOT NULL DEFAULT '' COMMENT '教学语言（创建课程时从模板导入，可在排期上覆盖）' AFTER `template_id`,
  ADD COLUMN `class_duration` int NOT NULL DEFAULT '60' COMMENT '课时长度（分钟，创建课程时从模板导入）' AFTER `language_type`;

ALTER TABLE `course_schedule`
  ADD COLUMN `language_type` varchar(20) NOT NULL DEFAULT '' COMMENT '教学语言（默认取自课程，可在本条排期覆盖）' AFTER `course_id`,
  ADD COLUMN `class_duration` int NOT NULL DEFAULT '60' COMMENT '课时长度（分钟，默认取自课程，可在本条排期覆盖）' AFTER `language_type`;

-- 存量回填：课程从模板取，排期从课程取。
-- 顺序不能颠倒——排期读的是回填后的 course 列。
UPDATE `course` c
  JOIN `course_template` t ON c.`template_id` = t.`template_id`
   SET c.`language_type`  = t.`language_type`,
       c.`class_duration` = t.`class_duration`;

UPDATE `course_schedule` s
  JOIN `course` c ON s.`course_id` = c.`course_id`
   SET s.`language_type`  = c.`language_type`,
       s.`class_duration` = c.`class_duration`;

-- 回填自检：两列都不该有 '' 或 < 15 的残留（course_template.class_duration 约束是 ≥15 的倍数）
SELECT 'course' AS tbl, COUNT(*) AS total,
       SUM(language_type = '') AS empty_lang,
       SUM(class_duration IS NULL OR class_duration < 15) AS bad_duration
  FROM `course`
UNION ALL
SELECT 'course_schedule', COUNT(*),
       SUM(language_type = ''),
       SUM(class_duration IS NULL OR class_duration < 15)
  FROM `course_schedule`;
