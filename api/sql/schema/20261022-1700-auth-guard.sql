-- 登录风控三表（P0/P0.5，2026-10-22）
-- 关联方案：《技术方案-小程序登录人机识别.md》《技术方案-两端登录防刷统筹.md》
--
-- 三张表全部登记在 MyBatisPlusConfig.IGNORE_TABLES（缺一即炸）：
--   · 登录端点免登录，请求进来时 TenantContext 为空，租户插件会兜底拼 tenant_id = -1；
--   · 三表结构本身也没有 tenant_id 列（登录前的行为不属于任何租户）；
-- 若不排除，插件拼出的 `tenant_id = ?` 会直接撞 Unknown column，且**只在免登录路径复现**
-- （本地带 token 测全绿、线上首登 500，报错信息完全不像权限问题）。
--
-- 生命周期与清理：
--   · auth_rate_counter：窗口计数，行按 (dim, dim_key, window_start) 唯一；超过 24h 的窗口可扫删，
--     不清也只占索引空间（每维每窗口一行）。
--   · auth_challenge：挑战票据，2 分钟过期，一次性消费（used=1），过期行可扫删。
--   · auth_device：设备档案，长期保留（"该设备出现过几个身份"是跨时间累积信号，不能删）。

CREATE TABLE `auth_rate_counter` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `dim` varchar(16) NOT NULL COMMENT '维度：ip / account / device / openid / global',
  `dim_key` varchar(128) NOT NULL COMMENT '维度值（IP 明文、账号与设备走 HMAC，不存明文）',
  `window_start` datetime NOT NULL COMMENT '窗口起点（按 window 分钟数向下取整）',
  `cnt` int NOT NULL DEFAULT '0' COMMENT '本窗口内累计次数',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dim_window` (`dim`,`dim_key`,`window_start`),
  KEY `idx_window` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录风控·频率窗口计数';

CREATE TABLE `auth_challenge` (
  `id` varchar(40) NOT NULL COMMENT 'challengeId（UUID 去横线，服务端下发）',
  `subject` varchar(128) NOT NULL COMMENT '绑定主体：Web 用 account 的 HMAC，小程序用 openid',
  `scene` varchar(32) NOT NULL COMMENT '场景：login / register / bind',
  `target_x` int NOT NULL COMMENT '缺口横坐标（只存服务端，绝不下发前端）',
  `target_y` int NOT NULL COMMENT '缺口纵坐标',
  `used` tinyint NOT NULL DEFAULT '0' COMMENT '是否已消费：0=未用 1=已用（一次性）',
  `fail_count` int NOT NULL DEFAULT '0' COMMENT '失败次数，达上限即作废',
  `expire_at` datetime NOT NULL COMMENT '过期时间（出题 + 2 分钟）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subject_scene` (`subject`,`scene`),
  KEY `idx_expire` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录风控·人机挑战票据';

CREATE TABLE `auth_device` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `device_id` varchar(64) NOT NULL COMMENT '设备标识（端上派生上报，可被重置，只作降权信号）',
  `first_subject` varchar(128) NOT NULL DEFAULT '' COMMENT '该设备首次出现的身份（HMAC/openid）',
  `identity_cnt` int NOT NULL DEFAULT '0' COMMENT '该设备累计出现过的不同身份数（真机农场核心指标）',
  `last_ip` varchar(64) DEFAULT NULL COMMENT '最近一次来源 IP',
  `emu_flag` tinyint NOT NULL DEFAULT '0' COMMENT '环境异常标记：1=模拟器/root/hook/调试',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录风控·设备档案';
