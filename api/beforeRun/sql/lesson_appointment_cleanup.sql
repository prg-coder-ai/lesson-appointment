-- ============================================================
-- 清理脚本: 删除 lesson_appointment 全部表的数据内容
-- 生成时间: 2026-09-02 14:40:39
-- 说明: 仅删除数据(DELETE)，保留表结构；禁用外键检查后逐表清空
--       如需同时重置自增列，可将下方 DELETE 改为 TRUNCATE TABLE
-- 执行:   mysql -uroot -p123456 lesson_appointment < lesson_appointment_cleanup.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM `appointment`;
DELETE FROM `audit_log`;
DELETE FROM `booking`;
DELETE FROM `course`;
DELETE FROM `course_check_in`;
DELETE FROM `course_evaluation`;
DELETE FROM `course_feedback`;
DELETE FROM `course_schedule`;
DELETE FROM `course_template`;
DELETE FROM `sys_industry`;
DELETE FROM `sys_metric_hourly`;
DELETE FROM `sys_metric_sample`;
DELETE FROM `sys_package_template`;
DELETE FROM `sys_system_config`;
DELETE FROM `sys_tenant`;
DELETE FROM `sys_tenant_package`;
DELETE FROM `sys_tenant_stats_monthly`;
DELETE FROM `sys_term`;
DELETE FROM `sys_user_session`;
DELETE FROM `teacher_available_time`;
DELETE FROM `teacher_certificate`;
DELETE FROM `teacher_professional`;
DELETE FROM `teacher_published_profile`;
DELETE FROM `user`;
DELETE FROM `user_refresh_token`;

SET FOREIGN_KEY_CHECKS = 1;

-- 校验: 各表剩余行数应为 0
SELECT 'appointment' AS `table`, COUNT(*) AS `rows` FROM `appointment`;
SELECT 'audit_log' AS `table`, COUNT(*) AS `rows` FROM `audit_log`;
SELECT 'booking' AS `table`, COUNT(*) AS `rows` FROM `booking`;
SELECT 'course' AS `table`, COUNT(*) AS `rows` FROM `course`;
SELECT 'course_check_in' AS `table`, COUNT(*) AS `rows` FROM `course_check_in`;
SELECT 'course_evaluation' AS `table`, COUNT(*) AS `rows` FROM `course_evaluation`;
SELECT 'course_feedback' AS `table`, COUNT(*) AS `rows` FROM `course_feedback`;
SELECT 'course_schedule' AS `table`, COUNT(*) AS `rows` FROM `course_schedule`;
SELECT 'course_template' AS `table`, COUNT(*) AS `rows` FROM `course_template`;
SELECT 'sys_industry' AS `table`, COUNT(*) AS `rows` FROM `sys_industry`;
SELECT 'sys_metric_hourly' AS `table`, COUNT(*) AS `rows` FROM `sys_metric_hourly`;
SELECT 'sys_metric_sample' AS `table`, COUNT(*) AS `rows` FROM `sys_metric_sample`;
SELECT 'sys_package_template' AS `table`, COUNT(*) AS `rows` FROM `sys_package_template`;
SELECT 'sys_system_config' AS `table`, COUNT(*) AS `rows` FROM `sys_system_config`;
SELECT 'sys_tenant' AS `table`, COUNT(*) AS `rows` FROM `sys_tenant`;
SELECT 'sys_tenant_package' AS `table`, COUNT(*) AS `rows` FROM `sys_tenant_package`;
SELECT 'sys_tenant_stats_monthly' AS `table`, COUNT(*) AS `rows` FROM `sys_tenant_stats_monthly`;
SELECT 'sys_term' AS `table`, COUNT(*) AS `rows` FROM `sys_term`;
SELECT 'sys_user_session' AS `table`, COUNT(*) AS `rows` FROM `sys_user_session`;
SELECT 'teacher_available_time' AS `table`, COUNT(*) AS `rows` FROM `teacher_available_time`;
SELECT 'teacher_certificate' AS `table`, COUNT(*) AS `rows` FROM `teacher_certificate`;
SELECT 'teacher_professional' AS `table`, COUNT(*) AS `rows` FROM `teacher_professional`;
SELECT 'teacher_published_profile' AS `table`, COUNT(*) AS `rows` FROM `teacher_published_profile`;
SELECT 'user' AS `table`, COUNT(*) AS `rows` FROM `user`;
SELECT 'user_refresh_token' AS `table`, COUNT(*) AS `rows` FROM `user_refresh_token`;