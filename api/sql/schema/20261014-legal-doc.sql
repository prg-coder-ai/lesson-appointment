-- 协议与隐私政策（合规）表结构
-- 关联设计文档：《协议与隐私政策设计文档.md》
-- 两张表均为平台级共享数据，无租户插件自动拦截（已在 MyBatisPlusConfig.IGNORE_TABLES 登记）：
--   · sys_legal_doc 虽含 tenant_id 列，但语义是「作用域维度」（0=平台级，>0=租户覆盖级），
--     隔离由业务层显式按 doc_type+tenant_id+language 控制，不能走租户插件。
--   · sys_legal_accept 同理。
-- 读取解析（复用 sys_term 三级优先级）：租户级(tenant_id=N) → 平台级(tenant_id=0)，同级取最大启用版本。

CREATE TABLE `sys_legal_doc` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `doc_type` varchar(32) NOT NULL COMMENT '文档类型：user_agreement / privacy_policy',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '作用域：0=平台级；>0=租户覆盖级',
  `industry_id` bigint NOT NULL DEFAULT '0' COMMENT '行业id（预留行业级微调，暂默认 0）',
  `language` varchar(16) NOT NULL DEFAULT 'zh' COMMENT '语言代码：zh/en/fr，默认 zh',
  `title` varchar(255) DEFAULT NULL COMMENT '文档标题',
  `content` longtext COMMENT '正文（HTML 或 Markdown，前端渲染）',
  `version` int NOT NULL DEFAULT '1' COMMENT '版本号（每次保存 +1，从 1 起）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1=启用 0=停用（停用回退上级）',
  `effective_time` datetime DEFAULT NULL COMMENT '生效时间',
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc` (`doc_type`,`tenant_id`,`industry_id`,`language`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='法律文档（协议/隐私政策）';

CREATE TABLE `sys_legal_accept` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `subject_type` tinyint NOT NULL COMMENT '签署主体类型：1=租户(场景A) 2=用户(场景B)',
  `subject_id` bigint NOT NULL COMMENT '签署主体id：租户id 或 用户id',
  `doc_type` varchar(32) NOT NULL COMMENT '文档类型：user_agreement / privacy_policy',
  `version` int NOT NULL COMMENT '签署时所读版本（留痕关键）',
  `accept_time` datetime DEFAULT NULL COMMENT '签署时间',
  `channel` varchar(16) DEFAULT NULL COMMENT '签署渠道：web / miniprogram',
  `ip` varchar(64) DEFAULT NULL COMMENT '来源 IP（审计）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subject_doc` (`subject_type`,`subject_id`,`doc_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='协议/政策签署留痕';
