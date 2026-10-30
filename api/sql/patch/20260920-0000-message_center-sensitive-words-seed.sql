-- ============================================================
-- 敏感词种子数据（平台级 tenant_id = 0）
-- 适用库：message_center；表：msg_sensitive_group / msg_sensitive_word
-- 生成日期：2026-09-20
--
-- 依据：国内《网络安全法》《互联网信息服务管理办法》《网络信息内容
-- 生态治理规定》中对"违法和不良信息"的界定，按内容安全类别组织。
--
-- ⚠ 合规边界说明（重要）：
--   1) 本文件只收录"明确违反法律法规的通用违规范畴词"（色情、赌博、
--      诈骗、暴恐违禁品、辱骂歧视、违法引流广告）。
--   2) 涉及"国家安全 / 政治类"的违禁词（如分裂国家、颠覆政权、
--      领导人相关等），不应由 AI 凭空生成具体词汇——既不准确也不合规。
--      该类应通过对接官方权威渠道（网信办/全国违法和不良信息举报
--      中心相关关键词）或第三方内容安全服务（阿里云内容安全、腾讯云
--      天御等）来补充。文件末尾已预留分组 3107（不插入具体词）。
--   3) 词根为 DFA 模糊匹配使用，可能误伤正常语境，生产环境务必结合
--      上下文识别与人工复核；建议以"官方词库 + 本种子"双源维护。
--
-- 执行方式：
--   - 本环境表已存在，建表段（IF NOT EXISTS）会自动跳过，安全可重跑；
--   - 分组/词均用 INSERT IGNORE + 固定主键，重复执行不冲突；
--   - 系统预置分组 3001（默认敏感词组）未被本文件改动。
-- ============================================================

-- ---------- 建表（全新部署才需要，已存在则跳过） ----------
CREATE TABLE IF NOT EXISTS `msg_sensitive_group` (
  `group_id`            BIGINT       NOT NULL,
  `tenant_id`           BIGINT       DEFAULT 0,
  `group_name`          VARCHAR(128) NOT NULL,
  `default_action`      VARCHAR(16)  NOT NULL COMMENT 'REJECT=拒绝发送 / MASK=掩码放行',
  `is_system_predefined` INT         DEFAULT 0,
  `is_deleted`          INT         DEFAULT 0,
  `create_time`         DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `update_time`         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='敏感词分组';

CREATE TABLE IF NOT EXISTS `msg_sensitive_word` (
  `word_id`   BIGINT       NOT NULL,
  `group_id`  BIGINT       NOT NULL,
  `tenant_id` BIGINT       DEFAULT 0,
  `word`      VARCHAR(128) NOT NULL,
  `action`    VARCHAR(16)  DEFAULT NULL COMMENT 'REJECT / MASK；NULL=继承分组默认',
  `is_deleted` INT         DEFAULT 0,
  `create_time` DATETIME   DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`word_id`),
  KEY `idx_group` (`group_id`),
  KEY `idx_word` (`word`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='敏感词';

-- ---------- 分类分组（平台级，系统预置） ----------
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3101,0,'色情低俗与违禁内容','REJECT',1,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3102,0,'赌博博彩','REJECT',1,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3103,0,'电信诈骗与金融诈骗','REJECT',1,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3104,0,'暴力恐怖与管制违禁品','REJECT',1,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3105,0,'辱骂歧视与人身攻击','MASK',1,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3106,0,'违法引流与违禁广告','REJECT',1,0,NOW(),NOW());

-- 分组 3101 词库
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920001,3101,0,'色情',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920002,3101,0,'黄色',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920003,3101,0,'黄片',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920004,3101,0,'黄赌毒',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920005,3101,0,'裸聊',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920006,3101,0,'裸照',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920007,3101,0,'约炮',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920008,3101,0,'一夜情',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920009,3101,0,'成人影片',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920010,3101,0,'AV',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920011,3101,0,'色情网站',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920012,3101,0,'成人内容',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920013,3101,0,'性爱视频',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920014,3101,0,'卖淫',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920015,3101,0,'嫖娼',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920016,3101,0,'援交',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920017,3101,0,'情色',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920018,3101,0,'午夜成人',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920019,3101,0,'成人交友',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920020,3101,0,'撩骚',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920021,3101,0,'骚聊',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920022,3101,0,'露点',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920023,3101,0,'走光',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920024,3101,0,'偷拍',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920025,3101,0,'卖淫女',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920026,3101,0,'陪睡',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920027,3101,0,'包养',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920028,3101,0,'有色情',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920029,3101,0,'激情聊天',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920030,3101,0,'成人直播',NULL,0,NOW(),NOW());

-- 分组 3102 词库
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920031,3102,0,'赌博',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920032,3102,0,'博彩',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920033,3102,0,'赌场',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920034,3102,0,'赌球',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920035,3102,0,'赌马',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920036,3102,0,'百家乐',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920037,3102,0,'老虎机',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920038,3102,0,'线上赌博',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920039,3102,0,'网络赌博',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920040,3102,0,'私彩',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920041,3102,0,'地下六合彩',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920042,3102,0,'时时彩',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920043,3102,0,'彩票预测',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920044,3102,0,'赌博网站',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920045,3102,0,'炸金花',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920046,3102,0,'赌博群',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920047,3102,0,'赌钱',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920048,3102,0,'赢钱秘籍',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920049,3102,0,'赌博平台',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920050,3102,0,'投注',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920051,3102,0,'外围赌',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920052,3102,0,'赌盘',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920053,3102,0,'博彩网站',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920054,3102,0,'麻将赌博',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920055,3102,0,'赌球平台',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920056,3102,0,'私彩投注',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920057,3102,0,'网络赌盘',NULL,0,NOW(),NOW());

-- 分组 3103 词库
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920058,3103,0,'诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920059,3103,0,'电信诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920060,3103,0,'杀猪盘',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920061,3103,0,'刷单',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920062,3103,0,'刷单返利',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920063,3103,0,'刷单兼职',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920064,3103,0,'中奖诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920065,3103,0,'冒充客服',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920066,3103,0,'冒充公检法',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920067,3103,0,'套路贷',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920068,3103,0,'校园贷',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920069,3103,0,'裸贷',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920070,3103,0,'高利贷',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920071,3103,0,'庞氏骗局',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920072,3103,0,'传销',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920073,3103,0,'资金盘',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920074,3103,0,'民族资产解冻',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920075,3103,0,'冒充领导',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920076,3103,0,'网贷诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920077,3103,0,'投资诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920078,3103,0,'荐股诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920079,3103,0,'虚拟货币诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920080,3103,0,'婚恋诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920081,3103,0,'退票诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920082,3103,0,'退税诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920083,3103,0,'补助诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920084,3103,0,'社保卡诈骗',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920085,3103,0,'涉案账户',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920086,3103,0,'安全账户',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920087,3103,0,'转账到安全账户',NULL,0,NOW(),NOW());

-- 分组 3104 词库
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920088,3104,0,'枪支',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920089,3104,0,'弹药',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920090,3104,0,'管制刀具',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920091,3104,0,'仿真枪',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920092,3104,0,'弓弩',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920093,3104,0,'爆炸物',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920094,3104,0,'炸药',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920095,3104,0,'雷管',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920096,3104,0,'毒品',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920097,3104,0,'冰毒',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920098,3104,0,'海洛因',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920099,3104,0,'大麻',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920100,3104,0,'可卡因',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920101,3104,0,'摇头丸',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920102,3104,0,'制毒',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920103,3104,0,'贩毒',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920104,3104,0,'吸毒',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920105,3104,0,'恐怖主义',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920106,3104,0,'恐怖袭击',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920107,3104,0,'暴恐',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920108,3104,0,'制爆教程',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920109,3104,0,'枪支买卖',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920110,3104,0,'易制毒',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920111,3104,0,'迷药',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920112,3104,0,'催情药',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920113,3104,0,'走私',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920114,3104,0,'军火',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920115,3104,0,'武器买卖',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920116,3104,0,'毒品交易',NULL,0,NOW(),NOW());

-- 分组 3105 词库
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920117,3105,0,'傻逼',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920118,3105,0,'傻叉',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920119,3105,0,'贱人',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920120,3105,0,'婊子',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920121,3105,0,'贱货',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920122,3105,0,'废物',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920123,3105,0,'智障',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920124,3105,0,'白痴',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920125,3105,0,'脑残',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920126,3105,0,'弱智',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920127,3105,0,'地域黑',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920128,3105,0,'地域歧视',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920129,3105,0,'种族歧视',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920130,3105,0,'性别歧视',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920131,3105,0,'狗东西',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920132,3105,0,'畜生',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920133,3105,0,'猪头',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920134,3105,0,'死全家',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920135,3105,0,'操你',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920136,3105,0,'日你',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920137,3105,0,'草你',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920138,3105,0,'妈的',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920139,3105,0,'他妈的',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920140,3105,0,'尼玛',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920141,3105,0,'滚犊子',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920142,3105,0,'杂种',NULL,0,NOW(),NOW());

-- 分组 3106 词库
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920143,3106,0,'代开发票',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920144,3106,0,'虚开',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920145,3106,0,'办证',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920146,3106,0,'刻章',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920147,3106,0,'刻章办证',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920148,3106,0,'非法贷款',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920149,3106,0,'黑户贷款',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920150,3106,0,'不上征信贷款',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920151,3106,0,'烟草广告',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920152,3106,0,'香烟批发',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920153,3106,0,'假证',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920154,3106,0,'假文凭',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920155,3106,0,'代写论文',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920156,3106,0,'论文代写',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920157,3106,0,'黑客',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920158,3106,0,'黑客攻击',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920159,3106,0,'入侵系统',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920160,3106,0,'盗号',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920161,3106,0,'刷量',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920162,3106,0,'刷粉',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920163,3106,0,'刷赞',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920164,3106,0,'刷评论',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920165,3106,0,'买卖个人信息',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920166,3106,0,'出售数据',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920167,3106,0,'非法获取公民信息',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920168,3106,0,'代办信用卡',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920169,3106,0,'套现',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920170,3106,0,'信用卡套现',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920171,3106,0,'pos机套现',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920172,3106,0,'违规放贷',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920173,3106,0,'医托',NULL,0,NOW(),NOW());
INSERT IGNORE INTO `msg_sensitive_word` (`word_id`,`group_id`,`tenant_id`,`word`,`action`,`is_deleted`,`create_time`,`update_time`) VALUES (920174,3106,0,'药托',NULL,0,NOW(),NOW());

-- ---------- 预留：国家安全 / 政治类（不插入具体词） ----------
-- 该类由官方权威词库 / 第三方内容安全服务维护，AI 不生成具体词汇。
INSERT IGNORE INTO `msg_sensitive_group` (`group_id`,`tenant_id`,`group_name`,`default_action`,`is_system_predefined`,`is_deleted`,`create_time`,`update_time`) VALUES (3107,0,'国家安全与政治类（待官方词库补充）','REJECT',1,0,NOW(),NOW());
