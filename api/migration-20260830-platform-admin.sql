-- ============================================================
-- 平台化管理迁移脚本：platform_admin 角色 / 租户管理 / 系统监视 / 运行管理 / 运营统计
-- 数据库：lesson_appointment
-- 部署形态：单机
-- 说明：所有采样间隔、历史数据保留时间等参数由 sys_system_config 表配置，
--       在「系统配置」菜单中维护，不在代码里写死。
-- 运行：source xxx.sql
-- ============================================================

USE lesson_appointment;

-- ============================================================
-- 1. 修复 sys_tenant 表：列名由连字符改为下划线
--    原因：MyBatis-Plus 开启了 map-underscore-to-camel-case，
--          Tenant 实体的 tenantCode 会映射为 tenant_code，
--          与原表 tenant-code 对不上，租户查询必然报 Unknown column
-- ============================================================
ALTER TABLE `sys_tenant`
  CHANGE COLUMN `tenant-code`  `tenant_code`  VARCHAR(56)  NOT NULL     COMMENT '租户唯一编码（登录时填写）',
  CHANGE COLUMN `org-name`     `org_name`     VARCHAR(255) DEFAULT NULL COMMENT '机构名称',
  CHANGE COLUMN `contact  `    `contact`      VARCHAR(255) DEFAULT NULL COMMENT '联系人',
  CHANGE COLUMN `package-id`   `package_id`   BIGINT       DEFAULT 0    COMMENT '关联套餐ID（sys_tenant_package.id，0=未指定套餐即不限额）',
  CHANGE COLUMN `expire-time`  `expire_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '套餐到期时间',
  CHANGE COLUMN `create-time`  `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CHANGE COLUMN `update-time`  `update_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- 补充租户生命周期字段
ALTER TABLE `sys_tenant`
  ADD COLUMN `status`       TINYINT      NOT NULL DEFAULT 1  COMMENT '状态：1正常 2停用 3已退租' AFTER `phone`,
  ADD COLUMN `offline_time` DATETIME     DEFAULT NULL         COMMENT '退租/停用时间' AFTER `expire_time`,
  ADD COLUMN `remark`       VARCHAR(500) DEFAULT NULL         COMMENT '备注' AFTER `offline_time`,
  ADD COLUMN `deleted`      TINYINT      NOT NULL DEFAULT 0  COMMENT '软删除标记：0正常 1已删除（保留可恢复）' AFTER `remark`,
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_deleted` (`deleted`),
  ADD KEY `idx_expire_time` (`expire_time`);

-- ============================================================
-- 2. 用户会话表（在线用户统计）
--    单机部署，采用会话表方案：登录写入、登出标记、请求续期、定时任务清理
-- ============================================================
CREATE TABLE IF NOT EXISTS `sys_user_session` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `session_id`  VARCHAR(64)  NOT NULL COMMENT '会话ID（JWT签名前8位+UUID）',
  `tenant_id`   BIGINT       NOT NULL DEFAULT 0 COMMENT '租户ID（0=平台管理员）',
  `user_id`     VARCHAR(36)  NOT NULL COMMENT '用户ID',
  `user_role`   VARCHAR(20)  DEFAULT NULL COMMENT '角色：student/teacher/admin/platform_admin',
  `ip`          VARCHAR(64)  DEFAULT NULL COMMENT '登录IP',
  `user_agent`  VARCHAR(500) DEFAULT NULL COMMENT '客户端标识',
  `login_time`  DATETIME     NOT NULL COMMENT '登录时间',
  `last_active` DATETIME     NOT NULL COMMENT '最近活跃时间',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '1在线 2已登出 3已过期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session` (`session_id`),
  KEY `idx_tenant_status` (`tenant_id`, `status`),
  KEY `idx_last_active` (`last_active`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户会话表（在线统计）';

-- ============================================================
-- 3. 租户月度用量快照（运行管理：与上月的变化）
--    定时任务每月1日凌晨生成，保留12个月
-- ============================================================
CREATE TABLE IF NOT EXISTS `sys_tenant_stats_monthly` (
  `id`             BIGINT   NOT NULL AUTO_INCREMENT,
  `tenant_id`      BIGINT   NOT NULL COMMENT '租户ID',
  `stat_month`     CHAR(7)  NOT NULL COMMENT '统计月份（yyyy-MM）',
  `teacher_count`  INT      NOT NULL DEFAULT 0 COMMENT '教师数（status=active）',
  `student_count`  INT      NOT NULL DEFAULT 0 COMMENT '学生数（status=active）',
  `course_count`   INT      NOT NULL DEFAULT 0 COMMENT '课程数',
  `schedule_count` INT      NOT NULL DEFAULT 0 COMMENT '排期数',
  `booking_count`  INT      NOT NULL DEFAULT 0 COMMENT '预约数',
  `create_time`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_month` (`tenant_id`, `stat_month`),
  KEY `idx_month` (`stat_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户月度用量快照';

-- ============================================================
-- 4. 系统指标采样表（系统监视：历史趋势）
--    明细保留天数、采样间隔由 sys_system_config 控制
-- ============================================================
CREATE TABLE IF NOT EXISTS `sys_metric_sample` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `sample_time`     DATETIME      NOT NULL COMMENT '采样时间',
  `cpu_system`      DECIMAL(5,2)  DEFAULT NULL COMMENT '系统CPU使用率(%)',
  `cpu_process`     DECIMAL(5,2)  DEFAULT NULL COMMENT '当前进程CPU使用率(%)',
  `mem_total`       BIGINT        DEFAULT NULL COMMENT '物理内存总量(字节)',
  `mem_used`        BIGINT        DEFAULT NULL COMMENT '物理内存已用(字节)',
  `jvm_heap_used`   BIGINT        DEFAULT NULL COMMENT 'JVM堆已用(字节)',
  `jvm_heap_max`    BIGINT        DEFAULT NULL COMMENT 'JVM堆上限(字节)',
  `disk_total`      BIGINT        DEFAULT NULL COMMENT '磁盘总量(字节)',
  `disk_used`       BIGINT        DEFAULT NULL COMMENT '磁盘已用(字节)',
  `thread_count`    INT           DEFAULT NULL COMMENT 'JVM线程数',
  `gc_count`        BIGINT        DEFAULT NULL COMMENT 'GC累计次数',
  `gc_time_ms`      BIGINT        DEFAULT NULL COMMENT 'GC累计耗时(毫秒)',
  `net_out_bytes`   BIGINT        DEFAULT NULL COMMENT '采样周期内应用出口字节数',
  `online_users`    INT           DEFAULT NULL COMMENT '在线用户数',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sample_time` (`sample_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统指标采样明细';

-- 小时聚合表（长期留存，聚合自 sys_metric_sample）
CREATE TABLE IF NOT EXISTS `sys_metric_hourly` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `hour_time`       DATETIME      NOT NULL COMMENT '整点时间',
  `cpu_system_avg`  DECIMAL(5,2)  DEFAULT NULL,
  `cpu_system_max`  DECIMAL(5,2)  DEFAULT NULL,
  `cpu_process_avg` DECIMAL(5,2)  DEFAULT NULL,
  `mem_used_avg`    BIGINT        DEFAULT NULL,
  `jvm_heap_avg`    BIGINT        DEFAULT NULL,
  `jvm_heap_max`    BIGINT        DEFAULT NULL,
  `disk_used_max`   BIGINT        DEFAULT NULL,
  `thread_avg`      INT           DEFAULT NULL,
  `online_max`      INT           DEFAULT NULL COMMENT '该小时在线峰值',
  `sample_count`    INT           NOT NULL DEFAULT 0 COMMENT '聚合样本数',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hour` (`hour_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统指标小时聚合';

-- ============================================================
-- 5. 系统配置表（系统配置菜单的后台数据源） 
--     另见migration-2026083-sys-system-config.sql
--    采样间隔、历史数据保留时间、在线判定阈值、预警阈值等均在此维护
-- ============================================================ 
-- ============================================================
-- 6. 用户表补充最后活跃时间（会话表之外的冗余，便于快速判断活跃度）
-- ============================================================
ALTER TABLE `user`
  ADD COLUMN `last_active_time` DATETIME DEFAULT NULL COMMENT '最近活跃时间' AFTER `status`,
  ADD KEY `idx_tenant_active` (`tenant_id`, `last_active_time`);

-- ============================================================
-- 7. 平台管理员账号示例（按需执行，密码需自行加密后替换）
--    role = platform_admin，tenant_id = 0
-- ============================================================
-- INSERT INTO `user` (`user_id`, `account`, `password`, `role`, `status`, `tenant_id`, `name`)
-- VALUES (UUID(), 'platform', '{BCrypt加密后的密码}', 'platform_admin', 'active', 0, '平台管理员');

-- ============================================================
-- 8. 套餐模板表（新增）
--    数据模型分三层：
--      ① sys_package_template    套餐模板（规格定义，如免费版/标准版/旗舰版），只定义限额
--      ② sys_tenant.package_id   租户选用的「套餐模板ID」，指向 ① 的一条记录
--      ③ sys_tenant_package      某个租户自己的套餐，一租户一条（tenant_id 唯一且必填），
--                                限额从模板套用，当前数量由业务增/删时实时增减
--    ★ tenant_id 是 sys_tenant_package 的必要字段，保持 NOT NULL + UNIQUE，不做任何放开
-- ============================================================
CREATE TABLE IF NOT EXISTS `sys_package_template` (
  `id`                    BIGINT       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `template_name`         VARCHAR(100) NOT NULL                COMMENT '套餐模板名称',
  `template_code`         VARCHAR(50)  DEFAULT NULL            COMMENT '套餐模板编码（选填，便于接口引用）',
  `course_limit`          INT          NOT NULL DEFAULT 0      COMMENT '课程数量限额（0=不限）',
  `schedule_limit`        INT          NOT NULL DEFAULT 0      COMMENT '排期数量限额（0=不限）',
  `user_total_limit`      INT          NOT NULL DEFAULT 0      COMMENT '注册用户总数限额（0=不限）',
  `teacher_limit`         INT          NOT NULL DEFAULT 0      COMMENT '教师数量限额（0=不限）',
  `student_limit`         INT          NOT NULL DEFAULT 0      COMMENT '学生数量限额（0=不限）',
  `teacher_publish_limit` INT          NOT NULL DEFAULT 0      COMMENT '教师信息发布限额（0=不限）',
  `status`                TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1启用 2停用',
  `remark`                VARCHAR(500) DEFAULT NULL            COMMENT '备注',
  `create_time`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_code` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐模板表（规格定义）';

-- ---------- 默认套餐模板 ----------
INSERT INTO `sys_package_template`
  (`template_name`, `template_code`, `course_limit`, `schedule_limit`, `user_total_limit`,
   `teacher_limit`, `student_limit`, `teacher_publish_limit`, `status`, `remark`)
VALUES
  ('免费版', 'free',    20,   100,   50,   5,   50,   5,  1, '体验用，各资源额度较低'),
  ('标准版', 'standard', 200,  1000,  500,  50,  500,  50, 1, '中小机构常用'),
  ('旗舰版', 'flagship', 0,    0,     0,    0,   0,    0,  1, '全部不限量（0=不限）');

-- ============================================================
-- 9. 明确 sys_tenant.package_id 的指向为「套餐模板ID」
--    （字段已存在，仅修正注释，不改变结构）
-- ============================================================
ALTER TABLE `sys_tenant`
  MODIFY COLUMN `package_id` BIGINT DEFAULT 0 COMMENT '套餐模板ID（sys_package_template.id，0=未指定模板）';

-- ------------------------------------------------------------
-- 【仅在误执行过旧版脚本时需要】
-- 旧版脚本曾误把 sys_tenant_package 当作「多租户共用的规格表」，
-- 执行过 DROP INDEX uk_tenant_id / MODIFY tenant_id NULL。
-- 若已执行，请用下面两条恢复（未执行过则忽略）：
--
--   UPDATE `sys_tenant_package` SET `tenant_id` = 0 WHERE `tenant_id` IS NULL;
--   ALTER TABLE `sys_tenant_package`
--     MODIFY COLUMN `tenant_id` BIGINT NOT NULL COMMENT '租户ID（对应sys_tenant.id）';
--   ALTER TABLE `sys_tenant_package` ADD UNIQUE KEY `uk_tenant_id` (`tenant_id`);
-- ------------------------------------------------------------
