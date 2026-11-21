-- 微信 openid 与用户 ID 关联表（一期：微信登录闭环）
--
-- 设计要点：
--   1) user 表零改动：微信关联信息全部落本表，不再走「ALTER TABLE user 加 wx_openid 列」的老路
--      （老方案已于 2026-09-20 屏蔽，见 authController / UserService 的块注释）。
--   2) 本表有 tenant_id 列，但语义是「冗余，便于按租户统计」—— 隔离必须显式跳过：
--      一个微信全局只绑定一个账号，跨租户统一；若走租户插件，平台管理员视角会查不到绑定而静默失败。
--      跳过方式：WxUseridMapper 加 @InterceptorIgnore(tenantLine = "true")。
--   3) uk_wx_openid 全局唯一：一个微信最多关联一个账号，同时兜住并发重复注册。

CREATE TABLE IF NOT EXISTS `wx_userid` (
  `id`          bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `wx_openid`   varchar(64)  NOT NULL COMMENT '微信 openid（全局唯一，不随租户隔离）',
  `user_id`     varchar(36)  NOT NULL COMMENT '关联的系统用户 user.user_id',
  `tenant_id`   bigint       NOT NULL COMMENT '用户所属租户（冗余，便于按租户统计）',
  `bind_source` varchar(20)  NOT NULL DEFAULT 'manual' COMMENT '关联来源：manual=已有账号绑定 / auto_register=微信直接注册',
  `create_time` datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wx_openid` (`wx_openid`) COMMENT '一个微信最多关联一个账号',
  KEY `idx_user_id` (`user_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信 openid 与用户 ID 关联表';
