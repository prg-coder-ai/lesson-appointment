-- 微信 PC 扫码登录/绑定一次性 state 表（P2：网站应用扫码登录）
--
-- 设计要点：
--   1) 生命周期 5 分钟：qr 端点生成 → 微信回调 pc-callback 置 confirmed/failed →
--      前端轮询 qr/status 取走结果并删除该行；过期行按 expire_at 判脏清理。天然防重放。
--   2) 无 tenant_id 列：扫码是平台级公开动作，与租户无关；
--      已登记 MyBatisPlusConfig.IGNORE_TABLES（否则租户插件拼 tenant_id = ? 撞 Unknown column）。
--   3) bind 场景的 user_id 由服务端从登录令牌解析后随 state 落库，不信客户端参数；
--      ip 仅审计用途，不做相等性强制（代理/NAT 下出口 IP 可能变化）。
--   4) token_json 只存 login 场景确认后的会话（一次性消费后即删行）；
--      openid/unionid 等凭证级信息不落本表、不回流前端。

CREATE TABLE `wx_login_state` (
  `id`         bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `state`      varchar(64)  NOT NULL COMMENT '一次性 state（UUID 无横线），二维码 URL 携带',
  `purpose`    varchar(16)  NOT NULL DEFAULT 'login' COMMENT 'login=扫码登录 / bind=已登录账号绑微信',
  `user_id`    varchar(36)  DEFAULT NULL COMMENT 'bind 场景发起用户（服务端从令牌解析）',
  `ip`         varchar(64)  DEFAULT NULL COMMENT '发起请求 IP（审计用）',
  `status`     varchar(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/confirmed/failed',
  `token_json` text         COMMENT 'confirmed 且 login 场景的会话 JSON（一次性消费）',
  `error_msg`  varchar(255) DEFAULT NULL COMMENT 'failed 原因（透前端展示）',
  `expire_at`  datetime     NOT NULL COMMENT '过期时间（生成 +5 分钟）',
  `create_time` datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_state` (`state`),
  KEY `idx_expire_at` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信 PC 扫码登录/绑定一次性 state';
