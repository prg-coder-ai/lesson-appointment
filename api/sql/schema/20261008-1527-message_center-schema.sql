-- MySQL dump 10.13  Distrib 8.4.11, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: message_center
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
-- Table structure for table `msg_batch_task`
--

DROP TABLE IF EXISTS `msg_batch_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_batch_task` (
  `task_id` bigint NOT NULL COMMENT '涓婚敭(闆?姳)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `task_name` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `message_id` bigint NOT NULL,
  `sender_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `total_recipients` int NOT NULL DEFAULT '0',
  `processed_count` int NOT NULL DEFAULT '0',
  `success_count` int NOT NULL DEFAULT '0',
  `failed_count` int NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '0寰呮墽琛?1鎵ц?涓?2鎴愬姛 3澶辫触',
  `execute_time` datetime DEFAULT NULL,
  `finish_time` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_message` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='娑堟伅鎵瑰?鐞嗕换鍔';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_category`
--

DROP TABLE IF EXISTS `msg_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_category` (
  `category_id` bigint NOT NULL COMMENT '涓婚敭(闆?姳)',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '绉熸埛id; 0=骞冲彴棰勭疆(鍏ㄥ眬鍙?敤)',
  `category_code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '鍒嗙被缂栫爜(绉熸埛鍐呭敮涓?',
  `category_name` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT '鍒嗙被鍚嶇О',
  `category_level` tinyint NOT NULL DEFAULT '1' COMMENT '灞傜骇:1=鍙戣捣瑙掕壊缁村害 2=涓氬姟鍦烘櫙缁村害',
  `parent_id` bigint NOT NULL DEFAULT '0' COMMENT '鐖剁骇id,0=椤跺眰',
  `sort` int NOT NULL DEFAULT '0' COMMENT '鎺掑簭',
  `is_system_predefined` tinyint NOT NULL DEFAULT '0' COMMENT '1=绯荤粺棰勭疆(涓嶅彲鍒?',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '閫昏緫鍒犻櫎',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uk_code_tenant` (`category_code`,`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='娑堟伅鍒嗙被(涓夌骇浣撶郴)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_delivery`
--

DROP TABLE IF EXISTS `msg_delivery`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_delivery` (
  `delivery_id` bigint NOT NULL COMMENT '涓婚敭(闆?姳)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `message_id` bigint NOT NULL,
  `user_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '鎺ユ敹鐢ㄦ埛id',
  `delivery_status` tinyint NOT NULL DEFAULT '0' COMMENT '0鏈?姇閫?1宸叉姇閫?2宸茬‘璁ゆ帴鏀?3鎶曢?澶辫触',
  `channel` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'rest' COMMENT 'rest/sse',
  `retry_count` int NOT NULL DEFAULT '0',
  `delivery_time` datetime DEFAULT NULL,
  `ack_time` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`delivery_id`),
  KEY `idx_msg_user` (`message_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='娑堟伅鎶曢?鐘舵?';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_inbox`
--

DROP TABLE IF EXISTS `msg_inbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_inbox` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '鑷??涓婚敭(鐗╃悊瀛樺偍)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `user_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '鎺ユ敹鐢ㄦ埛id',
  `message_id` bigint NOT NULL COMMENT '娑堟伅id',
  `is_read` tinyint NOT NULL DEFAULT '0' COMMENT '0鏈?? 1宸茶?',
  `read_time` datetime DEFAULT NULL,
  `is_starred` tinyint NOT NULL DEFAULT '0' COMMENT '0鏈?敹钘?1宸叉敹钘',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '0姝ｅ父 1鍥炴敹绔?閫昏緫鍒犻櫎)',
  `folder` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'inbox' COMMENT 'inbox/starred/trash',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_msg` (`user_id`,`message_id`),
  KEY `idx_user_time` (`user_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5789 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='鐢ㄦ埛娑堟伅鏀朵欢绠辩储寮';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_message`
--

DROP TABLE IF EXISTS `msg_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_message` (
  `message_id` bigint NOT NULL COMMENT '涓婚敭(闆?姳)',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '绉熸埛id',
  `sender_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '鍙戦?鏂圭敤鎴穒d(鎴杝ystem)',
  `sender_type` varchar(32) COLLATE utf8mb4_general_ci NOT NULL COMMENT '鍙戦?鏂圭被鍨?teacher/admin/platform_admin/student/system',
  `category_code` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '娑堟伅鍒嗙被缂栫爜(鍦烘櫙)',
  `sender_dim_code` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '涓?骇缁村害:鍙戣捣瑙掕壊(鏉ユ簮褰掗泦)',
  `priority` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'MEDIUM' COMMENT 'HIGH绱ф?/MEDIUM鏅??/LOW浣',
  `title` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '娑堟伅鏍囬?(AES鍔犲瘑)',
  `content` text COLLATE utf8mb4_general_ci COMMENT '娑堟伅鍐呭?(AES鍔犲瘑)',
  `payload` text COLLATE utf8mb4_general_ci COMMENT '闄勫姞鍏冩暟鎹甁SON,濡傝烦杞?湴鍧?AES鍔犲瘑)',
  `is_broadcast` tinyint NOT NULL DEFAULT '0' COMMENT '鏄?惁骞挎挱(鍏ㄤ綋/瑙掕壊鎶曢?)',
  `status` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'sent' COMMENT 'sent/withdrawn(宸叉挙鍥?',
  `send_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_sender` (`sender_id`,`sender_type`),
  KEY `idx_tenant_time` (`tenant_id`,`send_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='娑堟伅涓昏〃';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_sensitive_group`
--

DROP TABLE IF EXISTS `msg_sensitive_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_sensitive_group` (
  `group_id` bigint NOT NULL COMMENT '主键(雪花)',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户id; 0=平台(全平台共享)',
  `group_name` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT '分组名称',
  `default_action` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'REJECT' COMMENT '组内默认处理: REJECT=拒绝发送 MASK=掩码放行',
  `is_system_predefined` tinyint NOT NULL DEFAULT '0' COMMENT '1=系统预置(不可删)',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='敏感词分组';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_sensitive_word`
--

DROP TABLE IF EXISTS `msg_sensitive_word`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_sensitive_word` (
  `word_id` bigint NOT NULL COMMENT '主键(雪花)',
  `group_id` bigint NOT NULL COMMENT '所属分组',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户id(同分组)',
  `word` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT '敏感词(原文)',
  `action` varchar(16) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '处理: REJECT/MASK; NULL=继承分组默认',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`word_id`),
  UNIQUE KEY `uk_group_word` (`group_id`,`word`,`is_deleted`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='敏感词';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_template`
--

DROP TABLE IF EXISTS `msg_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_template` (
  `template_id` bigint NOT NULL COMMENT '涓婚敭(闆?姳)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `template_code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '妯℃澘缂栫爜(绉熸埛鍐呭敮涓?',
  `template_name` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `category_code` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '鍏宠仈娑堟伅鍒嗙被缂栫爜',
  `title_template` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '鏍囬?妯℃澘,鏀?寔{鍗犱綅}',
  `content_template` text COLLATE utf8mb4_general_ci COMMENT '鍐呭?妯℃澘,鏀?寔{鍗犱綅}(AES鍔犲瘑)',
  `sender_type` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'admin' COMMENT '鍙戦?鏂硅?鑹茬被鍨',
  `priority` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'MEDIUM' COMMENT 'HIGH/MEDIUM/LOW',
  `is_enabled` tinyint NOT NULL DEFAULT '1',
  `is_deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='娑堟伅妯℃澘';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'message_center'
--

--
-- Dumping routines for database 'message_center'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
