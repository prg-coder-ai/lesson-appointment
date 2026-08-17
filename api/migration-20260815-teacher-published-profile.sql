-- ============================================================
-- 教师发布信息 / 转发配置表（P1：enterPublishMode 功能）
-- 每个 teacher_id 可有 0..N 份发布记录，其中 status=active 的视为当前对外展示版本
-- 一份发布记录 = 字段勾选配置 + 样式配置 + 完整内嵌图片的静态HTML
-- 临时保存也写入本表，status=draft，不影响线上展示
-- ============================================================

DROP TABLE IF EXISTS `teacher_published_profile`;
CREATE TABLE `teacher_published_profile` (
  `published_profile_id` VARCHAR(64) NOT NULL COMMENT '主键UUID',
  `teacher_id`           VARCHAR(64) NOT NULL COMMENT '关联user表user_id(role=teacher)',
  `teacher_professional_id` VARCHAR(64) DEFAULT NULL COMMENT '生成时对应的职业信息版本ID，方便回溯',
  `title`                VARCHAR(128)  NOT NULL DEFAULT '教师信息' COMMENT '发布标题（如"英语教师-张三的个人介绍"）',
  `status`               VARCHAR(16)   NOT NULL DEFAULT 'draft' COMMENT 'draft草稿/published发布/archived归档',
  `field_config`         MEDIUMTEXT    DEFAULT NULL COMMENT '字段勾选与排序 JSON: [{key,label,enabled,sort}]',
  `style_config`         MEDIUMTEXT    DEFAULT NULL COMMENT '样式配置 JSON: {fontFamily,fontSizePx,titleSizePx,photoSizePx,certSizePx,accentColor,bgColor}',
  `draft_data`           MEDIUMTEXT    DEFAULT NULL COMMENT '临时保存的原始数据快照 JSON（进入编辑时回填）',
  `static_html`          MEDIUMTEXT    DEFAULT NULL COMMENT '发布后生成的完整静态HTML页面（内嵌图片base64），独立可下载',
  `published_at`         DATETIME      DEFAULT NULL COMMENT '最后一次发布时间',
  `published_by_user_id` VARCHAR(64)   DEFAULT NULL COMMENT '发布操作人 user_id',
  `create_time`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`published_profile_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_status`       (`status`),
  KEY `idx_teacher_status` (`teacher_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教师发布信息/转发配置表';
