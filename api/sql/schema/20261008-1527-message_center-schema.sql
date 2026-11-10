-- MySQL dump 10.13  Distrib 8.4.11, for Win64 (x86_64)
--
-- Host: localhost    Database: message_center
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_batch_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_batch_task` (
  `task_id` bigint NOT NULL COMMENT '主键(雪花)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `task_name` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `message_id` bigint NOT NULL,
  `sender_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `total_recipients` int NOT NULL DEFAULT '0',
  `processed_count` int NOT NULL DEFAULT '0',
  `success_count` int NOT NULL DEFAULT '0',
  `failed_count` int NOT NULL DEFAULT '0',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '0待执行 1执行中 2成功 3失败',
  `execute_time` datetime DEFAULT NULL,
  `finish_time` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_message` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息批处理任务';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_category`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_category` (
  `category_id` bigint NOT NULL COMMENT '主键(雪花)',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户id; 0=平台预置(全局可用)',
  `category_code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '分类编码(租户内唯一)',
  `category_name` varchar(128) COLLATE utf8mb4_general_ci NOT NULL COMMENT '分类名称',
  `category_level` tinyint NOT NULL DEFAULT '1' COMMENT '层级:1=发起角色维度 2=业务场景维度',
  `parent_id` bigint NOT NULL DEFAULT '0' COMMENT '父级id,0=顶层',
  `sort` int NOT NULL DEFAULT '0' COMMENT '排序',
  `is_system_predefined` tinyint NOT NULL DEFAULT '0' COMMENT '1=系统预置(不可删)',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uk_code_tenant` (`category_code`,`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息分类(三级体系)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_delivery`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_delivery`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_delivery` (
  `delivery_id` bigint NOT NULL COMMENT '主键(雪花)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `message_id` bigint NOT NULL,
  `user_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '接收用户id',
  `delivery_status` tinyint NOT NULL DEFAULT '0' COMMENT '0未投递 1已投递 2已确认接收 3投递失败',
  `channel` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'rest' COMMENT 'rest/sse',
  `retry_count` int NOT NULL DEFAULT '0',
  `delivery_time` datetime DEFAULT NULL,
  `ack_time` datetime DEFAULT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`delivery_id`),
  KEY `idx_msg_user` (`message_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息投递状态';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_inbox`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_inbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_inbox` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键(物理存储)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `user_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '接收用户id',
  `message_id` bigint NOT NULL COMMENT '消息id',
  `is_read` tinyint NOT NULL DEFAULT '0' COMMENT '0未读 1已读',
  `read_time` datetime DEFAULT NULL,
  `is_starred` tinyint NOT NULL DEFAULT '0' COMMENT '0未收藏 1已收藏',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '0正常 1回收站(逻辑删除)',
  `folder` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'inbox' COMMENT 'inbox/starred/trash',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_msg` (`user_id`,`message_id`),
  KEY `idx_user_time` (`user_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=11635 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户消息收件箱索引';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_message`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_message` (
  `message_id` bigint NOT NULL COMMENT '主键(雪花)',
  `tenant_id` bigint NOT NULL DEFAULT '0' COMMENT '租户id',
  `sender_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '发送方用户id(或system)',
  `sender_type` varchar(32) COLLATE utf8mb4_general_ci NOT NULL COMMENT '发送方类型:teacher/admin/platform_admin/student/system',
  `category_code` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '消息分类编码(场景)',
  `sender_dim_code` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '一级维度:发起角色(来源归集)',
  `priority` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'MEDIUM' COMMENT 'HIGH紧急/MEDIUM普通/LOW低',
  `title` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '消息标题(AES加密)',
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '消息内容(AES加密)',
  `payload` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '附加元数据JSON,如跳转地址(AES加密)',
  `is_broadcast` tinyint NOT NULL DEFAULT '0' COMMENT '是否广播(全体/角色投递)',
  `status` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'sent' COMMENT 'sent/withdrawn(已撤回)',
  `send_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`),
  KEY `idx_sender` (`sender_id`,`sender_type`),
  KEY `idx_tenant_time` (`tenant_id`,`send_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `msg_sensitive_group`
--

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_sensitive_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_sensitive_group` (
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_sensitive_word`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_sensitive_word` (
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

-- 等保 P0-4：已禁用 DROP（生产库重跑会删表），改用 CREATE TABLE IF NOT EXISTS
-- DROP TABLE IF EXISTS `msg_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `msg_template` (
  `template_id` bigint NOT NULL COMMENT '主键(雪花)',
  `tenant_id` bigint NOT NULL DEFAULT '0',
  `template_code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '模板编码(租户内唯一)',
  `template_name` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `category_code` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '关联消息分类编码',
  `title_template` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '标题模板,支持{占位}',
  `content_template` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '内容模板,支持{占位}(AES加密)',
  `sender_type` varchar(32) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'admin' COMMENT '发送方角色类型',
  `priority` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'MEDIUM' COMMENT 'HIGH/MEDIUM/LOW',
  `is_enabled` tinyint NOT NULL DEFAULT '1',
  `is_deleted` tinyint NOT NULL DEFAULT '0',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息模板';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
-- Dump completed
