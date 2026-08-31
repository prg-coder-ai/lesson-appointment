-- 租户信息表字段说明 
-- SOURCE H:/2026/lesson-appointment/api/migration-20260830-saas.sql;

DROP TABLE IF EXISTS `sys_tenant`;

CREATE TABLE IF NOT EXISTS `sys_tenant` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '自增主键',
  `tenant_code`        VARCHAR(56)  NOT NULL                 COMMENT '唯一标识（UUID）',
  `org_name`       VARCHAR(255)  DEFAULT NULL             COMMENT '机构名称',
  `contact`     VARCHAR(255) DEFAULT NULL             COMMENT '联系人',
  `phone`         VARCHAR(255)  DEFAULT NULL             COMMENT '电话号码',
  `package_id`    BIGINT  DEFAULT 0             COMMENT '包id',
  `status`       INT          DEFAULT NULL             COMMENT '租户状态',
  `expire_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '过期时间',
  `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`tenant_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户信息表';


ALTER TABLE `sys_tenant`
  drop COLUMN `status`;   
ALTER TABLE `sys_tenant`
  ADD COLUMN `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1正常 2停用 3已退租 4已过期' AFTER `phone`,
  ADD COLUMN `offline_time`  DATETIME     DEFAULT NULL COMMENT '退租/停用时间' AFTER `expire_time`,
  ADD COLUMN `remark`        VARCHAR(500) DEFAULT NULL COMMENT '备注' AFTER `offline_time`,
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_create_time` (`create_time`);

--@TableName("sys_tenant")
--public class Tenant {
 --   @TableId(type = IdType.AUTO)
 --   private Long id;
 --   private String tenantCode;
 --   private String orgName;
 --   private String contact;
 --   private String phone;
--    private Integer status;
 --   private Long packageId;
 --   private LocalDateTime expireTime;
 --   private LocalDateTime createTime;
 --   private LocalDateTime updateTime;
--}

//添
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
