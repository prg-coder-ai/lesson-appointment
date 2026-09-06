-- MySQL dump 10.13  Distrib 8.4.11, for Win64 (x86_64)
--
-- Host: localhost    Database: lesson_appointment
-- ------------------------------------------------------
-- Server version	8.4.11

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `lesson_appointment`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `lesson_appointment` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `lesson_appointment`;

--
-- Table structure for table `appointment`
--

DROP TABLE IF EXISTS `appointment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '唯一编号',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '预约id',
  `class_index` int DEFAULT '1' COMMENT '课时序号',
  `appointment_datetime` datetime DEFAULT NULL COMMENT '排期预约中的一个课时时间',
  `last_datetime` datetime DEFAULT NULL COMMENT '可能修改前的日期时间',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT '预约时间的状态:active生效/noted已发送通知/completed已完成/已改期cancelled/申请取消cancelling',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预约时间列表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `log_id` varchar(36) NOT NULL COMMENT '日志唯一标识（UUID）',
  `user_id` varchar(36) DEFAULT NULL COMMENT '操作人ID',
  `user_name` varchar(100) DEFAULT NULL COMMENT '操作人账号/姓名',
  `user_role` varchar(20) DEFAULT NULL COMMENT '操作人角色（student/teacher/admin）',
  `action` varchar(50) NOT NULL COMMENT '操作类型',
  `resource_type` varchar(30) DEFAULT NULL COMMENT '操作资源类型',
  `resource_id` varchar(36) DEFAULT NULL COMMENT '操作资源ID',
  `resource_name` varchar(200) DEFAULT NULL COMMENT '操作资源名称',
  `method` varchar(200) DEFAULT NULL COMMENT '执行的Java方法',
  `request_url` varchar(500) DEFAULT NULL COMMENT '请求URL',
  `http_method` varchar(10) DEFAULT NULL COMMENT 'HTTP方法',
  `ip` varchar(50) DEFAULT NULL COMMENT '客户端IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '客户端User-Agent',
  `request_params` text COMMENT '请求参数JSON（敏感字段脱敏）',
  `result_status` varchar(20) DEFAULT NULL COMMENT '操作结果（success/fail）',
  `error_msg` varchar(500) DEFAULT NULL COMMENT '失败原因',
  `cost_ms` int DEFAULT NULL COMMENT '执行耗时（毫秒）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_log_id` (`log_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_resource` (`resource_type`,`resource_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审计日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `booking`
--

DROP TABLE IF EXISTS `booking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking` (
  `booking_id` varchar(36) NOT NULL COMMENT '预约唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `schedule_id` varchar(36) NOT NULL COMMENT '关联的课程排期ID',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `status` varchar(20) NOT NULL DEFAULT 'booked' COMMENT '预约状态（booked：已预约，cancelled：已取消，completed：已完成）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`booking_id`),
  KEY `fk_schedule_id` (`schedule_id`) COMMENT '关联排期索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于预约状态查询',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `course_schedule` (`schedule_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_booking_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预约表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course`
--

DROP TABLE IF EXISTS `course`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course` (
  `course_id` varchar(36) NOT NULL COMMENT '课程唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `template_id` varchar(36) NOT NULL COMMENT '关联的课程模板ID',
  `course_name` varchar(50) NOT NULL COMMENT '课程名称（2-50字）',
  `content` varchar(1000) NOT NULL COMMENT '教学内容（10-1000字）',
  `feature` varchar(1000) NOT NULL COMMENT '课程特色（10-1000字）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `status` varchar(10) NOT NULL DEFAULT 'inactive' COMMENT '课程状态（active：激活，inactive：待审核，frozen：冻结）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`course_id`),
  KEY `fk_template_id` (`template_id`) COMMENT '关联课程模板索引',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_course_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_course_template` FOREIGN KEY (`template_id`) REFERENCES `course_template` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='教师课程表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_check_in`
--

DROP TABLE IF EXISTS `course_check_in`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_check_in` (
  `check_in_id` varchar(36) NOT NULL COMMENT '签到唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID',
  `check_in_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签到时间',
  PRIMARY KEY (`check_in_id`),
  KEY `fk_booking_id` (`booking_id`) COMMENT '关联预约索引',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_check_in_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程签到表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_evaluation`
--

DROP TABLE IF EXISTS `course_evaluation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `rating` int NOT NULL COMMENT '评分（1-5）',
  `comment` varchar(1000) DEFAULT NULL COMMENT '评价内容（最大1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`evaluation_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_evaluation_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程评价表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_feedback`
--

DROP TABLE IF EXISTS `course_feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_feedback` (
  `feedback_id` varchar(36) NOT NULL COMMENT '反馈唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `user_id` varchar(36) NOT NULL COMMENT '关联的用户ID（对应user表的user_id）',
  `content` varchar(1000) DEFAULT NULL COMMENT '反馈内容（最大1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `handle_id` varchar(36) NOT NULL COMMENT '管理员关联的用户ID（对应user表的user_id）',
  `handle_status` varchar(36) NOT NULL COMMENT '处理状态：0 pending（待处理），1 handled（已处理）',
  `handle_content` varchar(1000) DEFAULT NULL COMMENT '处理内容（管理员填写）',
  `handle_time` datetime DEFAULT NULL COMMENT '处理时间',
  PRIMARY KEY (`feedback_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_user_id` (`user_id`) COMMENT '关联用户索引',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_feedback_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程反馈表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_schedule`
--

DROP TABLE IF EXISTS `course_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '排期唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `name` varchar(56) NOT NULL DEFAULT 'noname' COMMENT '排期名称',
  `course_id` varchar(36) NOT NULL COMMENT '关联的教师课程ID',
  `time_zone` varchar(36) NOT NULL COMMENT '排期所用的时区',
  `start_time` datetime NOT NULL COMMENT '排期开始时间（格式：YYYY-MM-DD HH:mm:ss，包含起始日期）',
  `end_time` datetime NOT NULL COMMENT '排期结束时间（格式：YYYY-MM-DD HH:mm:ss）',
  `repeat_type` tinyint(1) DEFAULT '0' COMMENT '重复类型：0=不重复，1=每天，2=每周，3=每月',
  `repeat_interval` tinyint(1) DEFAULT '1' COMMENT '重复间隔（如每2周一次：2）',
  `repeat_days` varchar(255) DEFAULT NULL COMMENT '重复的星期几：1=周一，2=周二...7=周日，逗号分隔（以repeat_type=2时有效）；type=3时为1-31,当月的哪几天',
  `available_sites` tinyint(1) NOT NULL DEFAULT '1' COMMENT '剩余席位',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '排期状态（pending/active/inactive/frozen/overtime：已结束（自动更新））',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `idx_start_end_time` (`start_time`,`end_time`) COMMENT '时间索引，用于排期冲突校验',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于可预约排期查询',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_schedule_chk_1` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程排期表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_template`
--

DROP TABLE IF EXISTS `course_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_template` (
  `template_id` varchar(36) NOT NULL COMMENT '模板唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `language_type` varchar(20) NOT NULL COMMENT '语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语）',
  `difficulty_level` varchar(20) NOT NULL COMMENT '难度等级（枚举：入门/进阶/中级/高级）',
  `class_fee` decimal(10,2) NOT NULL COMMENT '课时费（≥0，保留2位小数）',
  `class_duration` int NOT NULL COMMENT '课程时长（≥15，15的倍数，单位：分钟）',
  `class_form` varchar(20) NOT NULL COMMENT '课程形式（枚举：一对一/小班课/大班课）',
  `description` varchar(500) NOT NULL COMMENT '课程描述（10-500字）',
  `status` varchar(10) NOT NULL DEFAULT 'inactive' COMMENT '模板状态（active：激活，inactive：待审核，frozen：冻结）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_tenant_lang_level` (`tenant_id`,`language_type`,`difficulty_level`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_industry`
--

DROP TABLE IF EXISTS `sys_industry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_industry` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(50) NOT NULL COMMENT '行业编码（唯一，如：edu/it/medical）',
  `name` varchar(100) NOT NULL COMMENT '行业名称（页面展示）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1启用 0停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_metric_hourly`
--

DROP TABLE IF EXISTS `sys_metric_hourly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_metric_hourly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `hour_time` datetime NOT NULL COMMENT '整点时间',
  `cpu_system_avg` decimal(5,2) DEFAULT NULL,
  `cpu_system_max` decimal(5,2) DEFAULT NULL,
  `cpu_process_avg` decimal(5,2) DEFAULT NULL,
  `mem_used_avg` bigint DEFAULT NULL,
  `jvm_heap_avg` bigint DEFAULT NULL,
  `jvm_heap_max` bigint DEFAULT NULL,
  `disk_used_max` bigint DEFAULT NULL,
  `thread_avg` int DEFAULT NULL,
  `online_max` int DEFAULT NULL COMMENT '该小时在线峰值',
  `sample_count` int NOT NULL DEFAULT '0' COMMENT '聚合样本数',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hour` (`hour_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统指标小时聚合';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_metric_sample`
--

DROP TABLE IF EXISTS `sys_metric_sample`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_metric_sample` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sample_time` datetime NOT NULL COMMENT '采样时间',
  `cpu_system` decimal(5,2) DEFAULT NULL COMMENT '系统CPU使用率(%)',
  `cpu_process` decimal(5,2) DEFAULT NULL COMMENT '当前进程CPU使用率(%)',
  `mem_total` bigint DEFAULT NULL COMMENT '物理内存总量(字节)',
  `mem_used` bigint DEFAULT NULL COMMENT '物理内存已用(字节)',
  `jvm_heap_used` bigint DEFAULT NULL COMMENT 'JVM堆已用(字节)',
  `jvm_heap_max` bigint DEFAULT NULL COMMENT 'JVM堆上限(字节)',
  `disk_total` bigint DEFAULT NULL COMMENT '磁盘总量(字节)',
  `disk_used` bigint DEFAULT NULL COMMENT '磁盘已用(字节)',
  `thread_count` int DEFAULT NULL COMMENT 'JVM线程数',
  `gc_count` bigint DEFAULT NULL COMMENT 'GC累计次数',
  `gc_time_ms` bigint DEFAULT NULL COMMENT 'GC累计耗时(毫秒)',
  `net_out_bytes` bigint DEFAULT NULL COMMENT '采样周期内应用出口字节数',
  `online_users` int DEFAULT NULL COMMENT '在线用户数',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sample_time` (`sample_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统指标采样明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_package_template`
--

DROP TABLE IF EXISTS `sys_package_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_package_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `template_name` varchar(100) NOT NULL COMMENT '套餐模板名称',
  `template_code` varchar(50) DEFAULT NULL COMMENT '套餐模板编码（可填，便于接口引用）',
  `course_limit` int NOT NULL DEFAULT '0' COMMENT '课程数量限额（0=不限）',
  `schedule_limit` int NOT NULL DEFAULT '0' COMMENT '排期数量限额（0=不限）',
  `user_total_limit` int NOT NULL DEFAULT '0' COMMENT '注册用户总数限额（0=不限）',
  `teacher_limit` int NOT NULL DEFAULT '0' COMMENT '教师数量限额（0=不限）',
  `student_limit` int NOT NULL DEFAULT '0' COMMENT '学生数量限额（0=不限）',
  `teacher_publish_limit` int NOT NULL DEFAULT '0' COMMENT '教师信息发布限额（0=不限）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1启用 2停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_code` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐模板表（规格定义）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_system_config`
--

DROP TABLE IF EXISTS `sys_system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_system_config` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `config_key` varchar(100) NOT NULL COMMENT '配置键（英文，唯一）',
  `config_value` varchar(500) DEFAULT NULL COMMENT '配置值（字符串存储，按 value_type 解析）',
  `config_name` varchar(200) NOT NULL COMMENT '配置名称（页面展示）',
  `config_group` varchar(50) NOT NULL DEFAULT 'monitor' COMMENT '分组：monitor监控 / tenant租户 / general通用',
  `value_type` varchar(20) NOT NULL DEFAULT 'int' COMMENT '值类型：int / long / bool / string',
  `default_value` varchar(500) DEFAULT NULL COMMENT '默认值（恢复默认时使用）',
  `remark` varchar(500) DEFAULT NULL COMMENT '说明',
  `editable` tinyint NOT NULL DEFAULT '1' COMMENT '是否允许页面修改：0否（系统内置） 1是',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`),
  KEY `idx_group` (`config_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant`
--

DROP TABLE IF EXISTS `sys_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_tenant` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_code` varchar(56) NOT NULL COMMENT '唯一标识（UUID）',
  `org_name` varchar(255) DEFAULT NULL COMMENT '机构名称',
  `contact` varchar(255) DEFAULT NULL COMMENT '联系人',
  `phone` varchar(255) DEFAULT NULL COMMENT '电话号码',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1正常 2停用 3已退租 4已过期',
  `package_id` bigint DEFAULT '0' COMMENT '套餐模板ID（sys_package_template.id，0=未指定模板）',
  `industry_id` bigint DEFAULT NULL COMMENT '所属行业ID，关联sys_industry.id；NULL 表示未指定',
  `expire_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '过期时间',
  `offline_time` datetime DEFAULT NULL COMMENT '退租/停用时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '软删除标记：0正常 1已删除（保留可恢复）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`tenant_code`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant_package`
--

DROP TABLE IF EXISTS `sys_tenant_package`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_tenant_package` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL COMMENT '租户ID（唯一，对应sys_tenant.id）',
  `course_limit` int NOT NULL DEFAULT '0' COMMENT '课程数量限额（0=不限）',
  `course_current` int NOT NULL DEFAULT '0' COMMENT '课程当前数量',
  `schedule_limit` int NOT NULL DEFAULT '0' COMMENT '课程排期数量限额（0=不限）',
  `schedule_current` int NOT NULL DEFAULT '0' COMMENT '排期当前数量',
  `user_total_limit` int NOT NULL DEFAULT '0' COMMENT '注册用户总数限额（0=不限）',
  `user_current` int NOT NULL DEFAULT '0' COMMENT '注册用户当前数量',
  `teacher_limit` int NOT NULL DEFAULT '0' COMMENT '注册教师数量限额（0=不限）',
  `teacher_current` int NOT NULL DEFAULT '0' COMMENT '注册教师当前数量',
  `student_limit` int NOT NULL DEFAULT '0' COMMENT '注册学生数量限额（0=不限）',
  `student_current` int NOT NULL DEFAULT '0' COMMENT '注册学生当前数量',
  `teacher_publish_limit` int NOT NULL DEFAULT '0' COMMENT '教师信息发布数量限额（0=不限）',
  `teacher_publish_current` int NOT NULL DEFAULT '0' COMMENT '教师信息发布当前数量',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户套餐额度表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant_stats_monthly`
--

DROP TABLE IF EXISTS `sys_tenant_stats_monthly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_tenant_stats_monthly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL COMMENT '租户ID',
  `stat_month` char(7) NOT NULL COMMENT '统计月份（yyyy-MM）',
  `teacher_count` int NOT NULL DEFAULT '0' COMMENT '教师数（status=active）',
  `student_count` int NOT NULL DEFAULT '0' COMMENT '学生数（status=active）',
  `course_count` int NOT NULL DEFAULT '0' COMMENT '课程数',
  `schedule_count` int NOT NULL DEFAULT '0' COMMENT '排期数',
  `booking_count` int NOT NULL DEFAULT '0' COMMENT '预约数',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_month` (`tenant_id`,`stat_month`),
  KEY `idx_month` (`stat_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户月度用量快照';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_term`
--

DROP TABLE IF EXISTS `sys_term`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_term` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `term_key` varchar(64) NOT NULL COMMENT '词条编码（业务标识，如 course/teacher/student）',
  `term_name` varchar(64) NOT NULL COMMENT '显示词（该作用域下的词汇值）',
  `language` varchar(16) NOT NULL DEFAULT 'zh' COMMENT '语言代码（ISO 639-1：zh中文/en英语/fr法语）',
  `term_type` varchar(32) NOT NULL DEFAULT 'label' COMMENT '用途：label标签/menu菜单/button按钮/tip提示',
  `industry_id` bigint NOT NULL DEFAULT '0' COMMENT '所属行业：0=平台级，>0=该行业',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '所属租户：0=平台/行业级，>0=租户自定义',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '同级排序（菜单顺序可用）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1启用 0停用（停用=该级回退到下一级）',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scope_key` (`term_key`,`industry_id`,`tenant_id`,`language`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_industry` (`industry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业专业词汇表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_user_session`
--

DROP TABLE IF EXISTS `sys_user_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_session` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) NOT NULL COMMENT '会话ID（JWT签名前使用UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台管理员）',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `user_role` varchar(20) DEFAULT NULL COMMENT '角色：student/teacher/admin/platform_admin',
  `ip` varchar(64) DEFAULT NULL COMMENT '登录IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '客户端标识',
  `login_time` datetime NOT NULL COMMENT '登录时间',
  `last_active` datetime NOT NULL COMMENT '最近活跃时间',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1在线 2已登出 3已过期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session` (`session_id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_last_active` (`last_active`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户会话表（在线统计）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teacher_available_time`
--

DROP TABLE IF EXISTS `teacher_available_time`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_available_time` (
  `available_id` varchar(36) NOT NULL COMMENT '涓婚敭UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联教师user_id',
  `start_time` time NOT NULL COMMENT '时段开始 如 09:00:00',
  `end_time` time NOT NULL COMMENT '时段结束 如 17:00:00',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT 'active/frozen',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `repeat_type` varchar(10) DEFAULT 'none' COMMENT 'none/day/week/month',
  `repeat_interval` int DEFAULT '1' COMMENT '重复间隔',
  `repeat_days` varchar(100) DEFAULT NULL COMMENT '逗号分隔的日期数字，如 1,3,5',
  `start_date` varchar(10) DEFAULT NULL COMMENT 'YYYY-MM-DD',
  `end_date` varchar(10) DEFAULT NULL COMMENT 'YYYY-MM-DD',
  `optioned` int DEFAULT '0' COMMENT '是否选项-优选提供给用户 0 -- 否 1 -- 是 ',
  `schedule_id` varchar(36) DEFAULT NULL COMMENT '预约时间表ID',
  PRIMARY KEY (`available_id`),
  KEY `idx_teacher_day` (`teacher_id`),
  KEY `idx_teacher_date` (`teacher_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tat_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='教师可预约时间表（周模板+按日覆盖）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teacher_certificate`
--

DROP TABLE IF EXISTS `teacher_certificate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_certificate` (
  `certificate_id` varchar(36) NOT NULL COMMENT '涓婚敭UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联教师user_id',
  `cert_name` varchar(100) DEFAULT NULL COMMENT '证书名称',
  `cert_url` varchar(500) DEFAULT NULL COMMENT '证书图片URL',
  `cert_base64` mediumtext COMMENT '证书图片Base64（兼容）',
  `sort_no` int DEFAULT '0' COMMENT '排序号，小在前',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`certificate_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tc_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='教师资格证书表(1:N)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teacher_professional`
--

DROP TABLE IF EXISTS `teacher_professional`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_professional` (
  `teacher_professional_id` varchar(36) NOT NULL COMMENT '涓婚敭UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联user表user_id（仅限role=teacher）',
  `optioned_teacher_link` varchar(36) DEFAULT NULL COMMENT '教师的id 用来链接到排期表',
  `subject` varchar(50) DEFAULT NULL COMMENT '学科（冗余user.language_type，便于排序搜索）',
  `personal_photo_url` varchar(500) DEFAULT NULL COMMENT '个人照片URL（静态文件路径，优先）',
  `personal_photo_base64` mediumtext COMMENT '个人照片Base64（与URL二选一，兼容旧qualification方式）',
  `bio_text` varchar(2000) DEFAULT NULL COMMENT '文字说明（教师简介）',
  `bio_url` varchar(500) DEFAULT NULL COMMENT '文字说明链接（外部简历/博客URL）',
  `availability_rule` varchar(1000) DEFAULT NULL COMMENT '可预约时间规则（结构化JSON，冗余字段便于快速展示）',
  `optioned_teacher_scheduleId` varchar(36) DEFAULT NULL COMMENT '教师的排期scheduleId',
  `min_booking_hours` int DEFAULT '4' COMMENT '单次可预约最少课时数（如4小时）',
  `weekly_available_hours` int DEFAULT '20' COMMENT '每周可预约总课时上限',
  `certificate_text` varchar(500) DEFAULT NULL COMMENT '证书文字描述（如CET-8、JLPT N1）',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT '职业信息状态active/inactive/frozen',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`teacher_professional_id`),
  UNIQUE KEY `uk_teacher_id` (`teacher_id`) COMMENT '一个教师只能有一条职业信息',
  KEY `idx_subject` (`subject`) COMMENT '学科索引',
  KEY `idx_status` (`status`) COMMENT '状态索引',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tp_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='教师职业信息主表(1:1 user teacher)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teacher_published_profile`
--

DROP TABLE IF EXISTS `teacher_published_profile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_published_profile` (
  `published_profile_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '涓婚敭UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联user表user_id(role=teacher)',
  `teacher_professional_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '生成时对应的职业信息版本ID，方便回溯',
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '教师信息' COMMENT '发布标题（如"英语教师-张三的个人介绍"）',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft草稿/published发布/archived归档。',
  `field_config` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '字段勾选与排序 JSON: [{key,label,enabled,sort}]',
  `style_config` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '样式配置 JSON: {fontFamily,fontSizePx,titleSizePx,photoSizePx,certSizePx,accentColor,bgColor}',
  `draft_data` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '临时保存的原始数据快照 JSON（进入编辑时回填）',
  `static_html` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '发布后生成的完整静态HTML页面（内嵌图片Base64），独立可下载',
  `published_at` datetime DEFAULT NULL COMMENT '最后一次发布时间',
  `published_by_user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发布操作人 user_id',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`published_profile_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_status` (`status`),
  KEY `idx_teacher_status` (`teacher_id`,`status`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教师发布信息/转发配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `user_id` varchar(36) NOT NULL COMMENT '用户唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `account` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(100) NOT NULL COMMENT '加密后的密码（BCrypt加密，长度8-20位，含字母和数字）',
  `role` varchar(32) NOT NULL COMMENT '角色（student/teacher/admin/platform_admin）',
  `learn_goal` varchar(200) DEFAULT NULL COMMENT '学生学习目标（学生专属）',
  `language_level` varchar(20) DEFAULT NULL COMMENT '学生语言水平（枚举：入门/进阶/中级/高级/精进，学生专属）',
  `name` varchar(255) DEFAULT NULL,
  `qualification` text COMMENT '教师资质图片（Base64编码，教师专属）',
  `language_type` varchar(20) DEFAULT NULL COMMENT '教师教授语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语，教师专属）',
  `status` varchar(10) NOT NULL COMMENT '账号状态（active：激活，inactive：待审核，frozen：冻结）',
  `last_active_time` datetime DEFAULT NULL COMMENT '最近活跃时间',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_account_tenant` (`account`,`tenant_id`),
  UNIQUE KEY `uk_phone` (`phone`) COMMENT '手机号唯一',
  UNIQUE KEY `uk_email` (`email`) COMMENT '邮箱唯一',
  KEY `idx_role` (`role`) COMMENT '角色索引，用于权限查询',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于账号启停/冻结查询',
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_tenant_active` (`tenant_id`,`last_active_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表（学生、教师、管理员）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_refresh_token`
--

DROP TABLE IF EXISTS `user_refresh_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_refresh_token` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '涓婚敭',
  `user_id` varchar(36) NOT NULL COMMENT '登录用户ID',
  `refresh_token` varchar(512) NOT NULL COMMENT '刷新凭证',
  `expire_time` datetime NOT NULL COMMENT '过期时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_refresh_token` (`refresh_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户刷新Token持久化表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-06 11:14:42
