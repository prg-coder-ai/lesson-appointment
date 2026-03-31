/*
 Navicat Premium Data Transfer

 Source Server         : mysql
 Source Server Type    : MySQL
 Source Server Version : 50727
 Source Host           : localhost:13306
 Source Schema         : zktdb

 Target Server Type    : MySQL
 Target Server Version : 50727
 File Encoding         : 65001

 Date: 19/01/2021 09:23:01
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
CREATE DATABASE IF NOT EXISTS zktdb 
DEFAULT CHARACTER SET utf8mb4   COLLATE utf8mb4_unicode_ci;
USE zktdb ;
-- ----------------------------
-- Table structure for alarmconfig
-- ----------------------------
DROP TABLE IF EXISTS `alarmconfig`;
CREATE TABLE `alarmconfig`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `LowAlarm2` double DEFAULT NULL,
  `LowAlarm1` double DEFAULT NULL,
  `HighAlarm1` double DEFAULT NULL,
  `HighAlarm2` double DEFAULT NULL,
  `Color_low2` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Color_low1` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Color_Normal` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Color_High1` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Color_High2` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for auth_group
-- ----------------------------
DROP TABLE IF EXISTS `auth_group`;
CREATE TABLE `auth_group`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `name`(`name`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for auth_group_permissions
-- ----------------------------
DROP TABLE IF EXISTS `auth_group_permissions`;
CREATE TABLE `auth_group_permissions`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `auth_group_permissions_group_id_permission_id_0cd325b0_uniq`(`group_id`, `permission_id`) USING BTREE,
  INDEX `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm`(`permission_id`) USING BTREE,
  CONSTRAINT `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `auth_group_permissions_group_id_b120cbf9_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for auth_permission
-- ----------------------------
DROP TABLE IF EXISTS `auth_permission`;
CREATE TABLE `auth_permission`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `content_type_id` int(11) NOT NULL,
  `codename` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `auth_permission_content_type_id_codename_01ab375a_uniq`(`content_type_id`, `codename`) USING BTREE,
  CONSTRAINT `auth_permission_content_type_id_2f476e4b_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 151 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Records of auth_permission
-- ----------------------------
INSERT INTO `auth_permission` VALUES (1, 'Can add group', 1, 'add_group');
INSERT INTO `auth_permission` VALUES (2, 'Can change group', 1, 'change_group');
INSERT INTO `auth_permission` VALUES (3, 'Can delete group', 1, 'delete_group');
INSERT INTO `auth_permission` VALUES (4, 'Can add permission', 2, 'add_permission');
INSERT INTO `auth_permission` VALUES (5, 'Can change permission', 2, 'change_permission');
INSERT INTO `auth_permission` VALUES (6, 'Can delete permission', 2, 'delete_permission');
INSERT INTO `auth_permission` VALUES (7, 'Can add user', 3, 'add_user');
INSERT INTO `auth_permission` VALUES (8, 'Can change user', 3, 'change_user');
INSERT INTO `auth_permission` VALUES (9, 'Can delete user', 3, 'delete_user');
INSERT INTO `auth_permission` VALUES (10, 'Can add content type', 4, 'add_contenttype');
INSERT INTO `auth_permission` VALUES (11, 'Can change content type', 4, 'change_contenttype');
INSERT INTO `auth_permission` VALUES (12, 'Can delete content type', 4, 'delete_contenttype');
INSERT INTO `auth_permission` VALUES (13, 'Can add log entry', 5, 'add_logentry');
INSERT INTO `auth_permission` VALUES (14, 'Can change log entry', 5, 'change_logentry');
INSERT INTO `auth_permission` VALUES (15, 'Can delete log entry', 5, 'delete_logentry');
INSERT INTO `auth_permission` VALUES (16, 'Can add session', 6, 'add_session');
INSERT INTO `auth_permission` VALUES (17, 'Can change session', 6, 'change_session');
INSERT INTO `auth_permission` VALUES (18, 'Can delete session', 6, 'delete_session');
INSERT INTO `auth_permission` VALUES (19, 'Can add para list data', 7, 'add_paralistdata');
INSERT INTO `auth_permission` VALUES (20, 'Can change para list data', 7, 'change_paralistdata');
INSERT INTO `auth_permission` VALUES (21, 'Can delete para list data', 7, 'delete_paralistdata');
INSERT INTO `auth_permission` VALUES (22, 'Can add para alarm config', 8, 'add_paraalarmconfig');
INSERT INTO `auth_permission` VALUES (23, 'Can change para alarm config', 8, 'change_paraalarmconfig');
INSERT INTO `auth_permission` VALUES (24, 'Can delete para alarm config', 8, 'delete_paraalarmconfig');
INSERT INTO `auth_permission` VALUES (25, 'Can add rtu register', 9, 'add_rturegister');
INSERT INTO `auth_permission` VALUES (26, 'Can change rtu register', 9, 'change_rturegister');
INSERT INTO `auth_permission` VALUES (27, 'Can delete rtu register', 9, 'delete_rturegister');
INSERT INTO `auth_permission` VALUES (28, 'Can add device install record', 10, 'add_deviceinstallrecord');
INSERT INTO `auth_permission` VALUES (29, 'Can change device install record', 10, 'change_deviceinstallrecord');
INSERT INTO `auth_permission` VALUES (30, 'Can delete device install record', 10, 'delete_deviceinstallrecord');
INSERT INTO `auth_permission` VALUES (31, 'Can add room', 11, 'add_room');
INSERT INTO `auth_permission` VALUES (32, 'Can change room', 11, 'change_room');
INSERT INTO `auth_permission` VALUES (33, 'Can delete room', 11, 'delete_room');
INSERT INTO `auth_permission` VALUES (34, 'Can add ih video model', 12, 'add_ihvideomodel');
INSERT INTO `auth_permission` VALUES (35, 'Can change ih video model', 12, 'change_ihvideomodel');
INSERT INTO `auth_permission` VALUES (36, 'Can delete ih video model', 12, 'delete_ihvideomodel');
INSERT INTO `auth_permission` VALUES (37, 'Can add ih dispatch workflow model', 13, 'add_ihdispatchworkflowmodel');
INSERT INTO `auth_permission` VALUES (38, 'Can change ih dispatch workflow model', 13, 'change_ihdispatchworkflowmodel');
INSERT INTO `auth_permission` VALUES (39, 'Can delete ih dispatch workflow model', 13, 'delete_ihdispatchworkflowmodel');
INSERT INTO `auth_permission` VALUES (40, 'Can add frame monitor', 14, 'add_framemonitor');
INSERT INTO `auth_permission` VALUES (41, 'Can change frame monitor', 14, 'change_framemonitor');
INSERT INTO `auth_permission` VALUES (42, 'Can delete frame monitor', 14, 'delete_framemonitor');
INSERT INTO `auth_permission` VALUES (43, 'Can add ih company model', 15, 'add_ihcompanymodel');
INSERT INTO `auth_permission` VALUES (44, 'Can change ih company model', 15, 'change_ihcompanymodel');
INSERT INTO `auth_permission` VALUES (45, 'Can delete ih company model', 15, 'delete_ihcompanymodel');
INSERT INTO `auth_permission` VALUES (46, 'Can add ih user nopay model', 16, 'add_ihusernopaymodel');
INSERT INTO `auth_permission` VALUES (47, 'Can change ih user nopay model', 16, 'change_ihusernopaymodel');
INSERT INTO `auth_permission` VALUES (48, 'Can delete ih user nopay model', 16, 'delete_ihusernopaymodel');
INSERT INTO `auth_permission` VALUES (49, 'Can add ih ex unit model', 17, 'add_ihexunitmodel');
INSERT INTO `auth_permission` VALUES (50, 'Can change ih ex unit model', 17, 'change_ihexunitmodel');
INSERT INTO `auth_permission` VALUES (51, 'Can delete ih ex unit model', 17, 'delete_ihexunitmodel');
INSERT INTO `auth_permission` VALUES (52, 'Can add customer', 18, 'add_customer');
INSERT INTO `auth_permission` VALUES (53, 'Can change customer', 18, 'change_customer');
INSERT INTO `auth_permission` VALUES (54, 'Can delete customer', 18, 'delete_customer');
INSERT INTO `auth_permission` VALUES (55, 'Can add device monitor', 19, 'add_devicemonitor');
INSERT INTO `auth_permission` VALUES (56, 'Can change device monitor', 19, 'change_devicemonitor');
INSERT INTO `auth_permission` VALUES (57, 'Can delete device monitor', 19, 'delete_devicemonitor');
INSERT INTO `auth_permission` VALUES (58, 'Can add ih pipe network model', 20, 'add_ihpipenetworkmodel');
INSERT INTO `auth_permission` VALUES (59, 'Can change ih pipe network model', 20, 'change_ihpipenetworkmodel');
INSERT INTO `auth_permission` VALUES (60, 'Can delete ih pipe network model', 20, 'delete_ihpipenetworkmodel');
INSERT INTO `auth_permission` VALUES (61, 'Can add company', 21, 'add_company');
INSERT INTO `auth_permission` VALUES (62, 'Can change company', 21, 'change_company');
INSERT INTO `auth_permission` VALUES (63, 'Can delete company', 21, 'delete_company');
INSERT INTO `auth_permission` VALUES (64, 'Can add building', 22, 'add_building');
INSERT INTO `auth_permission` VALUES (65, 'Can change building', 22, 'change_building');
INSERT INTO `auth_permission` VALUES (66, 'Can delete building', 22, 'delete_building');
INSERT INTO `auth_permission` VALUES (67, 'Can add alarm config', 23, 'add_alarmconfig');
INSERT INTO `auth_permission` VALUES (68, 'Can change alarm config', 23, 'change_alarmconfig');
INSERT INTO `auth_permission` VALUES (69, 'Can delete alarm config', 23, 'delete_alarmconfig');
INSERT INTO `auth_permission` VALUES (70, 'Can add employee', 24, 'add_employee');
INSERT INTO `auth_permission` VALUES (71, 'Can change employee', 24, 'change_employee');
INSERT INTO `auth_permission` VALUES (72, 'Can delete employee', 24, 'delete_employee');
INSERT INTO `auth_permission` VALUES (73, 'Can add ih station state model', 25, 'add_ihstationstatemodel');
INSERT INTO `auth_permission` VALUES (74, 'Can change ih station state model', 25, 'change_ihstationstatemodel');
INSERT INTO `auth_permission` VALUES (75, 'Can delete ih station state model', 25, 'delete_ihstationstatemodel');
INSERT INTO `auth_permission` VALUES (76, 'Can add data field definitions', 26, 'add_datafielddefinitions');
INSERT INTO `auth_permission` VALUES (77, 'Can change data field definitions', 26, 'change_datafielddefinitions');
INSERT INTO `auth_permission` VALUES (78, 'Can delete data field definitions', 26, 'delete_datafielddefinitions');
INSERT INTO `auth_permission` VALUES (79, 'Can add heat exchange station', 27, 'add_heatexchangestation');
INSERT INTO `auth_permission` VALUES (80, 'Can change heat exchange station', 27, 'change_heatexchangestation');
INSERT INTO `auth_permission` VALUES (81, 'Can delete heat exchange station', 27, 'delete_heatexchangestation');
INSERT INTO `auth_permission` VALUES (82, 'Can add ih pipe control model', 28, 'add_ihpipecontrolmodel');
INSERT INTO `auth_permission` VALUES (83, 'Can change ih pipe control model', 28, 'change_ihpipecontrolmodel');
INSERT INTO `auth_permission` VALUES (84, 'Can delete ih pipe control model', 28, 'delete_ihpipecontrolmodel');
INSERT INTO `auth_permission` VALUES (85, 'Can add ih energy model', 29, 'add_ihenergymodel');
INSERT INTO `auth_permission` VALUES (86, 'Can change ih energy model', 29, 'change_ihenergymodel');
INSERT INTO `auth_permission` VALUES (87, 'Can delete ih energy model', 29, 'delete_ihenergymodel');
INSERT INTO `auth_permission` VALUES (88, 'Can add rtu command', 30, 'add_rtucommand');
INSERT INTO `auth_permission` VALUES (89, 'Can change rtu command', 30, 'change_rtucommand');
INSERT INTO `auth_permission` VALUES (90, 'Can delete rtu command', 30, 'delete_rtucommand');
INSERT INTO `auth_permission` VALUES (91, 'Can add heatexchangerunit', 31, 'add_heatexchangerunit');
INSERT INTO `auth_permission` VALUES (92, 'Can change heatexchangerunit', 31, 'change_heatexchangerunit');
INSERT INTO `auth_permission` VALUES (93, 'Can delete heatexchangerunit', 31, 'delete_heatexchangerunit');
INSERT INTO `auth_permission` VALUES (94, 'Can add ih hotline model', 32, 'add_ihhotlinemodel');
INSERT INTO `auth_permission` VALUES (95, 'Can change ih hotline model', 32, 'change_ihhotlinemodel');
INSERT INTO `auth_permission` VALUES (96, 'Can delete ih hotline model', 32, 'delete_ihhotlinemodel');
INSERT INTO `auth_permission` VALUES (97, 'Can add ih dispatch model', 33, 'add_ihdispatchmodel');
INSERT INTO `auth_permission` VALUES (98, 'Can change ih dispatch model', 33, 'change_ihdispatchmodel');
INSERT INTO `auth_permission` VALUES (99, 'Can delete ih dispatch model', 33, 'delete_ihdispatchmodel');
INSERT INTO `auth_permission` VALUES (100, 'Can add community', 34, 'add_community');
INSERT INTO `auth_permission` VALUES (101, 'Can change community', 34, 'change_community');
INSERT INTO `auth_permission` VALUES (102, 'Can delete community', 34, 'delete_community');
INSERT INTO `auth_permission` VALUES (103, 'Can add rtu station', 35, 'add_rtustation');
INSERT INTO `auth_permission` VALUES (104, 'Can change rtu station', 35, 'change_rtustation');
INSERT INTO `auth_permission` VALUES (105, 'Can delete rtu station', 35, 'delete_rtustation');
INSERT INTO `auth_permission` VALUES (106, 'Can add heat exchange unit', 36, 'add_heatexchangeunit');
INSERT INTO `auth_permission` VALUES (107, 'Can change heat exchange unit', 36, 'change_heatexchangeunit');
INSERT INTO `auth_permission` VALUES (108, 'Can delete heat exchange unit', 36, 'delete_heatexchangeunit');
INSERT INTO `auth_permission` VALUES (109, 'Can view log entry', 5, 'view_logentry');
INSERT INTO `auth_permission` VALUES (110, 'Can view permission', 2, 'view_permission');
INSERT INTO `auth_permission` VALUES (111, 'Can view group', 1, 'view_group');
INSERT INTO `auth_permission` VALUES (112, 'Can view user', 3, 'view_user');
INSERT INTO `auth_permission` VALUES (113, 'Can view content type', 4, 'view_contenttype');
INSERT INTO `auth_permission` VALUES (114, 'Can view session', 6, 'view_session');
INSERT INTO `auth_permission` VALUES (115, 'Can view alarm config', 23, 'view_alarmconfig');
INSERT INTO `auth_permission` VALUES (116, 'Can view building', 22, 'view_building');
INSERT INTO `auth_permission` VALUES (117, 'Can view community', 34, 'view_community');
INSERT INTO `auth_permission` VALUES (118, 'Can view company', 21, 'view_company');
INSERT INTO `auth_permission` VALUES (119, 'Can view customer', 18, 'view_customer');
INSERT INTO `auth_permission` VALUES (120, 'Can view data field definitions', 26, 'view_datafielddefinitions');
INSERT INTO `auth_permission` VALUES (121, 'Can view device install record', 10, 'view_deviceinstallrecord');
INSERT INTO `auth_permission` VALUES (122, 'Can view device monitor', 19, 'view_devicemonitor');
INSERT INTO `auth_permission` VALUES (123, 'Can view employee', 24, 'view_employee');
INSERT INTO `auth_permission` VALUES (124, 'Can view frame monitor', 14, 'view_framemonitor');
INSERT INTO `auth_permission` VALUES (125, 'Can view heat exchange station', 27, 'view_heatexchangestation');
INSERT INTO `auth_permission` VALUES (126, 'Can view heat exchange unit', 36, 'view_heatexchangeunit');
INSERT INTO `auth_permission` VALUES (127, 'Can view ih company model', 15, 'view_ihcompanymodel');
INSERT INTO `auth_permission` VALUES (128, 'Can view ih dispatch model', 33, 'view_ihdispatchmodel');
INSERT INTO `auth_permission` VALUES (129, 'Can view ih dispatch workflow model', 13, 'view_ihdispatchworkflowmodel');
INSERT INTO `auth_permission` VALUES (130, 'Can view ih energy model', 29, 'view_ihenergymodel');
INSERT INTO `auth_permission` VALUES (131, 'Can view ih ex unit model', 17, 'view_ihexunitmodel');
INSERT INTO `auth_permission` VALUES (132, 'Can view ih hotline model', 32, 'view_ihhotlinemodel');
INSERT INTO `auth_permission` VALUES (133, 'Can view ih pipe control model', 28, 'view_ihpipecontrolmodel');
INSERT INTO `auth_permission` VALUES (134, 'Can view ih pipe network model', 20, 'view_ihpipenetworkmodel');
INSERT INTO `auth_permission` VALUES (135, 'Can view ih station state model', 25, 'view_ihstationstatemodel');
INSERT INTO `auth_permission` VALUES (136, 'Can view ih user nopay model', 16, 'view_ihusernopaymodel');
INSERT INTO `auth_permission` VALUES (137, 'Can view ih video model', 12, 'view_ihvideomodel');
INSERT INTO `auth_permission` VALUES (138, 'Can view para alarm config', 8, 'view_paraalarmconfig');
INSERT INTO `auth_permission` VALUES (139, 'Can view para list data', 7, 'view_paralistdata');
INSERT INTO `auth_permission` VALUES (140, 'Can view room', 11, 'view_room');
INSERT INTO `auth_permission` VALUES (141, 'Can view rtu command', 30, 'view_rtucommand');
INSERT INTO `auth_permission` VALUES (142, 'Can view rtu register', 9, 'view_rturegister');
INSERT INTO `auth_permission` VALUES (143, 'Can view rtu station', 35, 'view_rtustation');
INSERT INTO `auth_permission` VALUES (144, 'Can add ih energy statistics model', 37, 'add_ihenergystatisticsmodel');
INSERT INTO `auth_permission` VALUES (145, 'Can change ih energy statistics model', 37, 'change_ihenergystatisticsmodel');
INSERT INTO `auth_permission` VALUES (146, 'Can delete ih energy statistics model', 37, 'delete_ihenergystatisticsmodel');
INSERT INTO `auth_permission` VALUES (147, 'Can view ih energy statistics model', 37, 'view_ihenergystatisticsmodel');
INSERT INTO `auth_permission` VALUES (148, 'Can add para list data_temp', 38, 'add_paralistdata_temp');
INSERT INTO `auth_permission` VALUES (149, 'Can change para list data_temp', 38, 'change_paralistdata_temp');
INSERT INTO `auth_permission` VALUES (150, 'Can delete para list data_temp', 38, 'delete_paralistdata_temp');

-- ----------------------------
-- Table structure for auth_user
-- ----------------------------
DROP TABLE IF EXISTS `auth_user`;
CREATE TABLE `auth_user`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `password` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `last_login` datetime(6) DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
  `is_superuser` tinyint(1) DEFAULT NULL,
  `username` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `first_name` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `last_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(75) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_staff` tinyint(1) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,

  `date_joined` datetime(6) DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6), 

  `user_id` varchar(36) DEFAULT '' COMMENT '用户唯一标识（UUID）',
  `phone` varchar(11) DEFAULT '' COMMENT '手机号（11位，符合手机号格式）',
  `email` varchar(50)  DEFAULT '' COMMENT '邮箱（符合邮箱格式）', 
  `role` varchar(10) DEFAULT 'student' COMMENT '角色（student：学生，teacher：教师，admin：管理员）', ',
  `status` varchar(10) DEFAULT 'pendding' COMMENT '账号状态（pendding 待审核、active：激活，inactive：待审核，frozen：冻结）', 

  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for auth_user_groups
-- ----------------------------
DROP TABLE IF EXISTS `auth_user_groups`;
CREATE TABLE `auth_user_groups`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `group_id` int(11) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `auth_user_groups_user_id_group_id_94350c0c_uniq`(`user_id`, `group_id`) USING BTREE,
  INDEX `auth_user_groups_group_id_97559544_fk_auth_group_id`(`group_id`) USING BTREE,
  CONSTRAINT `auth_user_groups_group_id_97559544_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `auth_user_groups_user_id_6a12ed8b_fk_auth_user_id` FOREIGN KEY (`user_id`) REFERENCES `auth_user` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for building
-- ----------------------------
DROP TABLE IF EXISTS `building`;
CREATE TABLE `building`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '楼房自增编号',
  `Name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '楼房名称',
  `BuildingNo` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '楼号',
  `CommunityID` int(11) DEFAULT NULL COMMENT '小区编号',
  `StationID` int(11) DEFAULT NULL COMMENT '换热站',
  `Lati1` decimal(20, 10) NOT NULL COMMENT '维度1',
  `longi1` decimal(20, 10) NOT NULL COMMENT '经度1',
  `Lati2` decimal(20, 10) NOT NULL COMMENT '维度2',
  `longi2` decimal(20, 10) NOT NULL COMMENT '经度2',
  `FloorNumber` int(11) DEFAULT 0 COMMENT '楼层数',
  `Height` double NOT NULL COMMENT '地面高度',
  `Status` tinyint(4) NOT NULL COMMENT '状态(1,正常,2, 停用,3,\'删除)',
  `CreaterID` int(11) DEFAULT NULL COMMENT '添加人',
  `CreateTime` datetime(0) DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  `BuildingID` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '建筑物编号',
  `CrewID` varchar(34) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '所属机组编号',
  `HeatingArea` decimal(12, 2) DEFAULT NULL COMMENT '采暖面积',
  `BuildYear` int(11) DEFAULT NULL COMMENT '建造年份',
  `BuildingStructure` varchar(100) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL COMMENT '建筑结构',
  `IsEnergySaving` tinyint(4) DEFAULT NULL COMMENT '是否节能建筑',
  `IsMeasure` tinyint(4) DEFAULT NULL COMMENT '是否安装计量装置',
  `IsSeparateControl` tinyint(4) DEFAULT NULL COMMENT '是否分户控制',
  `EnergyConsumptionType` varchar(60) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL COMMENT '能耗分类',
  `NgasstandardID` int(11) DEFAULT NULL COMMENT '能耗分类ID',
  `BuildingType` varchar(60) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL COMMENT '建筑类型',
  `IsHeatMeteringTransformed` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '是否热计量改造',
  `HeatMeteringDate` datetime(0) DEFAULT NULL COMMENT '热计量改造年代',
  `IsWallinSulationTransformed` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '是否墙体保温改造',
  `WallinSulationDate` datetime(0) DEFAULT NULL COMMENT '墙体保温改造年代',
  `Address` varchar(200) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL COMMENT '地址',
  `Remark` varchar(400) CHARACTER SET utf8 COLLATE utf8_general_ci DEFAULT NULL COMMENT '备注',
  `UpdateTime` datetime(0) DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1992 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '楼房信息表' ROW_FORMAT = Compact;

-- ---------- ----------------------------
-- Table structure for company
-- ----------------------------
DROP TABLE IF EXISTS `company`;
CREATE TABLE `company`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `Name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `Address` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `Contact` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `ContactWay` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `ParentID` int(11) DEFAULT 0 COMMENT '父公司',
  `Status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '状态(1,正常,2, 停用,3,\'删除)',
  `CreateTime` datetime(0) DEFAULT CURRENT_TIMESTAMP COMMENT '创建日期',
  `HeatCompanyID` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '市平台公司编号',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 17 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '热力公司' ROW_FORMAT = Compact;

-- ----------------------------
-- Records of company
-- ----------------------------
INSERT INTO `company` VALUES (1, '法语学习系统', '巴黎', '无', '无', 0, 1, '2021-01-18 10:18:35', '130400023');
INSERT INTO `company` VALUES (2, '英语学习系统', '伦敦', '无', '无', 0, 1, '2021-01-18 10:19:09', '130400023');
INSERT INTO `company` VALUES (3, '法语一分部', '无', '无', '无', 1, 1, '2020-11-16 15:25:25', '130400023');
INSERT INTO `company` VALUES (4, '法语二分部', '无', '无', '无', 1, 1, '2020-11-16 15:24:16', '130400023');
INSERT INTO `company` VALUES (5, '法语三分部', '无', '无', '无', 1, 1, '2020-11-16 15:27:23', '130400023');
INSERT INTO `company` VALUES (6, '法语四分部', '无', '无', '无', 1, 1, '2020-11-16 15:27:28', '130400023');
INSERT INTO `company` VALUES (7, '英语一分部', '无', '无', '无', 2, 1, '2019-03-30 14:50:16', '130400023');
INSERT INTO `company` VALUES (8, '英语二分部', '无', '无', '无', 1, 3, '2019-03-25 13:06:01', '130400023');
INSERT INTO `company` VALUES (9, '英语三分部', '无', '无', '无', 1, 3, '2020-11-16 15:24:32', '130400023');
INSERT INTO `company` VALUES (10, '英语四分部', '未设置', '未设置', '未设置', 1, 3, '2018-11-27 14:07:24', '130400023');
INSERT INTO `company` VALUES (11, '汉语学习', '北京', '无', '无', 0, 1, '2019-01-15 21:56:02', '130400023');
INSERT INTO `company` VALUES (12, '汉语一部', '北京', '无', '无', 11, 1, '2019-02-20 08:26:21', '130400023');
INSERT INTO `company` VALUES (13, '汉语二部', '卡尔加里', '', '', 11, 1, '2019-04-09 15:52:29', '130400023');
INSERT INTO `company` VALUES (14, '汉语三部', '广州', '无', '无', 11, 1, '2020-11-16 15:27:43', '130400023');
 ;

-- ----------------------------
-- Table structure for customer
-- ----------------------------
DROP TABLE IF EXISTS `customer`;
CREATE TABLE `customer`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '住户自增编号',
  `Name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '姓名',
  `Birthday` date DEFAULT NULL COMMENT '生日',
  `Gender` tinyint(4) NOT NULL DEFAULT 1 COMMENT '性别(0,未知,1,男,2,女)',
  `Interest` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '兴趣',
  `PhoneNumber` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '电话',
  `CID` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '身份证号',
  `CheckInTime` date DEFAULT NULL COMMENT '入住时间',
  `Account` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '账号',
  `Password` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '密码',
  `Download` tinyint(1) DEFAULT 0 COMMENT '是否下载',
  `Registered` tinyint(1) DEFAULT 0 COMMENT '是否注册',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '住户信息表' ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for devicemonitor
-- ----------------------------
DROP TABLE IF EXISTS `devicemonitor`;
CREATE TABLE `devicemonitor`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `DeviceID` int(11) DEFAULT NULL,
  `PositionID` int(11) DEFAULT NULL,
  `AlarmType` int(11) DEFAULT NULL,
  `AlarmTime` date DEFAULT NULL,
  `value` double DEFAULT NULL,
  `param` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Result` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for employee
-- ----------------------------
DROP TABLE IF EXISTS `employee`;
CREATE TABLE `employee`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '人员编号',
  `Account` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '账号',
  `Password` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '密码',
  `Name1` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '姓',
  `Name2` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '名',
  `StationID` int(11) NOT NULL DEFAULT 0 COMMENT '所属分部',
  `CompanyID` int(11) NOT NULL DEFAULT 0 COMMENT '所属公司',
  `Department` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '部门',
  `Privilege` tinyint(4) NOT NULL DEFAULT 1 COMMENT '权限等级(1,操作员, 2,安装人员, 3,管理员,  4,维护人员)',
  `Status` tinyint(4) NOT NULL DEFAULT 0 COMMENT '状态(0待审核, 1正常, 2停用, 3删除, 4审核拒绝 5frozen：冻结)',


  `user_id` varchar(36) DEFAULT '' COMMENT '用户唯一标识（UUID）',
  `phone` varchar(11) DEFAULT '' COMMENT '手机号（11位，符合手机号格式）',
  `email` varchar(50)  DEFAULT '' COMMENT '邮箱（符合邮箱格式）', 
  `role` varchar(10) DEFAULT 'student' COMMENT '角色（student：学生，teacher：教师，admin：管理员），可与Privilege合并',  
 

  `CreaterID` int(11) NOT NULL DEFAULT 0 COMMENT '添加人',
  `CreateTime` datetime(0) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP(0) COMMENT '添加时间',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 147 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '工作人员信息表' ROW_FORMAT = Compact;

-- ----------------------------
-- Records of employee
-- ----------------------------
INSERT INTO `employee` VALUES (107, 'liuqing', '8200b17f0eb753a3715c6f998ff9f177', 'qing', 'liuqing', -1, 1, '', 1, 1, -1, '2020-11-16 15:59:32');
INSERT INTO `employee` VALUES (108, 'work1b', '22912d4a31b7b781529990175d8cf003', '1-1', 'work1b', -1, 2, '', 1, 1, -1, '2020-12-31 03:09:19');

-- ----------------------------
-- Table structure for heatexchangerunit
-- ----------------------------
DROP TABLE IF EXISTS `heatexchangerunit`;
CREATE TABLE `heatexchangerunit`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增编号',
  `StationID` int(11) DEFAULT 0 COMMENT '换热站编号',
  `UnitNumber` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '机组名称',
  `CreateTime` datetime(0) DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `CreaterID` int(11) DEFAULT 0 COMMENT '创建人',
  `Status` tinyint(4) DEFAULT 1 COMMENT '状态(1:正常,2:停用,3: 删除)',
  `CrewID` varchar(34) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '市平台机组编号',
  `Address` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '换热机组地址',
  `UpdateTime` datetime(0) DEFAULT NULL,
  `UpdateDesc` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 13 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '换热机组' ROW_FORMAT = Compact;

-- ----------------------------
-- Records of heatexchangerunit
-- ----------------------------
INSERT INTO `heatexchangerunit` VALUES (3, 2, '小河西村 650KW', '2020-11-16 15:50:32', -1, 1, '21010201', '', NULL, NULL);
INSERT INTO `heatexchangerunit` VALUES (4, 3, '东西张村 4100KW', '2020-11-16 15:50:39', -1, 1, '21010202', '', NULL, NULL);
INSERT INTO `heatexchangerunit` VALUES (5, 4, '王沟村700KW', '2020-11-16 15:50:46', -1, 1, '21010301', '', NULL, NULL);
INSERT INTO `heatexchangerunit` VALUES (6, 5, '沟东蔡河3085KW', '2020-11-16 15:50:51', -1, 1, '21010302', '', NULL, NULL);
INSERT INTO `heatexchangerunit` VALUES (7, 7, '东莒张庄1556KW', '2021-01-18 10:25:13', -1, 1, '21010401', '', NULL, '');
INSERT INTO `heatexchangerunit` VALUES (8, 8, '坛岭头1355KW', '2021-01-18 10:25:03', -1, 1, '21010402', '', NULL, '');
INSERT INTO `heatexchangerunit` VALUES (9, 9, '西村东庄1420KW', '2021-01-18 10:24:56', -1, 1, '21020101', '', NULL, '');
INSERT INTO `heatexchangerunit` VALUES (10, 10, '刘轩窑1520KW', '2021-01-18 10:24:48', -1, 1, '21020102', '', NULL, '');
INSERT INTO `heatexchangerunit` VALUES (11, 11, '南义城4200KW', '2021-01-18 10:24:33', -1, 1, '21020201', '', NULL, '');
INSERT INTO `heatexchangerunit` VALUES (12, 11, '郝庄1500KW', '2021-01-18 10:24:42', -1, 1, '21020202', '', NULL, '');

-- ----------------------------
-- Table structure for heatexchangestation
-- ----------------------------
DROP TABLE IF EXISTS `heatexchangestation`;
CREATE TABLE `heatexchangestation`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '换热站编号',
  `Name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '站名',
  `CompanyID` int(11) DEFAULT NULL COMMENT '所属分公司',
  `Lati` decimal(20, 10) DEFAULT NULL COMMENT '维度',
  `Longi` decimal(20, 10) DEFAULT NULL COMMENT '经度',
  `Rsv1` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '保留1',
  `Rsv2` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '保留2',
  `Status` tinyint(4) DEFAULT 1 COMMENT '状态(1:正常,2:停用,3: 删除)',
  `CreaterID` int(11) DEFAULT NULL COMMENT '添加人',
  `CreateTime` datetime(0) DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  `ExternalNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '外部编号',
  `ParentID` int(11) DEFAULT 0 COMMENT '父级换热站编号',
  `HeatStationID` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '市平台热力站编号',
  `HeatingArea` decimal(12, 2) DEFAULT 0.00 COMMENT '总供热面积(㎡）',
  `Height` double NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 12 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '换热站' ROW_FORMAT = Compact;

-- ----------------------------
-- Records of heatexchangestation
-- ----------------------------
INSERT INTO `heatexchangestation` VALUES (1, '1号站', 1, 0.0000000000, 0.0000000000, '', '', 1, -1, '2020-11-16 15:35:53', '', 0, '0', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (2, '2号站', 2, 35.6500570000, 112.9276490000, '第二站', '一个机组', 1, -1, '2021-01-18 10:21:11', '32417', 0, '2', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (3, '3号站', 2, 35.6647020000, 112.9393160000, '一个机组', '一个机组', 1, -1, '2021-01-18 10:21:29', '32422', 0, '3', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (4, '4号站', 2, 35.6440140000, 112.9453860000, '一个机组', '一个机组', 1, -1, '2021-01-18 10:21:44', '32423', 0, '4', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (5, '5号站', 2, 35.6606780000, 112.9521720000, '一个机组', '一个机组', 1, -1, '2021-01-18 10:21:54', '32436', 0, '5', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (7, '6号站', 2, 35.6606780000, 112.9521720000, '一个机组', '一个机组', 1, -1, '2021-01-18 10:22:05', '32348', 0, '7', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (8, '7号站', 2, 35.6690550000, 112.9629630000, '供热户数xxx户', '管线长度xxx延米', 1, -1, '2021-01-18 10:23:01', '32412', 0, '8', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (9, '8号站', 2, 35.6758770000, 112.9458980000, '一个机组', '一个机组', 1, -1, '2021-01-18 10:23:13', '32413', 0, '9', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (10, '9号站', 2, 35.6758770000, 112.9458980000, '一个机组', '一个机组', 1, -1, '2021-01-18 10:23:26', '32106', 0, '10', 0.00, 0);
INSERT INTO `heatexchangestation` VALUES (11, '10号站', 2, 35.6325910000, 112.9590520000, '供热户数xxx户', '2个机组', 1, -1, '2021-01-18 10:23:44', '32414', 0, '11', 0.00, 0);

-- ----------------------------
-- Table structure for ihexunit
-- ----------------------------
DROP TABLE IF EXISTS `ihexunit`;
CREATE TABLE `ihexunit`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stationid` int(11) NOT NULL,
  `unitid` int(11) NOT NULL,
  `state` int(11) NOT NULL,
  `unitType` int(11) NOT NULL,
  `svgFileName` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `dataValid` int(11) NOT NULL,
  `ModifyDate` datetime(6) DEFAULT NULL,
  `Mem` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `unitname` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for ihstationstate
-- ----------------------------
DROP TABLE IF EXISTS `ihstationstate`;
CREATE TABLE `ihstationstate`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `state` int(11) DEFAULT NULL,
  `stateString` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ModifyDate` datetime(6) DEFAULT NULL,
  `companyid` int(11) DEFAULT NULL,
  `stationid` int(11) DEFAULT NULL,
  `rtuid` int(11) DEFAULT NULL,
  `stationCode` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dataValid` int(11) DEFAULT NULL,
  `Mem` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for mumberlist
-- ----------------------------
DROP TABLE IF EXISTS `mumberlist`;
CREATE TABLE `mumberlist`  (
  `uid` int(11) DEFAULT NULL,
  `stationid` int(11) DEFAULT NULL,
  `cnt` int(11) DEFAULT NULL
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Records of mumberlist
-- ----------------------------
INSERT INTO `mumberlist` VALUES (6, 2, 2);
INSERT INTO `mumberlist` VALUES (7, 3, 3);
INSERT INTO `mumberlist` VALUES (10, 4, 2);
INSERT INTO `mumberlist` VALUES (12, 5, 2);
INSERT INTO `mumberlist` VALUES (14, 6, 2);
INSERT INTO `mumberlist` VALUES (15, 7, 4);
INSERT INTO `mumberlist` VALUES (16, 8, 3);
INSERT INTO `mumberlist` VALUES (19, 9, 1);
INSERT INTO `mumberlist` VALUES (20, 10, 2);
INSERT INTO `mumberlist` VALUES (22, 11, 1);
INSERT INTO `mumberlist` VALUES (23, 12, 1);
INSERT INTO `mumberlist` VALUES (25, 14, 1);
INSERT INTO `mumberlist` VALUES (26, 15, 1);
INSERT INTO `mumberlist` VALUES (28, 16, 2); 
-- ----------------------------
-- Table structure for paraalarmconfig
-- ----------------------------
DROP TABLE IF EXISTS `paraalarmconfig`;
CREATE TABLE `paraalarmconfig`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stationID` int(11) DEFAULT NULL,
  `exchunitID` int(11) DEFAULT NULL,
  `paramID` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Alarm1Type` int(11) DEFAULT NULL,
  `Alarm12ype` int(11) DEFAULT NULL,
  `LowAlarm2` double DEFAULT NULL,
  `LowAlarm1` double DEFAULT NULL,
  `HighAlarm1` double DEFAULT NULL,
  `HighAlarm2` double DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for paralisthistory
-- ----------------------------
DROP TABLE IF EXISTS `paralisthistory`;
CREATE TABLE `paralisthistory`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stationCode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `subID` int(11) DEFAULT NULL,
  `fieldsNum` int(11) DEFAULT NULL,
  `FrameCounter` int(11) DEFAULT NULL,
  `DataLength` int(11) DEFAULT NULL,
  `AddTime` datetime(6) DEFAULT NULL,
  `p4001` int(11) DEFAULT NULL,
  `p4002` int(11) DEFAULT NULL,
  `p4003` double DEFAULT NULL,
  `p4004` double DEFAULT NULL,
  `p4005` int(11) DEFAULT NULL,
  `p4006` double DEFAULT NULL,
  `p4007` double DEFAULT NULL,
  `p4008` int(11) DEFAULT NULL,
  `p4009` double DEFAULT NULL,
  `p4010` double DEFAULT NULL,
  `p4011` double DEFAULT NULL,
  `p4012` double DEFAULT NULL,
  `p4013` double DEFAULT NULL,
  `p4014` double DEFAULT NULL,
  `p4015` double DEFAULT NULL,
  `p4016` double DEFAULT NULL,
  `p4017` double DEFAULT NULL,
  `p4018` double DEFAULT NULL,
  `p4019` double DEFAULT NULL,
  `p4020` double DEFAULT NULL,
  `p4021` double DEFAULT NULL,
  `p4022` int(11) DEFAULT NULL,
  `p4023` double DEFAULT NULL,
  `p4024` double DEFAULT NULL,
  `p4025` int(11) DEFAULT NULL,
  `p4026` double DEFAULT NULL,
  `p4027` double DEFAULT NULL,
  `p4028` int(11) DEFAULT NULL,
  `p4029` double DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 10921 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- Table structure for paralistrealtime
-- ----------------------------
DROP TABLE IF EXISTS `paralistrealtime`;
CREATE TABLE `paralistrealtime`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stationCode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '暂时用做注册码，可以在数据写入时填写站名称。',
  `subID` int(11) DEFAULT NULL,
  `fieldsNum` int(11) DEFAULT NULL,
  `FrameCounter` int(11) DEFAULT NULL,
  `DataLength` int(11) DEFAULT NULL,
  `AddTime` datetime(6) DEFAULT NULL,
  `p4001` int(11) DEFAULT NULL,
  `p4002` int(11) DEFAULT NULL,
  `p4003` double DEFAULT NULL,
  `p4004` double DEFAULT NULL,
  `p4005` int(11) DEFAULT NULL,
  `p4006` double DEFAULT NULL,
  `p4007` double DEFAULT NULL,
  `p4008` int(11) DEFAULT NULL,
  `p4009` double DEFAULT NULL,
  `p4010` double DEFAULT NULL,
  `p4011` double DEFAULT NULL,
  `p4012` double DEFAULT NULL,
  `p4013` double DEFAULT NULL,
  `p4014` double DEFAULT NULL,
  `p4015` double DEFAULT NULL,
  `p4016` double DEFAULT NULL,
  `p4017` double DEFAULT NULL,
  `p4018` double DEFAULT NULL,
  `p4019` double DEFAULT NULL,
  `p4020` double DEFAULT NULL,
  `p4021` double DEFAULT NULL,
  `p4022` int(11) DEFAULT NULL,
  `p4023` double DEFAULT NULL,
  `p4024` double DEFAULT NULL,
  `p4025` int(11) DEFAULT NULL,
  `p4026` double DEFAULT NULL,
  `p4027` double DEFAULT NULL,
  `p4028` int(11) DEFAULT NULL,
  `p4029` double DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 11881 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
--
-- ----------------------------
-- Table structure for rtucommand
-- ----------------------------
DROP TABLE IF EXISTS `rtucommand`;
CREATE TABLE `rtucommand`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rtu` int(11) DEFAULT NULL,
  `stationCode` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `subid` int(11) DEFAULT NULL,
  `register` int(11) DEFAULT NULL,
  `value` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `command` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `event` int(11) DEFAULT NULL,
  `createdate` datetime(6) DEFAULT NULL,
  `senddate` datetime(6) DEFAULT NULL,
  `echodate` datetime(6) DEFAULT NULL,
  `Mem` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 100 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- -------------------------- 
-- ----------------------------
-- Table structure for rturegister
-- ----------------------------
DROP TABLE IF EXISTS `rturegister`;
CREATE TABLE `rturegister`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rtu` int(11) DEFAULT NULL,
  `ststionCode` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `event` int(11) DEFAULT NULL,
  `date` datetime(6) DEFAULT NULL,
  `Mem` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 12 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;
 

-- ----------------------------
-- Table structure for rtustation
-- ----------------------------
DROP TABLE IF EXISTS `rtustation`;
CREATE TABLE `rtustation`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `stationID` int(11) DEFAULT NULL COMMENT 'point to heatexchangeStation的id',
  `stationCode` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stationName` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `number` int(11) DEFAULT NULL,
  `dataValid` int(11) DEFAULT NULL,
  `ModifyDate` datetime(6) DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(6),
  `Mem` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 9033 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Records of rtustation
-- ----------------------------
INSERT INTO `rtustation` VALUES (9023, 2, 'DTU002', '2号站-小河西村', 1, 1, '2021-01-11 14:25:27.174383', '');
INSERT INTO `rtustation` VALUES (9024, 3, 'DTU003', '3号站-东西张村', 1, 1, '2021-01-11 14:36:29.405484', '');
INSERT INTO `rtustation` VALUES (9025, 4, 'DTU004', '4号站', 1, 1, '2021-01-12 15:01:32.745000', 'test2');
INSERT INTO `rtustation` VALUES (9026, 5, 'DTU005', '5号站-沟东-蔡河', 1, 1, '2021-01-11 14:25:42.810597', '');
INSERT INTO `rtustation` VALUES (9027, 6, 'DTU006', '6号站 东莒-张庄', 1, 1, '2021-01-11 14:25:50.797902', '');
INSERT INTO `rtustation` VALUES (9028, 7, 'DTU007', '7号站 坛岭头', 1, 1, '2021-01-11 14:25:54.403879', '');
INSERT INTO `rtustation` VALUES (9029, 8, 'DTU008', '8号站 西村东庄', 1, 1, '2021-01-11 14:25:57.636266', '');
INSERT INTO `rtustation` VALUES (9030, 9, 'DTU009', '9号站 刘轩窑', 1, 1, '2021-01-11 14:26:01.178501', '');
INSERT INTO `rtustation` VALUES (9031, 10, 'DTU010', '10号站 南义城-郝庄', 2, 1, '2021-01-11 14:26:11.223445', '');
INSERT INTO `rtustation` VALUES (9032, 11, 'DTU011', '10号站', 2, 1, '2021-01-18 10:26:28.612000', '');

SET FOREIGN_KEY_CHECKS = 1;


-- 课程模板表：存储统一的课程模板信息，对应CourseTemplate实体
CREATE TABLE IF NOT EXISTS `course_template` (
  `template_id` varchar(36) NOT NULL COMMENT '模板唯一标识（UUID）',
  `language_type` varchar(20) NOT NULL COMMENT '语言类型（枚举：英语/日语/韩语/法语/德语/西班牙语）',
  `difficulty_level` varchar(20) NOT NULL COMMENT '难度等级（枚举：入门/进阶/中级/高级）',
  `class_fee` decimal(10,2) NOT NULL COMMENT '课时费（≥0，保留2位小数）',
  `class_duration` int NOT NULL COMMENT '课程时长（≥15，15的倍数，单位：分钟）',
  `class_form` varchar(20) NOT NULL COMMENT '课程形式（枚举：一对一/小班课/大班课）',
  `description` varchar(500) NOT NULL COMMENT '课程描述（10-500字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `uk_lang_level` (`language_type`,`difficulty_level`) COMMENT '语言类型+难度等级唯一，避免重复模板'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程模板表';



-- 教师课程表：存储教师基于模板创建的具体课程，对应Course实体
CREATE TABLE IF NOT EXISTS `course` (
  `course_id` varchar(36) NOT NULL COMMENT '课程唯一标识（UUID）',
  `template_id` varchar(36) NOT NULL COMMENT '关联的课程模板ID',
  `course_name` varchar(50) NOT NULL COMMENT '课程名称（2-50字）',
  `content` varchar(1000) NOT NULL COMMENT '教学内容（10-1000字）',
  `feature` varchar(1000) NOT NULL COMMENT '课程特色（10-1000字）',
  `teacher_id` varchar(36) NOT NULL COMMENT '关联的教师ID（对应user表的user_id）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`course_id`),
  KEY `fk_template_id` (`template_id`) COMMENT '关联课程模板索引',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引',
  CONSTRAINT `fk_course_template` FOREIGN KEY (`template_id`) REFERENCES `course_template` (`template_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_course_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教师课程表';

-- 课程排期表：存储教师课程的具体排期信息，对应Schedule实体
CREATE TABLE IF NOT EXISTS `schedule` (
  `schedule_id` varchar(36) NOT NULL COMMENT '排期唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的教师课程ID',
  `start_time` datetime NOT NULL COMMENT '排期开始时间（格式：YYYY-MM-DD HH:mm:ss）',
  `end_time` datetime NOT NULL COMMENT '排期结束时间（格式：YYYY-MM-DD HH:mm:ss）',
  `is_repeat` tinyint(1) NOT NULL COMMENT '是否重复（0：不重复，1：重复）',
  `repeat_week` int DEFAULT NULL COMMENT '重复日期（1-7，对应周一至周日，is_repeat=1时必填）',
  `status` varchar(20) NOT NULL DEFAULT 'available' COMMENT '排期状态（available：可预约，unavailable：不可预约）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`schedule_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `idx_start_end_time` (`start_time`,`end_time`) COMMENT '时间索引，用于排期冲突校验',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于可预约排期查询',
  CONSTRAINT `fk_schedule_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  -- 校验结束时间大于开始时间
  CHECK (`end_time` > `start_time`),
  -- 校验重复排期时repeat_week必填且在1-7之间
  CHECK ((`is_repeat` = 0 AND `repeat_week` IS NULL) OR (`is_repeat` = 1 AND `repeat_week` BETWEEN 1 AND 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程排期表';

-- 预约表：存储学生预约课程的信息，对应Booking实体
CREATE TABLE IF NOT EXISTS `booking` (  
  `booking_id` varchar(36) NOT NULL COMMENT '预约唯一标识（UUID）',
  `schedule_id` varchar(36) NOT NULL COMMENT '关联的课程排期ID',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `status` varchar(20) NOT NULL DEFAULT 'booked' COMMENT '预约状态（booked：已预约，cancelled：已取消，completed：已完成）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`booking_id`),
  KEY `fk_schedule_id` (`schedule_id`) COMMENT '关联排期索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  KEY `idx_status` (`status`) COMMENT '状态索引，用于预约状态查询',
  CONSTRAINT `fk_booking_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `schedule` (`schedule_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_booking_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='预约表';

-- 课程评价：存储学生对课程的评价信息，对应CourseEvaluation实体
CREATE TABLE IF NOT EXISTS `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `booking_id`  varchar(36) NOT NULL COMMENT '关联的预约ID',
  `student_id` varchar(36) NOT NULL COMMENT '关联的学生ID（对应user表的user_id）',
  `rating` int NOT NULL COMMENT '评分（1-5）',
  `comment` varchar(1000) DEFAULT NULL COMMENT '评价内容（最多1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`evaluation_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引',
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (`rating` BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程评价表'; 

-- 1 课程反馈实体类，对应设计2.4 后续流程-课程反馈功能 ---更新 mysql表结构，增加课程反馈表（course_feedback），满足学生和教师提交课程反馈的需求，包含反馈内容、处理状态和处理内容等字段，支持管理员对反馈进行处理和记录处理结果。
CREATE TABLE IF NOT EXISTS `course_feedback` (
  `feedback_id` varchar(36) NOT NULL COMMENT '反馈唯一标识（UUID）',
  `course_id` varchar(36) NOT NULL COMMENT '关联的课程ID',
  `user_id` varchar(36) NOT NULL COMMENT '关联的用户ID（对应user表的user_id）',
  `content` varchar(1000) DEFAULT NULL COMMENT '反馈内容（最多1000字）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `handle_id` varchar(36) NOT NULL COMMENT '管理员关联的用户ID（对应user表的user_id）',
  `handle_status` varchar(36) NOT NULL COMMENT '处理状态：0 pending（待处理）/1 handled（已处理）',
  `handle_content` varchar(1000) DEFAULT NULL COMMENT '处理内容（管理员填写）',
  `handle_time` datetime DEFAULT NULL COMMENT '处理时间',

  PRIMARY KEY (`feedback_id`),
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引',
  KEY `fk_user_id` (`user_id`) COMMENT '关联用户索引',
  CONSTRAINT `fk_feedback_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程反馈表';

--CourseCheckIn表：存储学生的课程签到信息，对应CourseCheckIn实体，用于确认课程是否按时参加，后续可用于统计学生出勤率等功能
CREATE TABLE IF NOT EXISTS `course_check_in` (
  `check_in_id` varchar(36) NOT NULL COMMENT '签到唯一标识（UUID）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID',
  `check_in_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '签到时间',
  PRIMARY KEY (`check_in_id`),
  KEY `fk_booking_id` (`booking_id`) COMMENT '关联预约索引',
  CONSTRAINT `fk_check_in_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程签到表';

--2 课程评价表：存储学生上完课后的评价信息，对应CourseEvaluation实体
CREATE TABLE IF NOT EXISTS `course_evaluation` (
  `evaluation_id` varchar(36) NOT NULL COMMENT '评价唯一标识（UUID）',
  `booking_id` varchar(36) NOT NULL COMMENT '关联的预约ID（课程结束后可评价）',
  `student_id` varchar(36) NOT NULL COMMENT '评价学生ID（对应user表，角色为student）',
  `teacher_id` varchar(36) NOT NULL COMMENT '被评价教师ID（对应user表，角色为teacher）',
  `course_id` varchar(36) NOT NULL COMMENT '被评价课程ID（对应course表）',
  `score` int NOT NULL COMMENT '评价分数（1-5分，必填）',
  `content` varchar(500) DEFAULT NULL COMMENT '评价内容（0-500字，可选）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评价创建时间',
  PRIMARY KEY (`evaluation_id`),
  UNIQUE KEY `uk_booking_id` (`booking_id`) COMMENT '一个预约对应一条评价，避免重复评价',
  KEY `fk_student_id` (`student_id`) COMMENT '关联学生索引，用于学生评价查询',
  KEY `fk_teacher_id` (`teacher_id`) COMMENT '关联教师索引，用于教师评价统计',
  KEY `fk_course_id` (`course_id`) COMMENT '关联课程索引，用于课程评价查询',
  CONSTRAINT `fk_evaluation_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_student` FOREIGN KEY (`student_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_evaluation_course` FOREIGN KEY (`course_id`) REFERENCES `course` (`course_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (`score` BETWEEN 1 AND 5) -- 校验分数范围
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程评价表';
