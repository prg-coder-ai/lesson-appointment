-- 数据库: lesson_appointment （建表脚本，基于当前库真实结构导出）
-- 执行前请确保已存在该库: CREATE DATABASE IF NOT EXISTS lesson_appointment DEFAULT CHARSET=utf8mb4;
USE lesson_appointment;

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

DROP TABLE IF EXISTS `appointment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '鍞?竴缂栧彿',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `booking_id` varchar(36) DEFAULT NULL COMMENT '棰勭害id',
  `class_index` int DEFAULT '1' COMMENT '璇炬椂搴忓彿',
  `appointment_datetime` datetime DEFAULT NULL COMMENT '鎺掓湡棰勭害涓?殑涓?釜璇炬椂鏃堕棿',
  `last_datetime` datetime DEFAULT NULL COMMENT '鍙?兘淇?敼鍓嶇殑鏃ユ湡鏃堕棿',
  `status` varchar(16) NOT NULL DEFAULT 'active' COMMENT '鏈??绾︽椂闂寸殑鐘舵?:active鐢熸晥/noted1銆?宸插彂閫氱煡/completed宸插畬鎴?宸叉敼鏈焎ancelled/鐢宠?鍙栨秷cancelling',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=170 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='棰勭害鏃堕棿鍒楄〃';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '鑷??涓婚敭',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `log_id` varchar(36) NOT NULL COMMENT '鏃ュ織鍞?竴鏍囪瘑锛圲UID锛',
  `user_id` varchar(36) DEFAULT NULL COMMENT '鎿嶄綔浜篒D',
  `user_name` varchar(100) DEFAULT NULL COMMENT '鎿嶄綔浜鸿处鍙?濮撳悕',
  `user_role` varchar(20) DEFAULT NULL COMMENT '鎿嶄綔浜鸿?鑹诧紙student/teacher/admin锛',
  `action` varchar(50) NOT NULL COMMENT '鎿嶄綔绫诲瀷',
  `resource_type` varchar(30) DEFAULT NULL COMMENT '鎿嶄綔璧勬簮绫诲瀷',
  `resource_id` varchar(36) DEFAULT NULL COMMENT '鎿嶄綔璧勬簮ID',
  `resource_name` varchar(200) DEFAULT NULL COMMENT '鎿嶄綔璧勬簮鍚嶇О',
  `method` varchar(200) DEFAULT NULL COMMENT '鎵ц?鐨凧ava鏂规硶',
  `request_url` varchar(500) DEFAULT NULL COMMENT '璇锋眰URL',
  `http_method` varchar(10) DEFAULT NULL COMMENT 'HTTP鏂规硶',
  `ip` varchar(50) DEFAULT NULL COMMENT '瀹㈡埛绔疘P',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '瀹㈡埛绔疷ser-Agent',
  `request_params` text COMMENT '璇锋眰鍙傛暟JSON锛堟晱鎰熷瓧娈佃劚鏁忥級',
  `result_status` varchar(20) DEFAULT NULL COMMENT '鎿嶄綔缁撴灉锛坰uccess/fail锛',
  `error_msg` varchar(500) DEFAULT NULL COMMENT '澶辫触鍘熷洜',
  `cost_ms` int DEFAULT NULL COMMENT '鎵ц?鑰楁椂锛堟?绉掞級',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鎿嶄綔鏃堕棿',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_log_id` (`log_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_resource` (`resource_type`,`resource_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2095034822021898242 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='瀹¤?鏃ュ織琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `booking`
--

DROP TABLE IF EXISTS `booking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking` (
  `booking_id` varchar(36) NOT NULL COMMENT '棰勭害鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `schedule_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勮?绋嬫帓鏈烮D',
  `teacher_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勬暀甯圛D锛堝?搴攗ser琛ㄧ殑user_id锛',
  `student_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勫?鐢烮D锛堝?搴攗ser琛ㄧ殑user_id锛',
  `status` varchar(20) NOT NULL DEFAULT 'booked' COMMENT '棰勭害鐘舵?锛坆ooked锛氬凡棰勭害锛宑ancelled锛氬凡鍙栨秷锛宑ompleted锛氬凡瀹屾垚锛',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`booking_id`),
  KEY `fk_schedule_id` (`schedule_id`) COMMENT '鍏宠仈鎺掓湡绱㈠紩',
  KEY `fk_student_id` (`student_id`) COMMENT '鍏宠仈瀛︾敓绱㈠紩',
  KEY `idx_status` (`status`) COMMENT '鐘舵?绱㈠紩锛岀敤浜庨?绾︾姸鎬佹煡璇',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `course_schedule` (`schedule_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_booking_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='棰勭害琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course`
--

DROP TABLE IF EXISTS `course`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course` (
  `course_id` varchar(36) NOT NULL COMMENT '璇剧▼鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `template_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勮?绋嬫ā鏉縄D',
  `course_name` varchar(50) NOT NULL COMMENT '璇剧▼鍚嶇О锛?-50瀛楋級',
  `content` varchar(1000) NOT NULL COMMENT '鏁欏?鍐呭?锛?0-1000瀛楋級',
  `feature` varchar(1000) NOT NULL COMMENT '璇剧▼鐗硅壊锛?0-1000瀛楋級',
  `teacher_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勬暀甯圛D锛堝?搴攗ser琛ㄧ殑user_id锛',
  `status` varchar(10) NOT NULL DEFAULT 'inactive' COMMENT '璇剧▼鐘舵?锛坅ctive锛氭縺娲伙紝inactive锛氬緟瀹℃牳锛宖rozen锛氬喕缁擄級',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`course_id`),
  KEY `fk_template_id` (`template_id`) COMMENT '鍏宠仈璇剧▼妯℃澘绱㈠紩',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '鍏宠仈鏁欏笀绱㈠紩',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_course_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_course_template` FOREIGN KEY (`template_id`) REFERENCES `course_template` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鏁欏笀璇剧▼琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_check_in`
--

DROP TABLE IF EXISTS `course_check_in`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_check_in` (
  `check_in_id` varchar(36) NOT NULL COMMENT '绛惧埌鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `booking_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勯?绾?D',
  `check_in_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绛惧埌鏃堕棿',
  PRIMARY KEY (`check_in_id`),
  KEY `fk_booking_id` (`booking_id`) COMMENT '鍏宠仈棰勭害绱㈠紩',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_check_in_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='璇剧▼绛惧埌琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_evaluation`
--

DROP TABLE IF EXISTS `course_evaluation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '璇勪环鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勮?绋婭D',
  `booking_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勯?绾?D',
  `student_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勫?鐢烮D锛堝?搴攗ser琛ㄧ殑user_id锛',
  `rating` int NOT NULL COMMENT '璇勫垎锛?-5锛',
  `comment` varchar(1000) DEFAULT NULL COMMENT '璇勪环鍐呭?锛堟渶澶?000瀛楋級',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (`evaluation_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '鍏宠仈璇剧▼绱㈠紩',
  KEY `fk_student_id` (`student_id`) COMMENT '鍏宠仈瀛︾敓绱㈠紩',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_evaluation_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='璇剧▼璇勪环琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_feedback`
--

DROP TABLE IF EXISTS `course_feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_feedback` (
  `feedback_id` varchar(36) NOT NULL COMMENT '鍙嶉?鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勮?绋婭D',
  `user_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勭敤鎴稩D锛堝?搴攗ser琛ㄧ殑user_id锛',
  `content` varchar(1000) DEFAULT NULL COMMENT '鍙嶉?鍐呭?锛堟渶澶?000瀛楋級',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `handle_id` varchar(36) NOT NULL COMMENT '绠＄悊鍛樺叧鑱旂殑鐢ㄦ埛ID锛堝?搴攗ser琛ㄧ殑user_id锛',
  `handle_status` varchar(36) NOT NULL COMMENT '澶勭悊鐘舵?锛? pending锛堝緟澶勭悊锛?1 handled锛堝凡澶勭悊锛',
  `handle_content` varchar(1000) DEFAULT NULL COMMENT '澶勭悊鍐呭?锛堢?鐞嗗憳濉?啓锛',
  `handle_time` datetime DEFAULT NULL COMMENT '澶勭悊鏃堕棿',
  PRIMARY KEY (`feedback_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '鍏宠仈璇剧▼绱㈠紩',
  KEY `fk_user_id` (`user_id`) COMMENT '鍏宠仈鐢ㄦ埛绱㈠紩',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_feedback_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='璇剧▼鍙嶉?琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_schedule`
--

DROP TABLE IF EXISTS `course_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '鎺掓湡鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `name` varchar(56) NOT NULL DEFAULT 'noname' COMMENT '鎺掓湡鍚嶇О',
  `course_id` varchar(36) NOT NULL COMMENT '鍏宠仈鐨勬暀甯堣?绋婭D',
  `time_zone` varchar(36) NOT NULL COMMENT '鎺掓湡鎵?敤鐨勬椂鍖',
  `start_time` datetime NOT NULL COMMENT '鎺掓湡寮??鏃堕棿锛堟牸寮忥細YYYY-MM-DD HH:mm:ss锛?鍖呭惈璧峰?鏃ユ湡',
  `end_time` datetime NOT NULL COMMENT '鎺掓湡缁撴潫鏃堕棿锛堟牸寮忥細YYYY-MM-DD HH:mm:ss锛',
  `repeat_type` tinyint(1) DEFAULT '0' COMMENT '閲嶅?绫诲瀷锛?=涓嶉噸澶嶏紝1=姣忓ぉ锛?=姣忓懆锛?=姣忔湀',
  `repeat_interval` tinyint(1) DEFAULT '1' COMMENT '閲嶅?闂撮殧锛堝?姣?鍛ㄤ竴娆?2锛',
  `repeat_days` varchar(255) DEFAULT NULL COMMENT '閲嶅?鐨勬槦鏈熷嚑锛?=鍛ㄤ竴锛?=鍛ㄤ簩...7=鍛ㄦ棩锛岄?鍙峰垎闅旓紙浠卹epeat_type=2鏃舵湁鏁堬級锛宼ype=3鏃朵负1-31,褰撴湀鐨勯偅鍑犲ぉ',
  `available_sites` tinyint(1) NOT NULL DEFAULT '1' COMMENT '鍓╀綑甯?綅',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '鎺掓湡鐘舵?锛坧ending/active/inactive/frozen/overtime锛氬凡缁撴潫锛堣嚜鍔ㄦ洿鏂帮級锛',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '鍏宠仈璇剧▼绱㈠紩',
  KEY `idx_start_end_time` (`start_time`,`end_time`) COMMENT '鏃堕棿绱㈠紩锛岀敤浜庢帓鏈熷啿绐佹牎楠',
  KEY `idx_status` (`status`) COMMENT '鐘舵?绱㈠紩锛岀敤浜庡彲棰勭害鎺掓湡鏌ヨ?',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `course_schedule_chk_1` CHECK ((`end_time` > `start_time`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='璇剧▼鎺掓湡琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_template`
--

DROP TABLE IF EXISTS `course_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_template` (
  `template_id` varchar(36) NOT NULL COMMENT '妯℃澘鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `language_type` varchar(20) NOT NULL COMMENT '璇?█绫诲瀷锛堟灇涓撅細鑻辫?/鏃ヨ?/闊╄?/娉曡?/寰疯?/瑗跨彮鐗欒?锛',
  `difficulty_level` varchar(20) NOT NULL COMMENT '闅惧害绛夌骇锛堟灇涓撅細鍏ラ棬/杩涢樁/涓?骇/楂樼骇锛',
  `class_fee` decimal(10,2) NOT NULL COMMENT '璇炬椂璐癸紙鈮?锛屼繚鐣?浣嶅皬鏁帮級',
  `class_duration` int NOT NULL COMMENT '璇剧▼鏃堕暱锛堚墺15锛?5鐨勫?鏁帮紝鍗曚綅锛氬垎閽燂級',
  `class_form` varchar(20) NOT NULL COMMENT '璇剧▼褰㈠紡锛堟灇涓撅細涓??涓?灏忕彮璇?澶х彮璇撅級',
  `description` varchar(500) NOT NULL COMMENT '璇剧▼鎻忚堪锛?0-500瀛楋級',
  `status` varchar(10) NOT NULL DEFAULT 'inactive' COMMENT '妯℃澘鐘舵?锛坅ctive锛氭縺娲伙紝inactive锛氬緟瀹℃牳锛宖rozen锛氬喕缁擄級',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_tenant_lang_level` (`tenant_id`,`language_type`,`difficulty_level`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='璇剧▼妯℃澘琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_industry`
--

DROP TABLE IF EXISTS `sys_industry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_industry` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '鑷??涓婚敭',
  `code` varchar(50) NOT NULL COMMENT '琛屼笟缂栫爜锛堝敮涓?紝濡?edu/it/medical锛',
  `name` varchar(100) NOT NULL COMMENT '琛屼笟鍚嶇О锛堥〉闈㈠睍绀猴級',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '鐘舵?锛?鍚?敤 0鍋滅敤',
  `remark` varchar(500) DEFAULT NULL COMMENT '澶囨敞',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='琛屼笟琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_metric_hourly`
--

DROP TABLE IF EXISTS `sys_metric_hourly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_metric_hourly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `hour_time` datetime NOT NULL COMMENT '鏁寸偣鏃堕棿',
  `cpu_system_avg` decimal(5,2) DEFAULT NULL,
  `cpu_system_max` decimal(5,2) DEFAULT NULL,
  `cpu_process_avg` decimal(5,2) DEFAULT NULL,
  `mem_used_avg` bigint DEFAULT NULL,
  `jvm_heap_avg` bigint DEFAULT NULL,
  `jvm_heap_max` bigint DEFAULT NULL,
  `disk_used_max` bigint DEFAULT NULL,
  `thread_avg` int DEFAULT NULL,
  `online_max` int DEFAULT NULL COMMENT '璇ュ皬鏃跺湪绾垮嘲鍊',
  `sample_count` int NOT NULL DEFAULT '0' COMMENT '鑱氬悎鏍锋湰鏁',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hour` (`hour_time`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='绯荤粺鎸囨爣灏忔椂鑱氬悎';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_metric_sample`
--

DROP TABLE IF EXISTS `sys_metric_sample`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_metric_sample` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `sample_time` datetime NOT NULL COMMENT '閲囨牱鏃堕棿',
  `cpu_system` decimal(5,2) DEFAULT NULL COMMENT '绯荤粺CPU浣跨敤鐜?%)',
  `cpu_process` decimal(5,2) DEFAULT NULL COMMENT '褰撳墠杩涚▼CPU浣跨敤鐜?%)',
  `mem_total` bigint DEFAULT NULL COMMENT '鐗╃悊鍐呭瓨鎬婚噺(瀛楄妭)',
  `mem_used` bigint DEFAULT NULL COMMENT '鐗╃悊鍐呭瓨宸茬敤(瀛楄妭)',
  `jvm_heap_used` bigint DEFAULT NULL COMMENT 'JVM鍫嗗凡鐢?瀛楄妭)',
  `jvm_heap_max` bigint DEFAULT NULL COMMENT 'JVM鍫嗕笂闄?瀛楄妭)',
  `disk_total` bigint DEFAULT NULL COMMENT '纾佺洏鎬婚噺(瀛楄妭)',
  `disk_used` bigint DEFAULT NULL COMMENT '纾佺洏宸茬敤(瀛楄妭)',
  `thread_count` int DEFAULT NULL COMMENT 'JVM绾跨▼鏁',
  `gc_count` bigint DEFAULT NULL COMMENT 'GC绱??娆℃暟',
  `gc_time_ms` bigint DEFAULT NULL COMMENT 'GC绱??鑰楁椂(姣??)',
  `net_out_bytes` bigint DEFAULT NULL COMMENT '閲囨牱鍛ㄦ湡鍐呭簲鐢ㄥ嚭鍙ｅ瓧鑺傛暟',
  `online_users` int DEFAULT NULL COMMENT '鍦ㄧ嚎鐢ㄦ埛鏁',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sample_time` (`sample_time`)
) ENGINE=InnoDB AUTO_INCREMENT=1151 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='绯荤粺鎸囨爣閲囨牱鏄庣粏';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_package_template`
--

DROP TABLE IF EXISTS `sys_package_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_package_template` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '鑷??涓婚敭',
  `template_name` varchar(100) NOT NULL COMMENT '濂楅?妯℃澘鍚嶇О',
  `template_code` varchar(50) DEFAULT NULL COMMENT '濂楅?妯℃澘缂栫爜锛堥?濉?紝渚夸簬鎺ュ彛寮曠敤锛',
  `course_limit` int NOT NULL DEFAULT '0' COMMENT '璇剧▼鏁伴噺闄愰?锛?=涓嶉檺锛',
  `schedule_limit` int NOT NULL DEFAULT '0' COMMENT '鎺掓湡鏁伴噺闄愰?锛?=涓嶉檺锛',
  `user_total_limit` int NOT NULL DEFAULT '0' COMMENT '娉ㄥ唽鐢ㄦ埛鎬绘暟闄愰?锛?=涓嶉檺锛',
  `teacher_limit` int NOT NULL DEFAULT '0' COMMENT '鏁欏笀鏁伴噺闄愰?锛?=涓嶉檺锛',
  `student_limit` int NOT NULL DEFAULT '0' COMMENT '瀛︾敓鏁伴噺闄愰?锛?=涓嶉檺锛',
  `teacher_publish_limit` int NOT NULL DEFAULT '0' COMMENT '鏁欏笀淇℃伅鍙戝竷闄愰?锛?=涓嶉檺锛',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '鐘舵?锛?鍚?敤 2鍋滅敤',
  `remark` varchar(500) DEFAULT NULL COMMENT '澶囨敞',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_code` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='濂楅?妯℃澘琛?紙瑙勬牸瀹氫箟锛';
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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统配置表';
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
  `package_id` bigint DEFAULT '0' COMMENT '濂楅?妯℃澘ID锛坰ys_package_template.id锛?=鏈?寚瀹氭ā鏉匡級',
  `industry_id` bigint DEFAULT NULL COMMENT '鎵?睘琛屼笟ID锛屽叧鑱?sys_industry.id锛汵ULL 琛ㄧず鏈?寚瀹',
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户信息表';
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
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='租户套餐额度表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_tenant_stats_monthly`
--

DROP TABLE IF EXISTS `sys_tenant_stats_monthly`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_tenant_stats_monthly` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL COMMENT '绉熸埛ID',
  `stat_month` char(7) NOT NULL COMMENT '缁熻?鏈堜唤锛坹yyy-MM锛',
  `teacher_count` int NOT NULL DEFAULT '0' COMMENT '鏁欏笀鏁帮紙status=active锛',
  `student_count` int NOT NULL DEFAULT '0' COMMENT '瀛︾敓鏁帮紙status=active锛',
  `course_count` int NOT NULL DEFAULT '0' COMMENT '璇剧▼鏁',
  `schedule_count` int NOT NULL DEFAULT '0' COMMENT '鎺掓湡鏁',
  `booking_count` int NOT NULL DEFAULT '0' COMMENT '棰勭害鏁',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_month` (`tenant_id`,`stat_month`),
  KEY `idx_month` (`stat_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='绉熸埛鏈堝害鐢ㄩ噺蹇?収';
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
  `term_type` varchar(32) NOT NULL DEFAULT 'label' COMMENT '用途：label标签/menu菜单/button按钮/tip提示',
  `industry_id` bigint NOT NULL DEFAULT '0' COMMENT '所属行业：0=平台级，>0=该行业',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '所属租户：0=平台/行业级，>0=租户自定义',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '同级排序（菜单顺序可用）',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1启用 0停用（停用=该级回退到下一级）',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scope_key` (`term_key`,`industry_id`,`tenant_id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_industry` (`industry_id`)
) ENGINE=InnoDB AUTO_INCREMENT=120 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='行业专业词汇表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sys_user_session`
--

DROP TABLE IF EXISTS `sys_user_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_session` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) NOT NULL COMMENT '浼氳瘽ID锛圝WT绛惧悕鍓?浣?UUID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '绉熸埛ID锛?=骞冲彴绠＄悊鍛橈級',
  `user_id` varchar(36) NOT NULL COMMENT '鐢ㄦ埛ID',
  `user_role` varchar(20) DEFAULT NULL COMMENT '瑙掕壊锛歴tudent/teacher/admin/platform_admin',
  `ip` varchar(64) DEFAULT NULL COMMENT '鐧诲綍IP',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '瀹㈡埛绔?爣璇',
  `login_time` datetime NOT NULL COMMENT '鐧诲綍鏃堕棿',
  `last_active` datetime NOT NULL COMMENT '鏈?繎娲昏穬鏃堕棿',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1鍦ㄧ嚎 2宸茬櫥鍑?3宸茶繃鏈',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session` (`session_id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_last_active` (`last_active`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鐢ㄦ埛浼氳瘽琛?紙鍦ㄧ嚎缁熻?锛';
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
  `teacher_id` varchar(36) NOT NULL COMMENT '鍏宠仈鏁欏笀user_id',
  `start_time` time NOT NULL COMMENT '鏃舵?寮?? 濡?09:00:00',
  `end_time` time NOT NULL COMMENT '鏃舵?缁撴潫 濡?17:00:00',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT 'active/frozen',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鏁欏笀鍙??绾︽椂闂存?锛堝懆妯℃澘+鎸夋棩瑕嗙洊锛';
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
  `teacher_id` varchar(36) NOT NULL COMMENT '鍏宠仈鏁欏笀user_id',
  `cert_name` varchar(100) DEFAULT NULL COMMENT '璇佷功鍚嶇О',
  `cert_url` varchar(500) DEFAULT NULL COMMENT '璇佷功鍥剧墖URL',
  `cert_base64` mediumtext COMMENT '璇佷功鍥剧墖Base64锛堝吋瀹癸級',
  `sort_no` int DEFAULT '0' COMMENT '鎺掑簭鍙凤紝灏忓湪鍓',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  PRIMARY KEY (`certificate_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tc_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鏁欏笀璧勬牸璇佷功琛?1:N)';
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
  `teacher_id` varchar(36) NOT NULL COMMENT '鍏宠仈user琛╱ser_id锛堜粎闄恟ole=teacher锛',
  `optioned_teacher_link` varchar(36) DEFAULT NULL COMMENT '教师的id 用来链接到排期表',
  `subject` varchar(50) DEFAULT NULL COMMENT '瀛︾?锛堝啑浣檜ser.language_type锛屼究浜庢帓搴忔悳绱?級',
  `personal_photo_url` varchar(500) DEFAULT NULL COMMENT '涓?汉鐓х墖URL锛堥潤鎬佹枃浠惰矾寰勶紝浼樺厛锛',
  `personal_photo_base64` mediumtext COMMENT '涓?汉鐓х墖Base64锛堜笌URL浜岄?涓?紝鍏煎?鑰乹ualification鏂瑰紡锛',
  `bio_text` varchar(2000) DEFAULT NULL COMMENT '鏂囧瓧璇存槑锛堟暀甯堢畝浠嬶級',
  `bio_url` varchar(500) DEFAULT NULL COMMENT '鏂囧瓧璇存槑閾炬帴锛堝?閮ㄧ畝鍘?鍗氬?URL锛',
  `availability_rule` varchar(1000) DEFAULT NULL COMMENT '鍙??绾︽椂闂磋?鍒欙紙缁撴瀯鍖朖SON锛屽啑浣欏瓧娈典究浜庡揩閫熷睍绀猴級',
  `optioned_teacher_scheduleId` varchar(36) DEFAULT NULL COMMENT '教师的排期scheduleId',
  `min_booking_hours` int DEFAULT '4' COMMENT '鍗曟?鍙??绾︽渶灏忚?鏃舵暟锛堝?4灏忔椂锛',
  `weekly_available_hours` int DEFAULT '20' COMMENT '姣忓懆鍙??绾︽?璇炬椂涓婇檺',
  `certificate_text` varchar(500) DEFAULT NULL COMMENT '璇佷功鏂囧瓧鎻忚堪锛堝?CET-8銆丣LPT N1锛',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT '鑱屼笟淇℃伅鐘舵?active/inactive/frozen',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`teacher_professional_id`),
  UNIQUE KEY `uk_teacher_id` (`teacher_id`) COMMENT '涓?釜鏁欏笀鍙?兘鏈変竴鏉¤亴涓氫俊鎭',
  KEY `idx_subject` (`subject`) COMMENT '瀛︾?绱㈠紩',
  KEY `idx_status` (`status`) COMMENT '鐘舵?绱㈠紩',
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tp_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鏁欏笀鑱屼笟淇℃伅涓昏〃(1:1 user teacher)';
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
  `teacher_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '鍏宠仈user琛╱ser_id(role=teacher)',
  `teacher_professional_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '鐢熸垚鏃跺?搴旂殑鑱屼笟淇℃伅鐗堟湰ID锛屾柟渚垮洖婧',
  `title` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '鏁欏笀淇℃伅' COMMENT '鍙戝竷鏍囬?锛堝?"鑻辫?鏁欏笀-寮犱笁鐨勪釜浜轰粙缁?锛',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft鑽夌?/published鍙戝竷/archived褰掓。',
  `field_config` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '瀛楁?鍕鹃?涓庢帓搴?JSON: [{key,label,enabled,sort}]',
  `style_config` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '鏍峰紡閰嶇疆 JSON: {fontFamily,fontSizePx,titleSizePx,photoSizePx,certSizePx,accentColor,bgColor}',
  `draft_data` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '涓存椂淇濆瓨鐨勫師濮嬫暟鎹?揩鐓?JSON锛堣繘鍏ョ紪杈戞椂鍥炲～锛',
  `static_html` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '鍙戝竷鍚庣敓鎴愮殑瀹屾暣闈欐?HTML椤甸潰锛堝唴宓屽浘鐗嘼ase64锛夛紝鐙?珛鍙?笅杞',
  `published_at` datetime DEFAULT NULL COMMENT '鏈?悗涓??鍙戝竷鏃堕棿',
  `published_by_user_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '鍙戝竷鎿嶄綔浜?user_id',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`published_profile_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_status` (`status`),
  KEY `idx_teacher_status` (`teacher_id`,`status`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='鏁欏笀鍙戝竷淇℃伅/杞?彂閰嶇疆琛';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `user_id` varchar(36) NOT NULL COMMENT '鐢ㄦ埛鍞?竴鏍囪瘑锛圲UID锛',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `account` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(100) NOT NULL COMMENT '鍔犲瘑鍚庣殑瀵嗙爜锛圔Crypt鍔犲瘑锛岄暱搴?-20浣嶏紝鍚?瓧姣嶅拰鏁板瓧锛',
  `role` varchar(32) NOT NULL COMMENT '角色（student/teacher/admin/platform_admin）',
  `learn_goal` varchar(200) DEFAULT NULL COMMENT '瀛︾敓瀛︿範鐩?爣锛堝?鐢熶笓灞烇級',
  `language_level` varchar(20) DEFAULT NULL COMMENT '瀛︾敓璇?█姘村钩锛堟灇涓撅細鍏ラ棬/杩涢樁/涓?骇/楂樼骇/绮鹃?锛屽?鐢熶笓灞烇級',
  `name` varchar(255) DEFAULT NULL,
  `qualification` text COMMENT '鏁欏笀璧勮川鍥剧墖锛圔ase64缂栫爜锛屾暀甯堜笓灞烇級',
  `language_type` varchar(20) DEFAULT NULL COMMENT '鏁欏笀鏁欐巿璇?█绫诲瀷锛堟灇涓撅細鑻辫?/鏃ヨ?/闊╄?/娉曡?/寰疯?/瑗跨彮鐗欒?锛屾暀甯堜笓灞烇級',
  `status` varchar(10) NOT NULL COMMENT '璐﹀彿鐘舵?锛坅ctive锛氭縺娲伙紝inactive锛氬緟瀹℃牳锛宖rozen锛氬喕缁擄級',
  `last_active_time` datetime DEFAULT NULL COMMENT '鏈?繎娲昏穬鏃堕棿',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '鍒涘缓鏃堕棿',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '鏇存柊鏃堕棿',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_phone` (`phone`) COMMENT '鎵嬫満鍙峰敮涓',
  UNIQUE KEY `uk_email` (`email`) COMMENT '閭??鍞?竴',
  KEY `idx_role` (`role`) COMMENT '瑙掕壊绱㈠紩锛岀敤浜庢潈闄愭煡璇',
  KEY `idx_status` (`status`) COMMENT '鐘舵?绱㈠紩锛岀敤浜庤处鍙峰?鏍搞?鍐荤粨鏌ヨ?',
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_tenant_active` (`tenant_id`,`last_active_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鐢ㄦ埛琛?紙瀛︾敓銆佹暀甯堛?绠＄悊鍛橈級';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_refresh_token`
--

DROP TABLE IF EXISTS `user_refresh_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_refresh_token` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '涓婚敭',
  `user_id` varchar(36) NOT NULL COMMENT '鐧诲綍鐢ㄦ埛ID',
  `refresh_token` varchar(512) NOT NULL COMMENT '鍒锋柊鍑?瘉',
  `expire_time` datetime NOT NULL COMMENT '杩囨湡鏃堕棿',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_refresh_token` (`refresh_token`)
) ENGINE=InnoDB AUTO_INCREMENT=113 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='鐢ㄦ埛鍒锋柊user_refresh_tokenToken鎸佷箙鍖栬〃';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-02 14:40:39
