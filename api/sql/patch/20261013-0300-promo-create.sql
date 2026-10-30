-- 二期：推广体系建表 + sys_tenant 加列 + 配置项
--
-- 关键修订（相对原方案 20261012）：
--   B1 租户插件：这三张表都没有 tenant_id 列，必须登记进 MyBatisPlusConfig.IGNORE_TABLES，
--                否则插件拼出 `tenant_id = ?` → Unknown column 全线报错。
--   B2 配置表名：是 sys_system_config，不是 sys_config。
--   决策3 点击记录：promo_conversion 不记 clicked，stage 从 registered 起；
--                invitee_user_id 改为 NOT NULL，让 uk_conversion_invitee 的去重真正生效
--                （可空列在 MySQL 唯一键里允许多个 NULL，去重会失效）。
--   新增 uk_promoter_scope：同推广者+同路径+同目标租户只允许一个码，消除按 inviter 归因时的歧义。

CREATE TABLE IF NOT EXISTS `promo_referral` (
  `id`                 bigint       NOT NULL AUTO_INCREMENT,
  `referral_code`      varchar(32)  NOT NULL COMMENT '推广码（全局唯一）',
  `promoter_user_id`   varchar(36)  NOT NULL COMMENT '推广者 user_id',
  `promoter_tenant_id` bigint       NOT NULL COMMENT '推广者所属租户',
  `target_tenant_id`   bigint       DEFAULT NULL COMMENT '路径2：指定目标租户（NULL=路径1自助建租户）',
  `path_type`          tinyint      NOT NULL COMMENT '1=自助建租户 2=指定租户注册',
  `status`             varchar(16)  NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  `expire_time`        datetime     DEFAULT NULL COMMENT 'NULL=永不过期',
  `create_time`        datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`        datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_referral_code` (`referral_code`),
  UNIQUE KEY `uk_promoter_scope` (`promoter_user_id`, `path_type`, `target_tenant_id`),
  KEY `idx_promoter` (`promoter_user_id`),
  KEY `idx_target_tenant` (`target_tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广码表';

CREATE TABLE IF NOT EXISTS `promo_conversion` (
  `id`                bigint       NOT NULL AUTO_INCREMENT,
  `referral_code`     varchar(32)  NOT NULL COMMENT '使用的推广码',
  `promoter_user_id`  varchar(36)  NOT NULL COMMENT '推广者',
  `invitee_user_id`   varchar(36)  NOT NULL COMMENT '被邀请者 user_id（注册成功后写入，非空）',
  `invitee_tenant_id` bigint       DEFAULT NULL COMMENT '被邀请者所属租户',
  `path_type`         tinyint      NOT NULL COMMENT '1=自助建租户 2=指定租户注册',
  `tenant_code`       varchar(8)   DEFAULT NULL COMMENT '路径1：新建的租户编码',
  `stage`             varchar(20)  NOT NULL DEFAULT 'registered' COMMENT 'registered/approved/paid/expired',
  `source`            varchar(32)  DEFAULT NULL COMMENT 'share/landing/qrcode/we/direct',
  `register_ip`       varchar(64)  DEFAULT NULL COMMENT '注册来源IP（防刷：单IP每时限频）',
  `register_phone_hmac` varchar(128) DEFAULT NULL COMMENT '注册手机号HMAC索引（防刷：同手机号限频；不明文存储）',
  `registered_at`     datetime     DEFAULT NULL,
  `paid_at`           datetime     DEFAULT NULL,
  `reward_status`     varchar(20)  DEFAULT NULL COMMENT 'pending/granted/failed',
  `create_time`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conversion_invitee` (`invitee_user_id`) COMMENT '一个被邀请者只归因一次',
  KEY `idx_promoter_stage` (`promoter_user_id`, `stage`),
  KEY `idx_referral_code` (`referral_code`),
  KEY `idx_registered_at` (`registered_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广转化记录表（点击仅计数，不落明细）';

CREATE TABLE IF NOT EXISTS `promo_achievement` (
  `id`                   bigint         NOT NULL AUTO_INCREMENT,
  `promoter_user_id`     varchar(36)    NOT NULL,
  `promoter_tenant_id`   bigint         NOT NULL,
  `total_clicks`         int            NOT NULL DEFAULT 0 COMMENT '总点击数',
  `total_registered`     int            NOT NULL DEFAULT 0 COMMENT '成功注册人数',
  `total_approved`       int            NOT NULL DEFAULT 0 COMMENT '审批通过人数',
  `total_paid`           int            NOT NULL DEFAULT 0 COMMENT '成功缴费人数',
  `total_tenants_created` int           NOT NULL DEFAULT 0 COMMENT '路径1：促成新建租户数',
  `total_wx_registered`  int            NOT NULL DEFAULT 0 COMMENT '微信直接注册人数',
  `total_reward_amount`  decimal(12,2)  NOT NULL DEFAULT 0.00 COMMENT '累计奖励金额',
  `last_conversion_at`   datetime       DEFAULT NULL,
  `update_time`          datetime       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_promoter` (`promoter_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广者业绩汇总';

-- sys_tenant 加列
ALTER TABLE `sys_tenant`
  ADD COLUMN `referred_by`       varchar(36)  DEFAULT NULL COMMENT '推广者 user_id' AFTER `remark`,
  ADD COLUMN `trial_status`      varchar(16)  DEFAULT NULL COMMENT 'trial/expired/converted' AFTER `referred_by`,
  ADD COLUMN `trial_expire_time` datetime     DEFAULT NULL COMMENT '试用到期时间' AFTER `trial_status`,
  ADD COLUMN `creator_account`   varchar(255) DEFAULT NULL COMMENT '创建者账号（与 tenantCode 关联校验用）' AFTER `trial_expire_time`;

-- 配置项（表名 sys_system_config；editable=1 才能在后台改）
INSERT INTO `sys_system_config`
  (`config_key`,`config_value`,`config_name`,`config_group`,`value_type`,`default_value`,`remark`,`editable`)
VALUES
('promotion.trial.days','14','免费体验天数','promotion','int','14','天',1),
('promotion.trial.user.limit','10','试用租户用户上限','promotion','int','10','人',1),
('promotion.trial.course.limit','5','试用租户课程上限','promotion','int','5','门',1),
('promotion.trial.global.limit','200','全平台试用租户上限','promotion','int','200','防刷：全局试用租户总数',1),
('promotion.register.period.limit','3','单IP每时注册上限','promotion','int','3','防刷：自助建租户频率',1),
('promotion.referral.expire.days','90','推广码默认有效期','promotion','int','90','天',1),
('promotion.reward.on.register','0','注册成功奖励金额','promotion','decimal','0','元',1),
('promotion.reward.on.paid','0','缴费成功奖励金额','promotion','decimal','0','元',1),
('tenant.code.length','8','租户编码长度','tenant','int','8','建议固定 8',1),
('tenant.code.max.retry','10','租户编码碰撞重试次数','tenant','int','10','次',1);
