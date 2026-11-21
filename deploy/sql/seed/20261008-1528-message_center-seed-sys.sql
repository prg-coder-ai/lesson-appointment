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
-- Dumping data for table `msg_category`
--

LOCK TABLES `msg_category` WRITE;
/*!40000 ALTER TABLE `msg_category` DISABLE KEYS */;
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (1001,0,'SENDER_TEACHER_ADMIN','教师/管理员消息',1,0,1,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (1002,0,'SENDER_STUDENT','学生消息',1,0,2,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (1003,0,'SENDER_SYSTEM','系统通知',1,0,3,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2001,0,'HOMEWORK_NOTICE','作业通知',2,1001,1,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2002,0,'CLASS_NOTICE','上课/课堂调整通知',2,1001,2,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2003,0,'LEAVE_NOTICE','请假审批通知',2,1002,1,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2004,0,'RESOURCE_NOTICE','资源/报修/咨询',2,1002,2,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2005,0,'SYSTEM_SCHEDULE','排期/签到/截止提醒',2,1003,1,1,0,'2026-09-05 09:29:48','2026-09-05 09:29:48');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2006,0,'BOOKING_CREATED','预约/候补申请',2,1002,3,1,0,'2026-09-11 12:53:58','2026-09-11 12:53:58');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2007,0,'BOOKING_CONFIRMED','预约确认/候补递补',2,1001,3,1,0,'2026-09-11 12:53:58','2026-09-11 12:53:58');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2008,0,'LEAVE_CREATED','学生请假申请',2,1002,4,1,0,'2026-09-11 12:53:58','2026-09-11 12:53:58');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2096064193373446145,0,'CAT_TEST_1788575621328','测试分类',1,0,0,0,1,'2026-09-05 10:33:41','2026-09-05 10:33:41');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2096064479517253634,0,'CAT_TEST_1788575689559','测试分类',1,0,0,0,1,'2026-09-05 10:34:50','2026-09-05 10:34:50');
INSERT INTO `msg_category` (`category_id`, `tenant_id`, `category_code`, `category_name`, `category_level`, `parent_id`, `sort`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (2096068973625921538,0,'CAT_TEST_1788576761048','测试分类',1,0,0,0,1,'2026-09-05 10:52:41','2026-09-05 10:52:41');
/*!40000 ALTER TABLE `msg_category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `msg_sensitive_group`
--

LOCK TABLES `msg_sensitive_group` WRITE;
/*!40000 ALTER TABLE `msg_sensitive_group` DISABLE KEYS */;
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3001,0,'默认敏感词组','REJECT',1,0,'2026-09-15 09:27:14','2026-09-15 09:27:14');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3101,0,'色情低俗与违禁内容','REJECT',1,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3102,0,'赌博博彩','REJECT',1,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3103,0,'电信诈骗与金融诈骗','REJECT',1,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3104,0,'暴力恐怖与管制违禁品','REJECT',1,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3105,0,'辱骂歧视与人身攻击','MASK',1,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3106,0,'违法引流与违禁广告','REJECT',1,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_group` (`group_id`, `tenant_id`, `group_name`, `default_action`, `is_system_predefined`, `is_deleted`, `create_time`, `update_time`) VALUES (3107,0,'国家安全与政治类（待官方词库补充）','REJECT',1,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
/*!40000 ALTER TABLE `msg_sensitive_group` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `msg_sensitive_word`
--

LOCK TABLES `msg_sensitive_word` WRITE;
/*!40000 ALTER TABLE `msg_sensitive_word` DISABLE KEYS */;
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920001,3101,0,'色情',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920002,3101,0,'黄色',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920003,3101,0,'黄片',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920004,3101,0,'黄赌毒',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920005,3101,0,'裸聊',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920006,3101,0,'裸照',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920007,3101,0,'约炮',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920008,3101,0,'一夜情',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920009,3101,0,'成人影片',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920010,3101,0,'AV',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920011,3101,0,'色情网站',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920012,3101,0,'成人内容',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920013,3101,0,'性爱视频',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920014,3101,0,'卖淫',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920015,3101,0,'嫖娼',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920016,3101,0,'援交',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920017,3101,0,'情色',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920018,3101,0,'午夜成人',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920019,3101,0,'成人交友',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920020,3101,0,'撩骚',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920021,3101,0,'骚聊',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920022,3101,0,'露点',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920023,3101,0,'走光',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920024,3101,0,'偷拍',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920025,3101,0,'卖淫女',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920026,3101,0,'陪睡',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920027,3101,0,'包养',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920028,3101,0,'有色情',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920029,3101,0,'激情聊天',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920030,3101,0,'成人直播',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920031,3102,0,'赌博',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920032,3102,0,'博彩',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920033,3102,0,'赌场',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920034,3102,0,'赌球',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920035,3102,0,'赌马',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920036,3102,0,'百家乐',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920037,3102,0,'老虎机',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920038,3102,0,'线上赌博',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920039,3102,0,'网络赌博',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920040,3102,0,'私彩',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920041,3102,0,'地下六合彩',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920042,3102,0,'时时彩',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920043,3102,0,'彩票预测',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920044,3102,0,'赌博网站',NULL,0,'2026-09-20 12:56:07','2026-09-20 12:56:07');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920045,3102,0,'炸金花',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920046,3102,0,'赌博群',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920047,3102,0,'赌钱',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920048,3102,0,'赢钱秘籍',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920049,3102,0,'赌博平台',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920050,3102,0,'投注',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920051,3102,0,'外围赌',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920052,3102,0,'赌盘',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920053,3102,0,'博彩网站',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920054,3102,0,'麻将赌博',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920055,3102,0,'赌球平台',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920056,3102,0,'私彩投注',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920057,3102,0,'网络赌盘',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920058,3103,0,'诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920059,3103,0,'电信诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920060,3103,0,'杀猪盘',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920061,3103,0,'刷单',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920062,3103,0,'刷单返利',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920063,3103,0,'刷单兼职',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920064,3103,0,'中奖诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920065,3103,0,'冒充客服',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920066,3103,0,'冒充公检法',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920067,3103,0,'套路贷',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920068,3103,0,'校园贷',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920069,3103,0,'裸贷',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920070,3103,0,'高利贷',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920071,3103,0,'庞氏骗局',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920072,3103,0,'传销',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920073,3103,0,'资金盘',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920074,3103,0,'民族资产解冻',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920075,3103,0,'冒充领导',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920076,3103,0,'网贷诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920077,3103,0,'投资诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920078,3103,0,'荐股诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920079,3103,0,'虚拟货币诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920080,3103,0,'婚恋诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920081,3103,0,'退票诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920082,3103,0,'退税诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920083,3103,0,'补助诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920084,3103,0,'社保卡诈骗',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920085,3103,0,'涉案账户',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920086,3103,0,'安全账户',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920087,3103,0,'转账到安全账户',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920088,3104,0,'枪支',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920089,3104,0,'弹药',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920090,3104,0,'管制刀具',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920091,3104,0,'仿真枪',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920092,3104,0,'弓弩',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920093,3104,0,'爆炸物',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920094,3104,0,'炸药',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920095,3104,0,'雷管',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920096,3104,0,'毒品',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920097,3104,0,'冰毒',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920098,3104,0,'海洛因',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920099,3104,0,'大麻',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920100,3104,0,'可卡因',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920101,3104,0,'摇头丸',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920102,3104,0,'制毒',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920103,3104,0,'贩毒',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920104,3104,0,'吸毒',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920105,3104,0,'恐怖主义',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920106,3104,0,'恐怖袭击',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920107,3104,0,'暴恐',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920108,3104,0,'制爆教程',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920109,3104,0,'枪支买卖',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920110,3104,0,'易制毒',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920111,3104,0,'迷药',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920112,3104,0,'催情药',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920113,3104,0,'走私',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920114,3104,0,'军火',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920115,3104,0,'武器买卖',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920116,3104,0,'毒品交易',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920117,3105,0,'傻逼',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920118,3105,0,'傻叉',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920119,3105,0,'贱人',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920120,3105,0,'婊子',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920121,3105,0,'贱货',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920122,3105,0,'废物',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920123,3105,0,'智障',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920124,3105,0,'白痴',NULL,0,'2026-09-20 12:56:08','2026-09-20 12:56:08');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920125,3105,0,'脑残',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920126,3105,0,'弱智',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920127,3105,0,'地域黑',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920128,3105,0,'地域歧视',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920129,3105,0,'种族歧视',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920130,3105,0,'性别歧视',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920131,3105,0,'狗东西',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920132,3105,0,'畜生',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920133,3105,0,'猪头',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920134,3105,0,'死全家',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920135,3105,0,'操你',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920136,3105,0,'日你',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920137,3105,0,'草你',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920138,3105,0,'妈的',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920139,3105,0,'他妈的',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920140,3105,0,'尼玛',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920141,3105,0,'滚犊子',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920142,3105,0,'杂种',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920143,3106,0,'代开发票',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920144,3106,0,'虚开',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920145,3106,0,'办证',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920146,3106,0,'刻章',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920147,3106,0,'刻章办证',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920148,3106,0,'非法贷款',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920149,3106,0,'黑户贷款',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920150,3106,0,'不上征信贷款',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920151,3106,0,'烟草广告',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920152,3106,0,'香烟批发',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920153,3106,0,'假证',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920154,3106,0,'假文凭',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920155,3106,0,'代写论文',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920156,3106,0,'论文代写',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920157,3106,0,'黑客',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920158,3106,0,'黑客攻击',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920159,3106,0,'入侵系统',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920160,3106,0,'盗号',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920161,3106,0,'刷量',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920162,3106,0,'刷粉',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920163,3106,0,'刷赞',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920164,3106,0,'刷评论',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920165,3106,0,'买卖个人信息',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920166,3106,0,'出售数据',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920167,3106,0,'非法获取公民信息',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920168,3106,0,'代办信用卡',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920169,3106,0,'套现',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920170,3106,0,'信用卡套现',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920171,3106,0,'pos机套现',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920172,3106,0,'违规放贷',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920173,3106,0,'医托',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (920174,3106,0,'药托',NULL,0,'2026-09-20 12:56:09','2026-09-20 12:56:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (2099671577043988481,3001,0,'违禁词','REJECT',1,'2026-09-15 09:28:09','2026-09-15 09:28:09');
INSERT INTO `msg_sensitive_word` (`word_id`, `group_id`, `tenant_id`, `word`, `action`, `is_deleted`, `create_time`, `update_time`) VALUES (2099671577215954946,3001,0,'敏感词','MASK',1,'2026-09-15 09:28:09','2026-09-15 09:28:09');
/*!40000 ALTER TABLE `msg_sensitive_word` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `msg_template`
--

LOCK TABLES `msg_template` WRITE;
/*!40000 ALTER TABLE `msg_template` DISABLE KEYS */;
INSERT INTO `msg_template` (`template_id`, `tenant_id`, `template_code`, `template_name`, `category_code`, `title_template`, `content_template`, `sender_type`, `priority`, `is_enabled`, `is_deleted`, `create_time`, `update_time`) VALUES (2096064191259516930,0,'TPL_1788575620680','欢迎模板','HOMEWORK_NOTICE','5c72328b69156164a8a177deb38cc3f1a5ae8277c6749c327c5d81116dd832e8:dkxD/8/b78dD2ppJ7Mgo5vw/zHwUghYtkur71Nnhl6c5lW9aK4zFXw==','d5036386ed9c64562f770274c9b1afef279ba35773e8c5ee1ff50f2899434bca:ympw3r3eHhKjd5za7H1kt9Sl4/e39EN3AS0TDbuugT377Ua+kbtpJOh9Uw==','admin','MEDIUM',1,0,'2026-09-05 10:33:41','2026-09-05 10:33:41');
INSERT INTO `msg_template` (`template_id`, `tenant_id`, `template_code`, `template_name`, `category_code`, `title_template`, `content_template`, `sender_type`, `priority`, `is_enabled`, `is_deleted`, `create_time`, `update_time`) VALUES (2096064478145716226,0,'TPL_1788575689152','欢迎模板','HOMEWORK_NOTICE','5c72328b69156164a8a177deb38cc3f1a5ae8277c6749c327c5d81116dd832e8:jswojfOiAAnc08LmQFPZR4CPNk55RgtVq2e1rL4alDQ+oxGMDhJPrw==','d5036386ed9c64562f770274c9b1afef279ba35773e8c5ee1ff50f2899434bca:x/vZm0RJwXWOcA5RZGBi/6q1HXM3Y0kpp/s9ki+t+JOc9o0En3eCcACQGg==','admin','MEDIUM',1,0,'2026-09-05 10:34:49','2026-09-05 10:34:49');
INSERT INTO `msg_template` (`template_id`, `tenant_id`, `template_code`, `template_name`, `category_code`, `title_template`, `content_template`, `sender_type`, `priority`, `is_enabled`, `is_deleted`, `create_time`, `update_time`) VALUES (2096068973177131009,0,'TPL_1788576760903','欢迎模板','HOMEWORK_NOTICE','5c72328b69156164a8a177deb38cc3f1a5ae8277c6749c327c5d81116dd832e8:YHq2SfB7L/VaT82Ub1XrYKP1fJHIcxu1uWpDa5bGrRsh+zKqJf3uBQ==','d5036386ed9c64562f770274c9b1afef279ba35773e8c5ee1ff50f2899434bca:sqeFaCSms/I24D666K41BkG5Qp6rzXub+JEtiyvBocqK7RCKyy5ADedtWw==','admin','MEDIUM',1,0,'2026-09-05 10:52:41','2026-09-05 10:52:41');
/*!40000 ALTER TABLE `msg_template` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
