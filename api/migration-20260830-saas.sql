-- 审计日志表
-- 审计日志表字段说明
-- SOURCE H:/2026/lesson-appointment/api/migration-20260822-audit-log.sql;

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

CREATE TABLE IF NOT EXISTS `sys_tenant` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '自增主键',
  `tenant-code`        VARCHAR(56)  NOT NULL                 COMMENT '唯一标识（UUID）',
  `org-name`       VARCHAR(255)  DEFAULT NULL             COMMENT '机构名称',
  `contact  `     VARCHAR(255) DEFAULT NULL             COMMENT '联系人',
  `phone`         VARCHAR(255)  DEFAULT NULL             COMMENT '电话号码',
  `package-id`    BIGINT  DEFAULT 0             COMMENT '包id',
  `status`       INT          DEFAULT NULL             COMMENT '租户状态',
  `expire-time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '过期时间',
  `create-time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update-time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`tenant-code`),

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户信息表';
