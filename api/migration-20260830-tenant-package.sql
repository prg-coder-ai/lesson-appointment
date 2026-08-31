-- ============================================================================
-- migration-20260830-tenant-package.sql
-- SaaS 多租户迁移：租户套餐额度表
-- 每个租户一条额度记录（uk_tenant_id 唯一），各资源限额 + 当前数量，
-- 供注册课程/排期/用户/教师/学生/教师信息发布时做额度校验。
-- 命名对齐 sys_tenant（sys_ 前缀），字段用 snake_case（MyBatis-Plus 默认映射）。
-- ============================================================================

USE lesson_appointment;

CREATE TABLE IF NOT EXISTS `sys_tenant_package` (
  `id`                        BIGINT   NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`                 BIGINT   NOT NULL                COMMENT '租户ID（唯一，对应sys_tenant.id）',

  -- 课程额度
  `course_limit`              INT      NOT NULL DEFAULT 0      COMMENT '课程数量限额（0=不限）',
  `course_current`            INT      NOT NULL DEFAULT 0      COMMENT '课程当前数量',

  -- 排期额度
  `schedule_limit`            INT      NOT NULL DEFAULT 0      COMMENT '课程排期数量限额（0=不限）',
  `schedule_current`          INT      NOT NULL DEFAULT 0      COMMENT '排期当前数量',

  -- 注册用户总额度
  `user_total_limit`          INT      NOT NULL DEFAULT 0      COMMENT '注册用户总数限额（0=不限）',
  `user_current`              INT      NOT NULL DEFAULT 0      COMMENT '注册用户当前数量',

  -- 教师额度
  `teacher_limit`             INT      NOT NULL DEFAULT 0      COMMENT '注册教师数量限额（0=不限）',
  `teacher_current`           INT      NOT NULL DEFAULT 0      COMMENT '注册教师当前数量',

  -- 学生额度
  `student_limit`             INT      NOT NULL DEFAULT 0      COMMENT '注册学生数量限额（0=不限）',
  `student_current`           INT      NOT NULL DEFAULT 0      COMMENT '注册学生当前数量',

  -- 教师信息发布额度
  `teacher_publish_limit`     INT      NOT NULL DEFAULT 0      COMMENT '教师信息发布数量限额（0=不限）',
  `teacher_publish_current`   INT      NOT NULL DEFAULT 0      COMMENT '教师信息发布当前数量',

  `actived_time`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '额度生效时间',
  `expired_time`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '额度结束时间',

  `create_time`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户套餐额度表';

-- ----------------------------------------------------------------------------
-- 初始化：为已有租户生成默认额度记录（示例：租户1，限额可按实际套餐调整）
-- ----------------------------------------------------------------------------
-- INSERT INTO `sys_tenant_package`
--   (`tenant_id`, `course_limit`, `schedule_limit`, `user_total_limit`,
--    `teacher_limit`, `student_limit`, `teacher_publish_limit`)
-- SELECT `id`, 100, 500, 1000, 50, 950, 50
-- FROM `sys_tenant` WHERE `id` NOT IN (SELECT `tenant_id` FROM `sys_tenant_package`);

-- ----------------------------------------------------------------------------
-- 常用额度增减语句（业务代码中并发场景建议改用带条件的原子更新，见 Service 注释）
-- ----------------------------------------------------------------------------
-- ALTER 常用：调额 + 有效期 ---时间控制---时区判断---
-- UPDATE `sys_tenant_package` SET course_limit = 200 WHERE tenant_id = 1;
-- 占用 +1（先校验未超额）
-- UPDATE `sys_tenant_package` SET course_current = course_current + 1
--   WHERE tenant_id = 1 AND (course_limit = 0 OR course_current < course_limit);
