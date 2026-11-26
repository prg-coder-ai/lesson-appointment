-- ============================================================
-- 课堂 App 安装包（系统配置 → 课堂 App 包管理）
-- 日期：2026-11-26
-- 说明：在 lesson_appointment 库中新增一张表，存放 eClassroom 桌面/安卓/iOS 安装包
--       平台管理员上传 = 全平台共用；租户管理员上传 = 仅本租户可见。
--       教师/学生只能下载，不能上传（权限在 AuthzRules + 方法体双重约束）。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_app_package` (
  `id`             bigint       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`      bigint       NOT NULL DEFAULT 0       COMMENT '所属租户：0=平台（全部租户可见），大于0=该租户专属',
  `platform`       varchar(16)  NOT NULL                 COMMENT '目标平台：windows/android/ios/macos',
  `version`        varchar(32)  NOT NULL DEFAULT ''      COMMENT '版本号（展示用，如 1.0.0）',
  `file_name`      varchar(200) NOT NULL                 COMMENT '原始文件名（下载时作为附件名回填）',
  `stored_name`    varchar(200) NOT NULL                 COMMENT '落盘文件名（带随机前缀，防覆盖与防路径猜测）',
  `file_size`      bigint       NOT NULL DEFAULT 0       COMMENT '文件字节数',
  `file_sha256`    char(64)     NOT NULL DEFAULT ''      COMMENT 'SHA-256 摘要（完整性校验/同文件去重）',
  `status`         tinyint      NOT NULL DEFAULT 1       COMMENT '状态：1=上架可下载 0=已下架（记录保留，禁下载）',
  `remark`         varchar(255)          DEFAULT NULL    COMMENT '备注（更新说明等）',
  `uploader_id`    varchar(64)           DEFAULT NULL    COMMENT '上传人用户ID',
  `uploader_role`  varchar(32)           DEFAULT NULL    COMMENT '上传人角色：platform_admin/admin',
  `uploader_name`  varchar(64)           DEFAULT NULL    COMMENT '上传人姓名（冗余存储，便于审计页直接展示）',
  `download_count` int          NOT NULL DEFAULT 0       COMMENT '累计下载次数',
  `deleted`        tinyint      NOT NULL DEFAULT 0       COMMENT '软删除：0正常 1已删除',
  `create_time`    datetime              DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    datetime              DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_platform` (`tenant_id`, `platform`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课堂App安装包管理表';
