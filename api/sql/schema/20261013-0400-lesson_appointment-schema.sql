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
-- Table structure for table `appointment`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `appointment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `appointment` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '唯一编号',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '预约id',
  `class_index` int DEFAULT '1' COMMENT '课时序号',
  `appointment_datetime` datetime DEFAULT NULL COMMENT '课程时间（UTC），由排期本地时间按 course_schedule.time_zone 换算写入',
  `last_datetime` datetime DEFAULT NULL COMMENT '改期前原课程时间（UTC）',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT '最后预约时间的状态:active生效/noted1、已发通知/completed已完成/已改期cancelled/申请取消cancelling',
  `refund_snapshot` text COMMENT '退款档位快照(JSON: snapshotAt+hint，在提交申请时按提交时刻判定；管理端审核按快照执行)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_appt_booking_class` (`booking_id`,`class_index`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_appt_datetime_status` (`appointment_datetime`,`status`),
  KEY `idx_appt_booking_id` (`booking_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1127 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预约时间列表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_log`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `log_id` varchar(36) NOT NULL COMMENT '日志唯一标识（UUID）',
  `user_id` varchar(36) DEFAULT NULL COMMENT '操作人ID',
  `user_name` varchar(100) DEFAULT NULL COMMENT '操作人账号姓名',
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
) ENGINE=InnoDB AUTO_INCREMENT=2109688323012386818 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审计日志表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bak_appointment_20261008`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `bak_appointment_20261008`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `bak_appointment_20261008` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '唯一编号',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '预约id',
  `class_index` int DEFAULT '1' COMMENT '课时序号',
  `appointment_datetime` datetime DEFAULT NULL COMMENT '排期预约中的一个课程时间',
  `last_datetime` datetime DEFAULT NULL COMMENT '可被修改前的日期时间',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT '最后预约时间的状态:active生效/noted1、已发通知/completed已完成/已改期cancelled/申请取消cancelling',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_appt_datetime_status` (`appointment_datetime`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=412 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='预约时间列表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bak_booking_20261008`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `bak_booking_20261008`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `bak_booking_20261008` (
  `booking_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '预约唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `schedule_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '关联的课程排期ID',
  `teacher_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `student_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'booked' COMMENT '预约状态（booked：已预约，cancelled：已取消，completed：已完成）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bak_notif_log_20261008`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `bak_notif_log_20261008`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `bak_notif_log_20261008` (
  `id` bigint NOT NULL DEFAULT '0' COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（冗余，便于按租户审计）',
  `appointment_id` int NOT NULL COMMENT '课次ID appointment.id',
  `booking_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '订单ID（冗余，便于查询）',
  `rule_id` bigint DEFAULT NULL COMMENT '发送时所用规则头ID（审计快照）',
  `seq` tinyint NOT NULL COMMENT '本次发送的档位序号',
  `stage` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '本次发送的档位码（审计快照）',
  `offset_minutes` int NOT NULL COMMENT '发送时该档的提前量（审计快照，规则之后可能被改）',
  `expect_time` datetime NOT NULL COMMENT '应发时刻 = 上课时刻 - offset_minutes',
  `receiver_user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '收件人用户ID',
  `receiver_role` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '收件人角色（审计快照）',
  `trigger_type` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'AUTO' COMMENT '触发方式 AUTO自动任务/MANUAL管理员手动',
  `operator_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '手动发送时的操作管理员ID',
  `dedup_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'AUTO' COMMENT '幂等键：AUTO=自动仅一次；MANUAL#时间戳=手动可重复',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '实际发送时刻',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'SENT' COMMENT '发送结果 SENT/FAILED',
  `error_msg` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '失败原因'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bak_notification_dispatch_log_20261008`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `bak_notification_dispatch_log_20261008`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `bak_notification_dispatch_log_20261008` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（冗余，便于按租户审计）',
  `appointment_id` int NOT NULL COMMENT '课次ID appointment.id',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '订单ID（冗余，便于查询）',
  `rule_id` bigint DEFAULT NULL COMMENT '发送时所用规则头ID（审计快照）',
  `seq` tinyint NOT NULL COMMENT '本次发送的档位序号',
  `stage` varchar(16) DEFAULT NULL COMMENT '本次发送的档位码（审计快照）',
  `offset_minutes` int NOT NULL COMMENT '发送时该档的提前量（审计快照，规则之后可能被改）',
  `expect_time` datetime NOT NULL COMMENT '应发时刻 = 上课时刻 - offset_minutes',
  `receiver_user_id` varchar(36) NOT NULL COMMENT '收件人用户ID',
  `receiver_role` varchar(16) DEFAULT NULL COMMENT '收件人角色（审计快照）',
  `trigger_type` varchar(8) NOT NULL DEFAULT 'AUTO' COMMENT '触发方式 AUTO自动任务/MANUAL管理员手动',
  `operator_id` varchar(36) DEFAULT NULL COMMENT '手动发送时的操作管理员ID',
  `dedup_key` varchar(64) NOT NULL DEFAULT 'AUTO' COMMENT '幂等键：AUTO=自动仅一次；MANUAL#时间戳=手动可重复',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '实际发送时刻',
  `status` varchar(16) NOT NULL DEFAULT 'SENT' COMMENT '发送结果 SENT/FAILED',
  `error_msg` varchar(255) DEFAULT NULL COMMENT '失败原因',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dispatch_once` (`appointment_id`,`seq`,`receiver_user_id`,`dedup_key`),
  KEY `idx_dispatch_appointment` (`appointment_id`),
  KEY `idx_dispatch_expect` (`expect_time`)
) ENGINE=InnoDB AUTO_INCREMENT=201 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知发送流水（自动发送同档同人仅一次，手动不受限）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `booking`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `booking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `booking` (
  `booking_id` varchar(36) NOT NULL COMMENT '预约唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `schedule_id` varchar(36) NOT NULL COMMENT '关联的课程排期ID',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `status` varchar(20) NOT NULL DEFAULT 'booked' COMMENT '预约状态（booked：已预约，cancelled：已取消，completed：已完成）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`booking_id`),
  UNIQUE KEY `uk_booking_schedule_student` (`schedule_id`,`student_id`),
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course` (
  `course_id` varchar(36) NOT NULL COMMENT '课程唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `template_id` varchar(36) NOT NULL COMMENT '关联的课程模板ID',
  `language_type` varchar(20) NOT NULL DEFAULT '' COMMENT '课程/咨询类型（classType 的 code；创建课程时从模板继承）',
  `work_language` varchar(20) NOT NULL DEFAULT '' COMMENT '授课语言（创建课程时从模板继承；空=未指定）',
  `class_duration` int NOT NULL DEFAULT '60' COMMENT '课时长度（分钟，创建课程时从模板导入）',
  `course_name` varchar(50) NOT NULL COMMENT '课程名称（2-50字）',
  `content` varchar(1000) NOT NULL COMMENT '教学内容（0-1000字）',
  `feature` varchar(1000) NOT NULL COMMENT '课程特色（0-1000字）',
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_check_in`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_check_in` (
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_evaluation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_evaluation` (
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_feedback` (
  `feedback_id` varchar(36) NOT NULL COMMENT '反馈唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `user_id` varchar(36) NOT NULL COMMENT '关联的用户ID（对应user表的user_id）',
  `content` varchar(1000) DEFAULT NULL COMMENT '反馈内容（最大1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `handle_id` varchar(36) NOT NULL COMMENT '管理员关联的用户ID（对应user表的user_id）',
  `handle_status` varchar(36) NOT NULL COMMENT '处理状态：0 pending（待处理）1 handled（已处理）',
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
-- Table structure for table `course_notify_rule`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_notify_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_notify_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL DEFAULT '' COMMENT '课程ID；空串=本租户默认规则',
  `name` varchar(64) DEFAULT NULL COMMENT '规则名（仅界面显示）',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '整组是否启用：0=视为未配置，回落租户默认',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notify_rule_tenant_course` (`tenant_id`,`course_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程上课通知规则（规则头；整组覆盖）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_notify_rule_point`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_notify_rule_point`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_notify_rule_point` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `rule_id` bigint NOT NULL COMMENT '规则头ID course_notify_rule.id',
  `seq` tinyint NOT NULL COMMENT '档位序号 1..N，越大离上课越近；要求 offset_minutes 随 seq 严格递减',
  `stage` varchar(16) NOT NULL COMMENT '档位码 PRE_FIRST首次预告/PRE_AGAIN再次预告/PRE_SOON课前预告/FINAL_CALL最后提示',
  `offset_minutes` int NOT NULL COMMENT '课前偏移分钟（>0）：应发时刻 = 上课时刻 - 本值',
  `input_unit` varchar(8) NOT NULL DEFAULT 'hour' COMMENT '录入粒度 day/hour/minute（仅界面回显，不参与计算）',
  `audience` varchar(16) NOT NULL DEFAULT 'BOTH' COMMENT '接收人 STUDENT/TEACHER/BOTH',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '该档是否启用（停用用本列，不删行，保持 seq 无洞）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_point_rule_seq` (`rule_id`,`seq`),
  KEY `idx_point_rule` (`rule_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程上课通知时间点（明细行）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_refund_rule`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_refund_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_refund_rule` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL DEFAULT '' COMMENT '课程ID；空串=本租户默认规则',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用：1启用 0停用（停用后视为未配置，回落到租户默认）',
  `free_before_minutes` int NOT NULL DEFAULT '1440' COMMENT '免责线（分钟）：提前量≥该值免收退改费用',
  `free_unit` varchar(8) NOT NULL DEFAULT 'hour' COMMENT '免责线录入粒度：hour/minute（仅界面回显用）',
  `partial_before_minutes` int NOT NULL DEFAULT '720' COMMENT '部分退费线（分钟）：提前量≥该值且不足免责线，按比例退费',
  `partial_unit` varchar(8) NOT NULL DEFAULT 'hour' COMMENT '部分退费线录入粒度：hour/minute（仅界面回显用）',
  `partial_refund_percent` int NOT NULL DEFAULT '50' COMMENT '部分退费比例（%）：0-100',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_rule_tenant_course` (`tenant_id`,`course_id`),
  KEY `idx_refund_rule_course` (`course_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程退改规则（免责/部分退费/不退费时间点）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_schedule`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '排期唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `name` varchar(56) NOT NULL DEFAULT 'noname' COMMENT '排期名称',
  `course_id` varchar(36) NOT NULL COMMENT '关联的教师课程ID',
  `language_type` varchar(20) NOT NULL DEFAULT '' COMMENT '课程/咨询类型（classType 的 code；默认取自课程，可在本条排期覆盖）',
  `work_language` varchar(20) NOT NULL DEFAULT '' COMMENT '授课语言（默认取自课程，可在本条排期覆盖；空=跟随课程）',
  `class_duration` int NOT NULL DEFAULT '60' COMMENT '课时长度（分钟，默认取自课程，可在本条排期覆盖）',
  `time_zone` varchar(36) NOT NULL COMMENT '排期所用的时区',
  `start_time` datetime NOT NULL COMMENT '排期开始时间（格式：YYYY-MM-DD HH:mm:ss，包含起始日期）',
  `end_time` datetime NOT NULL COMMENT '排期结束时间（格式：YYYY-MM-DD HH:mm:ss）',
  `repeat_type` tinyint(1) DEFAULT '0' COMMENT '重复类型：0=不重复，1=每天，2=每周，3=每月',
  `repeat_interval` tinyint(1) DEFAULT '1' COMMENT '重复间隔（如每2周一次=2）',
  `repeat_days` varchar(255) DEFAULT NULL COMMENT '重复的星期几：1=周一，2=周二...7=周日，逗号分隔（仅repeat_type=2时有效），type=3时为1-31,当月的那几天',
  `available_sites` tinyint(1) NOT NULL DEFAULT '1' COMMENT '可预约席位总数（非剩余席位；剩余 = 该值 - 占位预订数）',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '排期状态（pending/active/inactive/frozen/overtime：已结束（自动更新））',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `idx_start_end_time` (`start_time`,`end_time`) COMMENT '时间索引，用于排期冲突校验',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于可预约排期查询',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_schedule_chk_1` CHECK ((`end_time` > `start_time`)),
  CONSTRAINT `course_schedule_chk_sites` CHECK ((`available_sites` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程排期表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_template`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `course_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `course_template` (
  `template_id` varchar(36) NOT NULL COMMENT '模板唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `language_type` varchar(20) NOT NULL COMMENT '课程/咨询类型（classType 的 code，显示词由 sys_term 按行业渲染：教育=法语/英语，法律=婚姻/劳动…）',
  `work_language` varchar(20) NOT NULL DEFAULT '' COMMENT '授课语言（用哪种语言上课；代码取自 sys_work_language.lang_code；空=未指定）',
  `difficulty_level` varchar(20) NOT NULL COMMENT '难度等级（枚举：入门/进阶/中级/高级）',
  `class_fee` decimal(10,2) NOT NULL COMMENT '课时费（≥0，保留2位小数）',
  `class_duration` int NOT NULL COMMENT '课程时长（≥15，15的倍数，单位：分钟）',
  `class_form` varchar(20) NOT NULL COMMENT '课程形式（枚举：一对一/小班课/大班课）',
  `description` varchar(500) NOT NULL COMMENT '课程描述（0-500字）',
  `status` varchar(10) NOT NULL DEFAULT 'inactive' COMMENT '模板状态（active：激活，inactive：待审核，frozen：冻结）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_tenant_lang_level` (`tenant_id`,`language_type`,`difficulty_level`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notification_dispatch_log`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `notification_dispatch_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `notification_dispatch_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（冗余，便于按租户审计）',
  `appointment_id` int NOT NULL COMMENT '课次ID appointment.id',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '订单ID（冗余，便于查询）',
  `rule_id` bigint DEFAULT NULL COMMENT '发送时所用规则头ID（审计快照）',
  `seq` tinyint NOT NULL COMMENT '本次发送的档位序号',
  `stage` varchar(16) DEFAULT NULL COMMENT '本次发送的档位码（审计快照）',
  `offset_minutes` int NOT NULL COMMENT '发送时该档的提前量（审计快照，规则之后可能被改）',
  `expect_time` datetime NOT NULL COMMENT '应发时刻 = 上课时刻 - offset_minutes',
  `receiver_user_id` varchar(36) NOT NULL COMMENT '收件人用户ID',
  `receiver_role` varchar(16) DEFAULT NULL COMMENT '收件人角色（审计快照）',
  `trigger_type` varchar(8) NOT NULL DEFAULT 'AUTO' COMMENT '触发方式 AUTO自动任务/MANUAL管理员手动',
  `operator_id` varchar(36) DEFAULT NULL COMMENT '手动发送时的操作管理员ID',
  `dedup_key` varchar(64) NOT NULL DEFAULT 'AUTO' COMMENT '幂等键：AUTO=自动仅一次；MANUAL#时间戳=手动可重复',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '实际发送时刻',
  `status` varchar(16) NOT NULL DEFAULT 'SENT' COMMENT '发送结果 SENT/FAILED',
  `error_msg` varchar(255) DEFAULT NULL COMMENT '失败原因',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dispatch_once` (`appointment_id`,`seq`,`receiver_user_id`,`dedup_key`),
  KEY `idx_dispatch_appointment` (`appointment_id`),
  KEY `idx_dispatch_expect` (`expect_time`)
) ENGINE=InnoDB AUTO_INCREMENT=269 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知发送流水（自动发送同档同人仅一次，手动不受限）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `promo_achievement`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `promo_achievement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `promo_achievement` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `promoter_user_id` varchar(36) NOT NULL,
  `promoter_tenant_id` bigint NOT NULL,
  `total_clicks` int NOT NULL DEFAULT '0' COMMENT '总点击数',
  `total_registered` int NOT NULL DEFAULT '0' COMMENT '成功注册人数',
  `total_approved` int NOT NULL DEFAULT '0' COMMENT '审批通过人数',
  `total_paid` int NOT NULL DEFAULT '0' COMMENT '成功缴费人数',
  `total_tenants_created` int NOT NULL DEFAULT '0' COMMENT '路径1：促成新建租户数',
  `total_wx_registered` int NOT NULL DEFAULT '0' COMMENT '微信直接注册人数',
  `total_reward_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '累计奖励金额',
  `last_conversion_at` datetime DEFAULT NULL,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_promoter` (`promoter_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广者业绩汇总';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `promo_conversion`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `promo_conversion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `promo_conversion` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `referral_code` varchar(32) NOT NULL COMMENT '使用的推广码',
  `promoter_user_id` varchar(36) NOT NULL COMMENT '推广者',
  `invitee_user_id` varchar(36) NOT NULL COMMENT '被邀请者 user_id（注册成功后写入，非空）',
  `invitee_tenant_id` bigint DEFAULT NULL COMMENT '被邀请者所属租户',
  `path_type` tinyint NOT NULL COMMENT '1=自助建租户 2=指定租户注册',
  `tenant_code` varchar(8) DEFAULT NULL COMMENT '路径1：新建的租户编码',
  `stage` varchar(20) NOT NULL DEFAULT 'registered' COMMENT 'registered/approved/paid/expired',
  `source` varchar(32) DEFAULT NULL COMMENT 'share/landing/qrcode/we/direct',
  `register_ip` varchar(64) DEFAULT NULL COMMENT '注册来源IP（防刷：单IP每时限频）',
  `register_phone_hmac` varchar(128) DEFAULT NULL COMMENT '注册手机号HMAC索引（防刷：同手机号限频；不明文存储）',
  `registered_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `reward_status` varchar(20) DEFAULT NULL COMMENT 'pending/granted/failed',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conversion_invitee` (`invitee_user_id`) COMMENT '一个被邀请者只归因一次',
  KEY `idx_promoter_stage` (`promoter_user_id`,`stage`),
  KEY `idx_referral_code` (`referral_code`),
  KEY `idx_registered_at` (`registered_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广转化记录表（点击仅计数，不落明细）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `promo_referral`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `promo_referral`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `promo_referral` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `referral_code` varchar(32) NOT NULL COMMENT '推广码（全局唯一）',
  `promoter_user_id` varchar(36) NOT NULL COMMENT '推广者 user_id',
  `promoter_tenant_id` bigint NOT NULL COMMENT '推广者所属租户',
  `target_tenant_id` bigint DEFAULT NULL COMMENT '路径2：指定目标租户（NULL=路径1自助建租户）',
  `path_type` tinyint NOT NULL COMMENT '1=自助建租户 2=指定租户注册',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  `expire_time` datetime DEFAULT NULL COMMENT 'NULL=永不过期',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_referral_code` (`referral_code`),
  UNIQUE KEY `uk_promoter_scope` (`promoter_user_id`,`path_type`,`target_tenant_id`),
  KEY `idx_promoter` (`promoter_user_id`),
  KEY `idx_target_tenant` (`target_tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='推广码表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_industry`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_industry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_industry` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `code` varchar(50) NOT NULL COMMENT '行业编码（唯一，如 edu/it/medical）',
  `name` varchar(100) NOT NULL COMMENT '行业名称（页面展示）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1启用 0停用',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_metric_hourly`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_metric_hourly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_metric_hourly` (
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
) ENGINE=InnoDB AUTO_INCREMENT=221 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统指标小时聚合';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_metric_sample`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_metric_sample`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_metric_sample` (
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
) ENGINE=InnoDB AUTO_INCREMENT=13540 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统指标采样明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_package_template`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_package_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_package_template` (
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='套餐模板表（规格定义）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_system_config`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_system_config` (
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
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统配置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_tenant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_tenant` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_code` varchar(56) NOT NULL COMMENT '唯一标识（UUID）',
  `org_name` varchar(255) DEFAULT NULL COMMENT '机构名称',
  `contact` varchar(255) DEFAULT NULL COMMENT '联系人',
  `phone` varchar(255) DEFAULT NULL COMMENT '电话号码',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '状态：1正常 2停用 3已退租 4已过期',
  `package_id` bigint DEFAULT '0' COMMENT '套餐模板ID（sys_package_template.id，0=未指定模板）',
  `industry_id` bigint DEFAULT NULL COMMENT '所属行业ID，关联 sys_industry.id；NULL 表示未指定',
  `expire_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '过期时间',
  `offline_time` datetime DEFAULT NULL COMMENT '退租/停用时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `referred_by` varchar(36) DEFAULT NULL COMMENT '推广者 user_id',
  `trial_status` varchar(16) DEFAULT NULL COMMENT 'trial/expired/converted',
  `trial_expire_time` datetime DEFAULT NULL COMMENT '试用到期时间',
  `creator_account` varchar(255) DEFAULT NULL COMMENT '创建者账号（与 tenantCode 关联校验用）',
  `deleted` tinyint NOT NULL DEFAULT '0' COMMENT '软删除标记：0正常 1已删除（保留可恢复）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_code` (`tenant_code`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户信息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant_package`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_tenant_package`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_tenant_package` (
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
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户套餐额度表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant_stats_monthly`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_tenant_stats_monthly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_tenant_stats_monthly` (
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户月度用量快照';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_term`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_term`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_term` (
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
) ENGINE=InnoDB AUTO_INCREMENT=519 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业专业词汇表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_user_session`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_user_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sys_user_session` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) NOT NULL COMMENT '会话ID（JWT签名前缀UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台管理员）',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `user_role` varchar(20) DEFAULT NULL COMMENT '角色：student/teacher/admin/platform_admin',
  `ip` varchar(64) DEFAULT NULL COMMENT '登录IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '客户端标志',
  `login_time` datetime NOT NULL COMMENT '登录时间',
  `last_active` datetime NOT NULL COMMENT '最近活跃时间',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1在线 2已退出 3已过期',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session` (`session_id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_last_active` (`last_active`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=196 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户会话表（在线统计）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_work_language`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `sys_work_language`;
--
-- 本表定义与 20261025-1700-work-language.sql 完全重复（该文件是 work_language
-- 特性的手写权威定义，含幂等种子数据）。两份 CREATE 并存会触发 ddl-align 守卫的
-- "DDL 基线冲突"判红，故本段整段注释停用；本 dump 中无任何 INSERT/FK 依赖本表。
-- 如需查看原始列结构，见 20261025-1700-work-language.sql 第 55-68 行。
-- CREATE TABLE IF NOT EXISTS `sys_work_language` (
--   `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
--   `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '作用域：0=平台内置项，>0=租户自定义项',
--   `lang_code` varchar(20) NOT NULL COMMENT '授课语言代码（小写，如 english/french/chinese/german/spanish/turkish）',
--   `name_zh` varchar(64) NOT NULL COMMENT '中文显示名',
--   `name_en` varchar(64) NOT NULL DEFAULT '' COMMENT '英文显示名',
--   `name_fr` varchar(64) NOT NULL DEFAULT '' COMMENT '法文显示名',
--   `sort_order` int NOT NULL DEFAULT '0' COMMENT '同级排序（小者在前）',
--   `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
--   `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `uk_tenant_code` (`tenant_id`,`lang_code`),
--   KEY `idx_tenant` (`tenant_id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='授课语言枚举（work_language）：平台内置项 tenant_id=0，租户可追加自定义项';

--
-- Table structure for table `teacher_available_time`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `teacher_available_time`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `teacher_available_time` (
  `available_id` varchar(36) NOT NULL COMMENT '主键UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联教师user_id',
  `start_time` time NOT NULL COMMENT '时间开始 如 09:00:00',
  `end_time` time NOT NULL COMMENT '时间结束 如 17:00:00',
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `teacher_certificate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `teacher_certificate` (
  `certificate_id` varchar(36) NOT NULL COMMENT '主键UUID',
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `teacher_professional`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `teacher_professional` (
  `teacher_professional_id` varchar(36) NOT NULL COMMENT '主键UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联user表user_id（仅限role=teacher）',
  `optioned_teacher_link` varchar(36) DEFAULT NULL COMMENT '教师的id 用来链接到排期表',
  `subject` varchar(50) DEFAULT NULL COMMENT '学科（冗余user.language_type，便于排序搜索）',
  `personal_photo_url` varchar(500) DEFAULT NULL COMMENT '个人照片URL（静态文件路径，优先）',
  `personal_photo_base64` mediumtext COMMENT '个人照片Base64（与URL二选一，兼容旧qualification方式）',
  `bio_text` varchar(2000) DEFAULT NULL COMMENT '文字说明（教师简介）',
  `bio_url` varchar(500) DEFAULT NULL COMMENT '文字说明链接（如简历博客URL）',
  `availability_rule` varchar(1000) DEFAULT NULL COMMENT '可预约时间规则（结构化JSON，冗余字段便于快速展示）',
  `optioned_teacher_scheduleId` varchar(36) DEFAULT NULL COMMENT '教师的排期scheduleId',
  `min_booking_hours` int DEFAULT '4' COMMENT '单次可预约最小课时数（如4小时）',
  `weekly_available_hours` int DEFAULT '20' COMMENT '每周可预约课时上限',
  `certificate_text` varchar(500) DEFAULT NULL COMMENT '证书文字描述（如CET-8、JLPT N1）',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT '职业信息状态 active/inactive/frozen',
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `teacher_published_profile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `teacher_published_profile` (
  `published_profile_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '主键UUID',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `teacher_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联user表user_id(role=teacher)',
  `teacher_professional_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '生成时对应的职业信息版本ID，方便回源',
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '教师信息' COMMENT '发布标题（如“英语教师-张三的个人介绍”）',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft草稿/published发布/archived归档',
  `field_config` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '字段勾选与排序 JSON: [{key,label,enabled,sort}]',
  `style_config` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '样式配置 JSON: {fontFamily,fontSizePx,titleSizePx,photoSizePx,certSizePx,accentColor,bgColor}',
  `draft_data` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '临时保存的原始数据快照 JSON（进入编辑时回填）',
  `static_html` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '发布后生成的完整静态HTML页面（内嵌图片base64），独立可下载',
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `user` (
  `user_id` varchar(36) NOT NULL COMMENT '用户唯一标识（UUID）',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `account` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(100) NOT NULL COMMENT '加密后的密码（BCrypt加密，长度8-20位，含字母和数字）',
  `role` varchar(32) NOT NULL COMMENT '角色（student/teacher/admin/platform_admin）',
  `learn_goal` varchar(200) DEFAULT NULL COMMENT '学生学习目标（学生专属）',
  `language_level` varchar(20) DEFAULT NULL COMMENT '学生语言水平（枚举：入门/进阶/中级/高级/精通，学生专属）',
  `name` varchar(255) DEFAULT NULL,
  `qualification` text COMMENT '教师资质图片（Base64编码，教师专属）',
  `language_type` varchar(20) DEFAULT NULL COMMENT '教师教授语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语，教师专属）',
  `status` varchar(10) NOT NULL COMMENT '账号状态（active：激活，inactive：待审核，frozen：冻结）',
  `last_active_time` datetime DEFAULT NULL COMMENT '最近活跃时间',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_user_account_tenant` (`account`,`tenant_id`),
  KEY `idx_phone` (`phone`) COMMENT '手机号检索（不再全局唯一：多租户允许同手机跨租户注册 / 同租户多用户共用）',
  KEY `idx_email` (`email`) COMMENT '邮箱检索（不再全局唯一）',
  KEY `idx_role` (`role`) COMMENT '角色索引，用于权限查询',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于账号审核/冻结查询',
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_tenant_active` (`tenant_id`,`last_active_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表（学生、教师、管理员）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_refresh_token`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `user_refresh_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `user_refresh_token` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` varchar(36) NOT NULL COMMENT '登录用户ID',
  `refresh_token` varchar(512) NOT NULL COMMENT '刷新令牌',
  `expire_time` datetime NOT NULL COMMENT '过期时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_refresh_token` (`refresh_token`)
) ENGINE=InnoDB AUTO_INCREMENT=255 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户刷新user_refresh_tokenToken持久化表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wx_login_state`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `wx_login_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `wx_login_state` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `state` varchar(64) NOT NULL COMMENT '一次性 state（UUID 无横线），二维码 URL 携带',
  `purpose` varchar(16) NOT NULL DEFAULT 'login' COMMENT 'login=扫码登录 / bind=已登录账号绑微信',
  `user_id` varchar(36) DEFAULT NULL COMMENT 'bind 场景发起用户（服务端从令牌解析）',
  `ip` varchar(64) DEFAULT NULL COMMENT '发起请求 IP（审计用）',
  `status` varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/confirmed/failed',
  `token_json` text COMMENT 'confirmed 且 login 场景的会话 JSON（一次性消费）',
  `error_msg` varchar(255) DEFAULT NULL COMMENT 'failed 原因（透前端展示）',
  `expire_at` datetime NOT NULL COMMENT '过期时间（生成 +5 分钟）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_state` (`state`),
  KEY `idx_expire_at` (`expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='微信 PC 扫码登录/绑定一次性 state';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wx_userid`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `wx_userid`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `wx_userid` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `wx_openid` varchar(64) NOT NULL COMMENT '微信 openid（全局唯一，不随租户隔离）',
  `wx_unionid` varchar(64) DEFAULT NULL COMMENT '跨端统一身份（开放平台 unionid，缺失回退 openid）',
  `user_id` varchar(36) NOT NULL COMMENT '关联的系统用户 user.user_id',
  `tenant_id` bigint NOT NULL COMMENT '用户所属租户（冗余，便于按租户统计）',
  `bind_source` varchar(20) NOT NULL DEFAULT 'manual' COMMENT '关联来源：manual=已有账号绑定 / auto_register=微信直接注册',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wx_openid` (`wx_openid`) COMMENT '一个微信最多关联一个账号',
  UNIQUE KEY `uk_wx_unionid` (`wx_unionid`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='微信 openid 与用户 ID 关联表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-13  4:43:10
