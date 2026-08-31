-- ============================================================
-- 创建默认租户（id = 1）
-- 用途：作为多租户迁移后存量数据的归属租户
-- 数据库：lesson_appointment
-- ============================================================

USE lesson_appointment;

-- ------------------------------------------------------------
-- 0. 执行前检查：确认 id=1 尚未占用、编码未被使用
-- ------------------------------------------------------------
SELECT id, tenant_code, org_name, status, deleted
FROM `sys_tenant`
WHERE `id` = 1 OR `tenant_code` = 'DEFAULT';

-- ------------------------------------------------------------
-- 1. 插入默认租户（id 显式指定为 1）
--    使用 ON DUPLICATE KEY UPDATE：重复执行不会报主键/唯一键冲突，
--    只会把已存在记录刷新为下面的内容（id 保持不变）
-- ------------------------------------------------------------
INSERT INTO `sys_tenant` (
  `id`,
  `tenant_code`,
  `org_name`,
  `contact`,
  `phone`,
  `status`,
  `package_id`,
  `expire_time`,
  `offline_time`,
  `remark`, 
  `create_time`,
  `update_time`
) VALUES (
  1,
  'DEFAULT',                              -- 租户编码：登录时填写，需唯一
  '默认机构',                              -- 机构名称
  '张三',                                  -- 联系人
  '13800000000',                          -- 联系电话
  1,                                      -- 状态：1正常 2停用 3已退租
  0,                                      -- 套餐模板ID：0=未指定模板（不限额）
  DATE_ADD(NOW(), INTERVAL 1 YEAR),       -- 到期时间：一年后
  NULL,                                   -- 退租时间
  '多租户迁移后存量数据的默认归属租户',      -- 备注 
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  `tenant_code` = VALUES(`tenant_code`),
  `org_name`    = VALUES(`org_name`),
  `contact`     = VALUES(`contact`),
  `phone`       = VALUES(`phone`),
  `status`      = VALUES(`status`),
  `package_id`  = VALUES(`package_id`),
  `expire_time` = VALUES(`expire_time`),
  `remark`      = VALUES(`remark`),

  `update_time` = NOW();
-- // `deleted`     = VALUES(`deleted`),
-- ------------------------------------------------------------
-- 2. 执行后验证
-- ------------------------------------------------------------
SELECT id, tenant_code, org_name, contact, phone, status,
       package_id, expire_time, deleted
FROM `sys_tenant`
WHERE `id` = 1;

-- 预期：返回 1 行，tenant_code='DEFAULT'、status=1、deleted=0

-- ============================================================
-- 3.【可选】把存量数据归属到该租户
--    若库中仍有 tenant_id = 0 的历史数据（多租户迁移前创建），
--    且确认这些数据都属于本租户，可执行下面这批语句。
--    ★ 执行前请务必备份：
--      mysqldump -u root -p lesson_appointment > backup-before-tenant-mapping.sql
--    ★ 注意：业务表数据本身不含租户线索，代码无法自动判断归属，
--      只有确认「全部存量数据都归这一个租户」时才可执行。
-- ============================================================
-- UPDATE `user`                      SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `course_template`           SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `course`                    SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `course_schedule`           SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `booking`                   SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `appointment`               SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `course_evaluation`         SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `course_feedback`           SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `course_check_in`           SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `teacher_professional`      SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `teacher_certificate`       SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `teacher_available_time`    SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `teacher_published_profile` SET `tenant_id` = 1 WHERE `tenant_id` = 0;
-- UPDATE `audit_log`                 SET `tenant_id` = 1 WHERE `tenant_id` = 0;
--
-- ⚠ 不要更新平台管理员账号：platform_admin 的 tenant_id 应保持 0
--    UPDATE `user` SET `tenant_id` = 1 WHERE `tenant_id` = 0 AND `role` <> 'platform_admin';
--    （如需保留平台管理员，请用上面这条替代第 3 节的第一行）

-- ------------------------------------------------------------
-- 4. 存量数据核对（执行第 3 节前后各跑一次对比）
-- ------------------------------------------------------------
-- SELECT 'user' t, COUNT(*) FROM `user` WHERE tenant_id = 0
-- UNION ALL SELECT 'course', COUNT(*) FROM course WHERE tenant_id = 0
-- UNION ALL SELECT 'course_template', COUNT(*) FROM course_template WHERE tenant_id = 0
-- UNION ALL SELECT 'course_schedule', COUNT(*) FROM course_schedule WHERE tenant_id = 0
-- UNION ALL SELECT 'booking', COUNT(*) FROM booking WHERE tenant_id = 0
-- UNION ALL SELECT 'appointment', COUNT(*) FROM appointment WHERE tenant_id = 0
-- UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log WHERE tenant_id = 0;
