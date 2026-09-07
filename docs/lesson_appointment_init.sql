-- ============================================================
-- 预约系统 初始化建库脚本 (lesson_appointment)
-- 由 mysqldump --no-data 导出真实结构，并经清洗生成。
-- 说明：原库 COMMENT 注释在写入时已损坏，故此处统一移除；
--       列名与类型保持与线上库完全一致。
-- 使用： mysql -uroot -p < lesson_appointment_init.sql
-- ============================================================

CREATE DATABASE   IF NOT EXISTS  `lesson_appointment`  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci   DEFAULT ENCRYPTION='N' ;

USE `lesson_appointment`;

CREATE TABLE `appointment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `booking_id` varchar(36) DEFAULT NULL,
  `class_index` int DEFAULT '1',
  `appointment_datetime` datetime DEFAULT NULL,
  `last_datetime` datetime DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `log_id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `user_name` varchar(100) DEFAULT NULL,
  `user_role` varchar(20) DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `resource_type` varchar(30) DEFAULT NULL,
  `resource_id` varchar(36) DEFAULT NULL,
  `resource_name` varchar(200) DEFAULT NULL,
  `method` varchar(200) DEFAULT NULL,
  `request_url` varchar(500) DEFAULT NULL,
  `http_method` varchar(10) DEFAULT NULL,
  `ip` varchar(50) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `request_params` text,
  `result_status` varchar(20) DEFAULT NULL,
  `error_msg` varchar(500) DEFAULT NULL,
  `cost_ms` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_log_id` (`log_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_resource` (`resource_type`,`resource_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `booking` (
  `booking_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `schedule_id` varchar(36) NOT NULL,
  `teacher_id` varchar(36) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'booked',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`booking_id`),
  KEY `fk_schedule_id` (`schedule_id`),
  KEY `fk_student_id` (`student_id`),
  KEY `idx_status` (`status`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `course_schedule` (`schedule_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_booking_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `course` (
  `course_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `template_id` varchar(36) NOT NULL,
  `course_name` varchar(50) NOT NULL,
  `content` varchar(1000) NOT NULL,
  `feature` varchar(1000) NOT NULL,
  `teacher_id` varchar(36) NOT NULL,
  `status` varchar(10) NOT NULL DEFAULT 'inactive',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`course_id`),
  KEY `fk_template_id` (`template_id`),
  KEY `fk_teacher_id` (`teacher_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_course_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_course_template` FOREIGN KEY (`template_id`) REFERENCES `course_template` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `course_check_in` (
  `check_in_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `booking_id` varchar(36) NOT NULL,
  `check_in_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`check_in_id`),
  KEY `fk_booking_id` (`booking_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_check_in_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `course_id` varchar(36) NOT NULL,
  `booking_id` varchar(36) NOT NULL,
  `student_id` varchar(36) NOT NULL,
  `rating` int NOT NULL,
  `comment` varchar(1000) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`evaluation_id`),
  KEY `fk_course_id` (`course_id`),
  KEY `fk_student_id` (`student_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_evaluation_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `course_feedback` (
  `feedback_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `course_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `content` varchar(1000) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `handle_id` varchar(36) NOT NULL,
  `handle_status` varchar(36) NOT NULL,
  `handle_content` varchar(1000) DEFAULT NULL,
  `handle_time` datetime DEFAULT NULL,
  PRIMARY KEY (`feedback_id`),
  KEY `fk_course_id` (`course_id`),
  KEY `fk_user_id` (`user_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_feedback_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `course_schedule` (
  `schedule_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `name` varchar(56) NOT NULL DEFAULT 'noname',
  `course_id` varchar(36) NOT NULL,
  `time_zone` varchar(36) NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime NOT NULL,
  `repeat_type` tinyint(1) DEFAULT '0',
  `repeat_interval` tinyint(1) DEFAULT '1',
  `repeat_days` varchar(255) DEFAULT NULL,
  `available_sites` tinyint(1) NOT NULL DEFAULT '1',
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`),
  KEY `idx_start_end_time` (`start_time`,`end_time`),
  KEY `idx_status` (`status`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_schedule_chk_1` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `course_template` (
  `template_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `language_type` varchar(20) NOT NULL,
  `difficulty_level` varchar(20) NOT NULL,
  `class_fee` decimal(10,2) NOT NULL,
  `class_duration` int NOT NULL,
  `class_form` varchar(20) NOT NULL,
  `description` varchar(500) NOT NULL,
  `status` varchar(10) NOT NULL DEFAULT 'inactive',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_tenant_lang_level` (`tenant_id`,`language_type`,`difficulty_level`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_industry` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `status` tinyint NOT NULL DEFAULT '1',
  `remark` varchar(500) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_metric_hourly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `hour_time` datetime NOT NULL,
  `cpu_system_avg` decimal(5,2) DEFAULT NULL,
  `cpu_system_max` decimal(5,2) DEFAULT NULL,
  `cpu_process_avg` decimal(5,2) DEFAULT NULL,
  `mem_used_avg` bigint DEFAULT NULL,
  `jvm_heap_avg` bigint DEFAULT NULL,
  `jvm_heap_max` bigint DEFAULT NULL,
  `disk_used_max` bigint DEFAULT NULL,
  `thread_avg` int DEFAULT NULL,
  `online_max` int DEFAULT NULL,
  `sample_count` int NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hour` (`hour_time`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_metric_sample` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sample_time` datetime NOT NULL,
  `cpu_system` decimal(5,2) DEFAULT NULL,
  `cpu_process` decimal(5,2) DEFAULT NULL,
  `mem_total` bigint DEFAULT NULL,
  `mem_used` bigint DEFAULT NULL,
  `jvm_heap_used` bigint DEFAULT NULL,
  `jvm_heap_max` bigint DEFAULT NULL,
  `disk_total` bigint DEFAULT NULL,
  `disk_used` bigint DEFAULT NULL,
  `thread_count` int DEFAULT NULL,
  `gc_count` bigint DEFAULT NULL,
  `gc_time_ms` bigint DEFAULT NULL,
  `net_out_bytes` bigint DEFAULT NULL,
  `online_users` int DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sample_time` (`sample_time`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_package_template` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `template_name` varchar(100) NOT NULL,
  `template_code` varchar(50) DEFAULT NULL,
  `course_limit` int NOT NULL DEFAULT '0',
  `schedule_limit` int NOT NULL DEFAULT '0',
  `user_total_limit` int NOT NULL DEFAULT '0',
  `teacher_limit` int NOT NULL DEFAULT '0',
  `student_limit` int NOT NULL DEFAULT '0',
  `teacher_publish_limit` int NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT '1',
  `remark` varchar(500) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_code` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_system_config` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL,
  `config_value` varchar(500) DEFAULT NULL,
  `config_name` varchar(200) NOT NULL,
  `config_group` varchar(50) NOT NULL DEFAULT 'monitor',
  `value_type` varchar(20) NOT NULL DEFAULT 'int',
  `default_value` varchar(500) DEFAULT NULL,
  `remark` varchar(500) DEFAULT NULL,
  `editable` tinyint NOT NULL DEFAULT '1',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  KEY `idx_group` (`config_group`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_tenant` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_code` varchar(56) NOT NULL,
  `org_name` varchar(255) DEFAULT NULL,
  `contact` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1',
  `package_id` bigint DEFAULT '0',
  `industry_id` bigint DEFAULT NULL,
  `expire_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `offline_time` datetime DEFAULT NULL,
  `remark` varchar(500) DEFAULT NULL,
  `deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`tenant_code`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_tenant_package` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `course_limit` int NOT NULL DEFAULT '0',
  `course_current` int NOT NULL DEFAULT '0',
  `schedule_limit` int NOT NULL DEFAULT '0',
  `schedule_current` int NOT NULL DEFAULT '0',
  `user_total_limit` int NOT NULL DEFAULT '0',
  `user_current` int NOT NULL DEFAULT '0',
  `teacher_limit` int NOT NULL DEFAULT '0',
  `teacher_current` int NOT NULL DEFAULT '0',
  `student_limit` int NOT NULL DEFAULT '0',
  `student_current` int NOT NULL DEFAULT '0',
  `teacher_publish_limit` int NOT NULL DEFAULT '0',
  `teacher_publish_current` int NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_id` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_tenant_stats_monthly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `stat_month` char(7) NOT NULL,
  `teacher_count` int NOT NULL DEFAULT '0',
  `student_count` int NOT NULL DEFAULT '0',
  `course_count` int NOT NULL DEFAULT '0',
  `schedule_count` int NOT NULL DEFAULT '0',
  `booking_count` int NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_month` (`tenant_id`,`stat_month`),
  KEY `idx_month` (`stat_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_term` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `term_key` varchar(64) NOT NULL,
  `term_name` varchar(64) NOT NULL,
  `language` varchar(16) NOT NULL DEFAULT 'zh',
  `term_type` varchar(32) NOT NULL DEFAULT 'label',
  `industry_id` bigint NOT NULL DEFAULT '0',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT '1',
  `remark` varchar(255) DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scope_key` (`term_key`,`industry_id`,`tenant_id`,`language`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_industry` (`industry_id`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sys_user_session` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `user_id` varchar(36) NOT NULL,
  `user_role` varchar(20) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `login_time` datetime NOT NULL,
  `last_active` datetime NOT NULL,
  `status` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session` (`session_id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_last_active` (`last_active`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_available_time` (
  `available_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `teacher_id` varchar(36) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` varchar(10) NOT NULL DEFAULT 'active',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `repeat_type` varchar(10) DEFAULT 'none',
  `repeat_interval` int DEFAULT '1',
  `repeat_days` varchar(100) DEFAULT NULL,
  `start_date` varchar(10) DEFAULT NULL,
  `end_date` varchar(10) DEFAULT NULL,
  `optioned` int DEFAULT '0',
  `schedule_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`available_id`),
  KEY `idx_teacher_day` (`teacher_id`),
  KEY `idx_teacher_date` (`teacher_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tat_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_certificate` (
  `certificate_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `teacher_id` varchar(36) NOT NULL,
  `cert_name` varchar(100) DEFAULT NULL,
  `cert_url` varchar(500) DEFAULT NULL,
  `cert_base64` mediumtext,
  `sort_no` int DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`certificate_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tc_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_professional` (
  `teacher_professional_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `teacher_id` varchar(36) NOT NULL,
  `optioned_teacher_link` varchar(36) DEFAULT NULL,
  `subject` varchar(50) DEFAULT NULL,
  `personal_photo_url` varchar(500) DEFAULT NULL,
  `personal_photo_base64` mediumtext,
  `bio_text` varchar(2000) DEFAULT NULL,
  `bio_url` varchar(500) DEFAULT NULL,
  `availability_rule` varchar(1000) DEFAULT NULL,
  `optioned_teacher_scheduleId` varchar(36) DEFAULT NULL,
  `min_booking_hours` int DEFAULT '4',
  `weekly_available_hours` int DEFAULT '20',
  `certificate_text` varchar(500) DEFAULT NULL,
  `status` varchar(10) NOT NULL DEFAULT 'active',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`teacher_professional_id`),
  UNIQUE KEY `uk_teacher_id` (`teacher_id`),
  KEY `idx_subject` (`subject`),
  KEY `idx_status` (`status`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tp_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `teacher_published_profile` (
  `published_profile_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `teacher_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_professional_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '鏁欏笀淇℃伅',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `field_config` mediumtext COLLATE utf8mb4_unicode_ci,
  `style_config` mediumtext COLLATE utf8mb4_unicode_ci,
  `draft_data` mediumtext COLLATE utf8mb4_unicode_ci,
  `static_html` mediumtext COLLATE utf8mb4_unicode_ci,
  `published_at` datetime DEFAULT NULL,
  `published_by_user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`published_profile_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_status` (`status`),
  KEY `idx_teacher_status` (`teacher_id`,`status`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user` (
  `user_id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `account` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(100) NOT NULL,
  `role` varchar(32) NOT NULL,
  `learn_goal` varchar(200) DEFAULT NULL,
  `language_level` varchar(20) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `qualification` text,
  `language_type` varchar(20) DEFAULT NULL,
  `status` varchar(10) NOT NULL,
  `last_active_time` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_account_tenant` (`account`,`tenant_id`),
  UNIQUE KEY `uk_phone` (`phone`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_status` (`status`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_tenant_active` (`tenant_id`,`last_active_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `user_refresh_token` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36) NOT NULL,
  `refresh_token` varchar(512) NOT NULL,
  `expire_time` datetime NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_refresh_token` (`refresh_token`)
) ENGINE=InnoDB AUTO_INCREMENT DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
