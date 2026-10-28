-- ============================================================
-- eclassroom 课堂服务实例注册 + 租户课堂关系表
-- 日期：2026-10-27
-- 说明：在 lesson_appointment 库中新建两张表，实现多租户课堂模块开关 + 服务发现
-- ============================================================

-- ------------------------------------------------------------
-- 1. eclassroom 实例表（课堂服务实例注册）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sys_eclassroom_instance`;
CREATE TABLE `sys_eclassroom_instance` (
  `id`              bigint       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `instance_code`   varchar(64)  NOT NULL                COMMENT '实例编码（唯一标识，如 classroom-svc-1）',
  `instance_name`   varchar(128) NOT NULL                COMMENT '实例名称（展示用，如 华东课堂服务-1）',
  `api_host`        varchar(255) NOT NULL                COMMENT 'API服务地址（IP或域名）',
  `api_port`        int          NOT NULL DEFAULT 8092   COMMENT 'API服务端口号',
  `api_base_path`   varchar(128)          DEFAULT '/api/v1' COMMENT 'API根路径（含版本前缀，不含业务段；拼接方补 /schedules/events、/classrooms/{sid}/*）',
  `ws_host`         varchar(255)          DEFAULT NULL    COMMENT 'WebSocket服务地址（NULL=与API同址）',
  `ws_port`         int                   DEFAULT NULL    COMMENT 'WebSocket端口号（NULL=与API同端口）',
  `ws_base_path`    varchar(128)          DEFAULT '' COMMENT 'WebSocket根路径（不含业务段；前端补 /ws/classrooms/{sid}/...，空串表示 host:port 根）',
  `status`          tinyint      NOT NULL DEFAULT 1      COMMENT '实例状态：1=正常 0=停用 2=维护中',
  `region`          varchar(64)           DEFAULT NULL    COMMENT '部署区域（如 cn-east-1）',
  `max_capacity`    int                   DEFAULT NULL    COMMENT '最大并发课堂数',
  `current_load`    int                   DEFAULT 0       COMMENT '当前负载（并发课堂数）',
  `remark`          varchar(255)          DEFAULT NULL    COMMENT '备注',
  `creator_account` varchar(255)          DEFAULT NULL    COMMENT '创建者账号',
  `deleted`         tinyint      NOT NULL DEFAULT 0      COMMENT '软删除：0正常 1已删除',
  `create_time`     datetime              DEFAULT CURRENT_TIMESTAMP    COMMENT '创建时间',
  `update_time`     datetime              DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_instance_code` (`instance_code`),
  KEY `idx_status` (`status`),
  KEY `idx_region` (`region`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='eclassroom课堂服务实例注册表';

-- ------------------------------------------------------------
-- 2. 租户-eclassroom 关系表（租户课堂开关 + 实例绑定）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sys_tenant_eclassroom`;
CREATE TABLE `sys_tenant_eclassroom` (
  `id`              bigint       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`       bigint       NOT NULL                COMMENT '租户ID（对应 sys_tenant.id）',
  `instance_id`     bigint       NOT NULL                COMMENT 'eclassroom实例ID（对应 sys_eclassroom_instance.id）',
  `enabled`         tinyint      NOT NULL DEFAULT 1      COMMENT '是否启用：1=启用 0=临时禁用',
  `config`          json                  DEFAULT NULL    COMMENT '租户级课堂配置（JSON，如录制开关、人数上限等）',
  `remark`          varchar(255)          DEFAULT NULL    COMMENT '备注',
  `creator_account` varchar(255)          DEFAULT NULL    COMMENT '操作人账号',
  `create_time`     datetime              DEFAULT CURRENT_TIMESTAMP    COMMENT '创建时间',
  `update_time`     datetime              DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_id` (`tenant_id`),
  KEY `idx_instance_id` (`instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户-eclassroom课堂关系表';