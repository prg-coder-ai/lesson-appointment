-- ============================================================
-- 行业表：sys_industry
-- 对应实体：com.reservation.entity.Industry
-- 数据库：lesson_appointment
--
-- 说明：
--   行业字典（如 教育/IT/医疗 …），用于按行业归类租户或配置术语。
--   由「平台管理端 - 系统设置 - 行业管理」菜单维护（仅平台管理员可操作）。
--   字段：id 自增主键、code 行业编码(唯一)、name 行业名称、
--         status 状态(1启用 0停用)、remark 备注。
-- ============================================================

USE lesson_appointment;

CREATE TABLE IF NOT EXISTS `sys_industry` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT                COMMENT '自增主键',
  `code`        VARCHAR(50)  NOT NULL                              COMMENT '行业编码（唯一，如 edu/it/medical）',
  `name`        VARCHAR(100) NOT NULL                              COMMENT '行业名称（页面展示）',
  `status`      TINYINT      NOT NULL DEFAULT 1                    COMMENT '状态：1启用 0停用',
  `remark`      VARCHAR(500) DEFAULT NULL                          COMMENT '备注',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP    COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='行业表';

-- ============================================================
-- 字段与实体属性对照（map-underscore-to-camel-case = true）
-- ============================================================
--  id           -> id           BIGINT       自增主键
--  code         -> code         VARCHAR(50)  行业编码，唯一
--  name         -> name         VARCHAR(100) 行业名称
--  status       -> status       TINYINT      状态 1启用 0停用
--  remark       -> remark       VARCHAR(500) 备注
--  create_time  -> createTime   DATETIME     创建时间
--  update_time  -> updateTime   DATETIME     更新时间
