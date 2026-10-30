-- =============================================================
-- 授课语言（work_language）与「课程/咨询类型」（language_type）语义分离
-- 2026-10-25
-- -------------------------------------------------------------
-- 背景：language_type 这个字段一直承担的是 **classType 的 code**
--       （教育行业 english=英语课；法律行业 english 经 sys_term 显示成「劳动」；
--        心理行业 english 显示「情感」；健身行业 english 显示「力量训练」）。
--       它回答的是「这是哪一类课程/咨询」，不是「用哪种语言上课」。
--       把它当「教学语言」用，会在非语言行业里直接失去意义（法律租户的
--       授课语言不可能叫「劳动」）。
--
-- 本次改动（用户拍板：新增专列 / 存量不迁移 / 六项内置＋租户可自定义）：
--   1. course_template / course / course_schedule 各加 work_language 列，
--      专表「授课语言」（英语/法语/汉语/德语/西班牙语/土耳其语…）；
--   2. 新建 sys_work_language 枚举表，tenant_id=0 为平台内置六项，
--      租户可在自己的 tenant_id 下追加自定义项；
--   3. language_type 语义**不变**（仍是 classType 的 code），
--      course_template 唯一键 uk_tenant_lang_level 因此不受影响；
--   4. 存量数据不迁移：老记录的 work_language 一律留空串，
--      前端按「跟随课程 → 未指定」处理，只有新数据才会填。
--
-- 为什么唯一键不能跟着 work_language 走：同一租户下所有模板的授课语言
-- 高度重复（比如都用法语授课），(tenant_id, work_language, difficulty_level)
-- 会让「同难度的第二个模板」直接撞唯一键。要区分授课语言的差异，
-- 请在下沉到 course / course_schedule 时覆盖，而不是复制模板。
-- =============================================================

USE `lesson_appointment`;

-- ------------------------------------------------------------
-- 1. 三张业务表加授课语言列
-- ------------------------------------------------------------
ALTER TABLE `course_template`
  ADD COLUMN `work_language` varchar(20) NOT NULL DEFAULT ''
  COMMENT '授课语言（用哪种语言上课；代码取自 sys_work_language.lang_code；空=未指定）'
  AFTER `language_type`;

ALTER TABLE `course`
  ADD COLUMN `work_language` varchar(20) NOT NULL DEFAULT ''
  COMMENT '授课语言（创建课程时从模板继承；空=未指定）'
  AFTER `language_type`;

ALTER TABLE `course_schedule`
  ADD COLUMN `work_language` varchar(20) NOT NULL DEFAULT ''
  COMMENT '授课语言（默认取自课程，可在本条排期覆盖；空=跟随课程）'
  AFTER `language_type`;

-- ------------------------------------------------------------
-- 2. 授课语言枚举表
--    作用域语义与 sys_term 一致：tenant_id=0 平台内置，>0 租户自定义。
--    该表已登记进 MyBatisPlusConfig.IGNORE_TABLES —— 租户端必须能读到
--    tenant_id=0 的内置项，走租户插件会被拼上 tenant_id=? 而查空。
--    因此所有读写 SQL 都必须显式带 tenant_id 条件。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sys_work_language` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '作用域：0=平台内置项，>0=租户自定义项',
  `lang_code` varchar(20) NOT NULL COMMENT '授课语言代码（小写，如 english/french/chinese/german/spanish/turkish）',
  `name_zh` varchar(64) NOT NULL COMMENT '中文显示名',
  `name_en` varchar(64) NOT NULL DEFAULT '' COMMENT '英文显示名',
  `name_fr` varchar(64) NOT NULL DEFAULT '' COMMENT '法文显示名',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '同级排序（小者在前）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`tenant_id`,`lang_code`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='授课语言枚举（work_language）：平台内置项 tenant_id=0，租户可追加自定义项';

-- ------------------------------------------------------------
-- 3. 平台内置六项（幂等：重复执行不会产生重复行）
-- ------------------------------------------------------------
INSERT INTO `sys_work_language` (`tenant_id`, `lang_code`, `name_zh`, `name_en`, `name_fr`, `sort_order`) VALUES
  (0, 'english',  '英语',     'English',  'Anglais',  10),
  (0, 'french',   '法语',     'French',   'Français', 20),
  (0, 'chinese',  '汉语',     'Chinese',  'Chinois',  30),
  (0, 'german',   '德语',     'German',   'Allemand', 40),
  (0, 'spanish',  '西班牙语', 'Spanish',  'Espagnol', 50),
  (0, 'turkish',  '土耳其语', 'Turkish',  'Turc',     60)
ON DUPLICATE KEY UPDATE
  `name_zh` = VALUES(`name_zh`),
  `name_en` = VALUES(`name_en`),
  `name_fr` = VALUES(`name_fr`);

-- ------------------------------------------------------------
-- 4. 核对：三表新列就位、枚举项齐全、存量列值为空串（不迁移）
-- ------------------------------------------------------------
SELECT '=== 新列就位 ===' AS step;
SELECT table_name, column_name, column_type, column_default
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND column_name = 'work_language'
   AND table_name IN ('course_template', 'course', 'course_schedule')
 ORDER BY table_name;

SELECT '=== 授课语言枚举 ===' AS step;
SELECT tenant_id, lang_code, name_zh, name_en, name_fr, sort_order
  FROM sys_work_language ORDER BY tenant_id, sort_order;

SELECT '=== 存量值（应全为 0 行，确认未迁移）===' AS step;
SELECT 'course_template' AS tbl, COUNT(*) AS with_work_language FROM course_template WHERE work_language <> ''
UNION ALL SELECT 'course',          COUNT(*) FROM course          WHERE work_language <> ''
UNION ALL SELECT 'course_schedule', COUNT(*) FROM course_schedule WHERE work_language <> '';
