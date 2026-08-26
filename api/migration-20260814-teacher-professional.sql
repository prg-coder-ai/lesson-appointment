-- ======================================================================
-- 教师职业信息维护功能 - 数据库迁移脚本
-- 对应 notes 文件 §1 数据库设计（3 张表）
-- 执行：mysql -u root -p lesson_appointment < migration-20260814-teacher-professional.sql
-- ======================================================================

-- ------------------------------------------------------------------
-- 1.1 教师职业信息主表 teacher_professional（与 user 表 1:1）
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teacher_professional` (
  `teacher_professional_id` varchar(36)   NOT NULL COMMENT '主键UUID',
  `teacher_id`              varchar(36)   NOT NULL COMMENT '关联user表user_id（仅限role=teacher）',
  `subject`                 varchar(50)   DEFAULT NULL COMMENT '学科（冗余user.language_type，便于排序搜索）',
  `personal_photo_url`      varchar(500)  DEFAULT NULL COMMENT '个人照片URL（静态文件路径，优先）',
  `personal_photo_base64`   mediumtext    DEFAULT NULL COMMENT '个人照片Base64（与URL二选一，兼容老qualification方式）',
  `bio_text`                varchar(2000) DEFAULT NULL COMMENT '文字说明（教师简介）',
  `bio_url`                 varchar(500)  DEFAULT NULL COMMENT '文字说明链接（外部简历/博客URL）',
  `availability_rule`       varchar(1000) DEFAULT NULL COMMENT '可预约时间规则（结构化JSON，冗余字段便于快速展示）',
  `min_booking_hours`       int           DEFAULT 4 COMMENT '单次可预约最小课时数（如4小时）',
  `weekly_available_hours`  int           DEFAULT 20 COMMENT '每周可预约总课时上限',
  `certificate_text`        varchar(500)  DEFAULT NULL COMMENT '证书文字描述（如CET-8、JLPT N1）',
  `status`                  varchar(10)   NOT NULL DEFAULT 'active' COMMENT '职业信息状态active/inactive/frozen',
  `create_time`             datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`             datetime      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`teacher_professional_id`),
  UNIQUE KEY `uk_teacher_id` (`teacher_id`) COMMENT '一个教师只能有一条职业信息',
  KEY `idx_subject` (`subject`) COMMENT '学科索引',
  KEY `idx_status` (`status`) COMMENT '状态索引',
  CONSTRAINT `fk_tp_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师职业信息主表(1:1 user teacher)';

ALTER TABLE `teacher_professional`
  ADD COLUMN `optioned_teacher_link` varchar(36) DEFAULT NULL COMMENT '教师的id 用来链接到排期表' AFTER `teacher_id`,
  ADD COLUMN `optioned_teacher_scheduleId` varchar(36) DEFAULT NULL COMMENT '教师的排期scheduleId' AFTER `availability_rule`;



-- ------------------------------------------------------------------
-- 1.2 教师资证书表 teacher_certificate（1:N 支持多张）
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teacher_certificate` (
  `certificate_id` varchar(36)  NOT NULL COMMENT '主键UUID',
  `teacher_id`     varchar(36)  NOT NULL COMMENT '关联教师user_id',
  `cert_name`      varchar(100) DEFAULT NULL COMMENT '证书名称',
  `cert_url`       varchar(500) DEFAULT NULL COMMENT '证书图片URL',
  `cert_base64`    mediumtext   DEFAULT NULL COMMENT '证书图片Base64（兼容）',
  `sort_no`        int          DEFAULT 0 COMMENT '排序号，小在前',
  `create_time`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`certificate_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  CONSTRAINT `fk_tc_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师资格证书表(1:N)';

-- ------------------------------------------------------------------
-- 1.3 教师可预约时间段表 teacher_available_time
--     weekly=每周模板(1=周一..7=周日)；override=具体日期覆盖；holiday=假日关闭
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `teacher_available_time` (
  `available_id`   varchar(36) NOT NULL COMMENT '主键UUID',
  `teacher_id`     varchar(36) NOT NULL COMMENT '关联教师user_id',
  `time_type`      varchar(20) NOT NULL COMMENT 'weekly(每周模板) / override(具体日期覆盖) / holiday(假日)',
  `day_of_week`    tinyint     DEFAULT NULL COMMENT '每周模板时生效：1=周一..7=周日',
  `specific_date`  date        DEFAULT NULL COMMENT 'override/holiday时生效：具体日期',
  `start_time`     time        NOT NULL COMMENT '时段开始 如 09:00:00',
  `end_time`       time        NOT NULL COMMENT '时段结束 如 17:00:00',


  `status`         varchar(10) NOT NULL DEFAULT 'active' COMMENT 'active/frozen',
  `create_time`    datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`available_id`),
  KEY `idx_teacher_day` (`teacher_id`, `day_of_week`),
  KEY `idx_teacher_date` (`teacher_id`, `specific_date`),
  CONSTRAINT `fk_tat_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师可预约时间段（周模板+按日覆盖）';

ALTER TABLE teacher_available_time
  DROP COLUMN time_type,
  DROP COLUMN day_of_week,
  DROP COLUMN specific_date,
  ADD COLUMN repeat_type    VARCHAR(10)  DEFAULT 'none' COMMENT 'none/day/week/month',
  ADD COLUMN repeat_interval INT         DEFAULT 1      COMMENT '重复间隔',
  ADD COLUMN repeat_days    VARCHAR(100) DEFAULT NULL   COMMENT 'week→1..7/ month→1..31 逗号分隔',
  ADD COLUMN start_date     VARCHAR(10)  DEFAULT NULL   COMMENT 'YYYY-MM-DD',
  ADD COLUMN end_date       VARCHAR(10)  DEFAULT NULL   COMMENT 'YYYY-MM-DD';

  ALTER TABLE teacher_available_time 
  ADD COLUMN optioned    INT  DEFAULT 0 COMMENT '是否选项-优选提供给用户 0 -- 否 1 -- 是 ', 
  ADD COLUMN schedule_id   VARCHAR(36) DEFAULT NULL   COMMENT '预约时间表ID';
