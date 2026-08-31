-- ============================================================================
-- migration-20260830-tenant-id.sql
-- SaaS 多租户迁移：为所有租户业务表添加 tenant_id 字段
-- 执行前请备份数据库：mysqldump -u root -p lesson_appointment > backup-tenant-id.sql
-- 幂等性说明：MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，重复执行会报字段已存在，
--            报错可忽略（或用存储过程判断，见文件末尾附注）。
-- 命名约定：与 sys_tenant.id (BIGINT AUTO_INCREMENT) 对应；
--            tenant_id = 0 表示平台级/历史单租户数据（TenantInterceptor 对 0 跳过租户校验）
-- ============================================================================

USE lesson_appointment;

-- ----------------------------------------------------------------------------
-- 1. user 用户表（核心：用户与租户的归属关系）
-- ----------------------------------------------------------------------------
ALTER TABLE `user`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `user_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- 平台管理员与租户管理员角色说明（配合 notes.txt saas 角色设计）：
-- role 值域扩展：platform_admin / platform_maintain / platform_finance（tenant_id=0）
--               admin / maintainer / statistician / teacher / student（tenant_id>0）

-- ----------------------------------------------------------------------------
-- 2. course_template 课程模板表
--    注意：uk_lang_level 唯一键需并入 tenant_id，否则租户间模板互相冲突
-- ----------------------------------------------------------------------------
ALTER TABLE `course_template`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `template_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

ALTER TABLE `course_template`
  DROP INDEX `uk_lang_level`,
  ADD UNIQUE KEY `uk_tenant_lang_level` (`tenant_id`, `language_type`, `difficulty_level`);

-- ----------------------------------------------------------------------------
-- 3. course 教师课程表
-- ----------------------------------------------------------------------------
ALTER TABLE `course`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `course_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 4. course_schedule 课程排期表
-- ----------------------------------------------------------------------------
ALTER TABLE `course_schedule`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `schedule_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 5. booking 预约表
-- ----------------------------------------------------------------------------
ALTER TABLE `booking`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `booking_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 6. appointment 预约课单时间表
-- ----------------------------------------------------------------------------
ALTER TABLE `appointment`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `booking_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 7. course_evaluation 课程评价表
-- ----------------------------------------------------------------------------
ALTER TABLE `course_evaluation`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `evaluation_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 8. course_feedback 课程反馈表
-- ----------------------------------------------------------------------------
ALTER TABLE `course_feedback`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `feedback_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 9. course_check_in 课程签到表
-- ----------------------------------------------------------------------------
ALTER TABLE `course_check_in`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `check_in_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 10. teacher_professional 教师职业信息表
-- ----------------------------------------------------------------------------
ALTER TABLE `teacher_professional`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `teacher_professional_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 11. teacher_certificate 教师证书表
-- ----------------------------------------------------------------------------
ALTER TABLE `teacher_certificate`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `certificate_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 12. teacher_available_time 教师可预约时间表
-- ----------------------------------------------------------------------------
ALTER TABLE `teacher_available_time`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `available_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 13. teacher_published_profile 教师发布信息表
-- ----------------------------------------------------------------------------
ALTER TABLE `teacher_published_profile`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台/历史单租户数据）' AFTER `published_profile_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ----------------------------------------------------------------------------
-- 14. audit_log 审计日志表（按租户隔离查询/统计）
-- ----------------------------------------------------------------------------
ALTER TABLE `audit_log`
  ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台操作）' AFTER `log_id`,
  ADD KEY `idx_tenant_id` (`tenant_id`);

-- ============================================================================
-- 不加 tenant_id 的表及理由：
--   sys_tenant          租户表本身
--   user_refresh_token  通过 user_id 关联 user 表间接归属租户，加列属冗余；
--                       若后续需要按租户统计在线凭证，再行添加
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 历史数据回填（可选）：将存量数据统一标记到某个租户
-- 示例：把所有历史数据划归租户 id=1
-- UPDATE `user`          SET tenant_id = 1 WHERE tenant_id = 0 AND role IN ('student','teacher','admin');
-- UPDATE `course_template` SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `course`          SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `course_schedule` SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `booking`         SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `appointment`     SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `course_evaluation` SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `course_feedback`    SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `course_check_in`    SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `teacher_professional` SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `teacher_certificate`   SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `teacher_available_time` SET tenant_id = 1 WHERE tenant_id = 0;
-- UPDATE `teacher_published_profile` SET tenant_id = 1 WHERE tenant_id = 0;

-- ----------------------------------------------------------------------------
-- 附注：幂等执行方式（可选，替代直接 ALTER）
-- DELIMITER $$
-- DROP PROCEDURE IF EXISTS add_tenant_id$$
-- CREATE PROCEDURE add_tenant_id(IN tbl VARCHAR(64), IN after_col VARCHAR(64))
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
--                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl
--                    AND COLUMN_NAME = 'tenant_id') THEN
--     SET @sql = CONCAT('ALTER TABLE `', tbl,
--                       '` ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER `', after_col,
--                       '`, ADD KEY `idx_tenant_id` (`tenant_id`)');
--     PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
--   END IF;
-- END$$
-- DELIMITER ;
-- CALL add_tenant_id('user', 'user_id');
-- CALL add_tenant_id('course_template', 'template_id');
-- ...（其余表同理）
-- DROP PROCEDURE add_tenant_id;
