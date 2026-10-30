-- ============================================================================
-- 课程上课通知规则表（通知时间点配置）
-- 日期：2026-09-18
-- 库：lesson_appointment
--
-- 背景
--   现有「预约通知」的时间点是硬编码在前端 JS 里的，且从未真正发出：
--     · frontend/js/public/appointmentNotes.js:557-572  判定 3 天 / 1 天 / 课前 60 分钟
--     · frontend/js/public/appointmentNotes.js:879-882  sendNotesTo 是空函数
--     · 「已发送」标记复用了业务状态字段 appointment.status（active→noted1→noted2）
--   本表把这套时间点搬成「可按租户 + 课程配置」的数据，供后端定时任务消费。
--
-- 设计要点
--   1. 三层回落，与 course_refund_rule 保持同构：
--        课程规则（course_id = 'xxx'） > 租户默认规则（course_id = ''） > 代码内置兜底
--      叠加语义为「整组覆盖」而非逐点合并：命中课程规则就整组使用它，
--      不会拿租户默认去补齐课程规则里缺的档位（避免语义歧义）。
--      「新建课程规则时自动预填租户默认的几档」是界面行为，不在库层面合并。
--   2. 时间点按「课前偏移分钟」单一单位落库（offset_minutes），
--      input_unit 仅记录管理员在界面上选择的录入粒度，供回显，不参与计算。
--        应发时刻 = appointment.appointment_datetime - offset_minutes
--      天级档位不额外配「发送钟点」：与上课时刻同钟点，4 档共用一套算术。
--   3. 档位顺序由 seq 表达（越大离上课越近），必须满足严格递减：
--        1440*N > 1440*M > K > L >= 0     （按 offset_minutes 比较）
--      即 seq 越大 offset_minutes 越小。校验在服务端做。
--   4. 「停用某一档」用 enabled = 0，不删行 —— 保持 seq 无洞，
--      流水表按 (appointment_id, seq) 回溯才稳定。
--   5. 幂等与漏发：
--        · 自动发送：同一课次同一档位同一收件人只发一次（流水表唯一键兜底）；
--        · 管理员手动发送：按「当前时刻的提前量」自动判定档位，允许重复发送，
--          dedup_key 取 MANUAL#时间戳 避开唯一键，但照常入库以便审计；
--        · 窗口过期不补发（宕机错过、或预约时该档已过期），已过上课时间绝不补发。
--   6. 本脚本幂等，可重复执行。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 一、规则头：一个作用域一行
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_notify_rule` (
  `id`          bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`   bigint       NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id`   varchar(36)  NOT NULL DEFAULT '' COMMENT '课程ID；空串=本租户默认规则',
  `name`        varchar(64)  DEFAULT NULL COMMENT '规则名（仅界面显示）',
  `enabled`     tinyint(1)   NOT NULL DEFAULT '1' COMMENT '整组是否启用：0=视为未配置，回落租户默认',
  `remark`      varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time` datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notify_rule_tenant_course` (`tenant_id`, `course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程上课通知规则（规则头；整组覆盖）';


-- ----------------------------------------------------------------------------
-- 二、时间点明细：一条一行
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `course_notify_rule_point` (
  `id`             bigint      NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `rule_id`        bigint      NOT NULL COMMENT '规则头ID course_notify_rule.id',
  `seq`            tinyint     NOT NULL COMMENT '档位序号 1..N，越大离上课越近；要求 offset_minutes 随 seq 严格递减',
  `stage`          varchar(16) NOT NULL COMMENT '档位码 PRE_FIRST首次预告/PRE_AGAIN再次预告/PRE_SOON课前预告/FINAL_CALL最后提示',
  `offset_minutes` int         NOT NULL COMMENT '课前偏移分钟（>0）：应发时刻 = 上课时刻 - 本值',
  `input_unit`     varchar(8)  NOT NULL DEFAULT 'hour' COMMENT '录入粒度 day/hour/minute（仅界面回显，不参与计算）',
  `audience`       varchar(16) NOT NULL DEFAULT 'BOTH' COMMENT '接收人 STUDENT/TEACHER/BOTH',
  `enabled`        tinyint(1)  NOT NULL DEFAULT '1' COMMENT '该档是否启用（停用用本列，不删行，保持 seq 无洞）',
  `create_time`    datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`    datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_point_rule_seq` (`rule_id`, `seq`),
  KEY `idx_point_rule` (`rule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程上课通知时间点（明细行）';


-- ----------------------------------------------------------------------------
-- 三、发送流水：幂等键所在
--   唯一键 (appointment_id, seq, receiver_user_id, dedup_key)
--     自动发送  dedup_key = 'AUTO'                → 同档同人第二次插入撞键，跳过
--     手动发送  dedup_key = 'MANUAL#20260918191200' → 每次唯一，可重复发，仍留审计
--   收件人级而非事件级：教师那条推送失败，不该让学生那条也被判为「已发」。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notification_dispatch_log` (
  `id`               bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`        bigint       NOT NULL DEFAULT '0' COMMENT '租户ID（冗余，便于按租户审计）',
  `appointment_id`   int          NOT NULL COMMENT '课次ID appointment.id',
  `booking_id`       varchar(36)  DEFAULT NULL COMMENT '订单ID（冗余，便于查询）',
  `rule_id`          bigint       DEFAULT NULL COMMENT '发送时所用规则头ID（审计快照）',
  `seq`              tinyint      NOT NULL COMMENT '本次发送的档位序号',
  `stage`            varchar(16)  DEFAULT NULL COMMENT '本次发送的档位码（审计快照）',
  `offset_minutes`   int          NOT NULL COMMENT '发送时该档的提前量（审计快照，规则之后可能被改）',
  `expect_time`      datetime     NOT NULL COMMENT '应发时刻 = 上课时刻 - offset_minutes',
  `receiver_user_id` varchar(36)  NOT NULL COMMENT '收件人用户ID',
  `receiver_role`    varchar(16)  DEFAULT NULL COMMENT '收件人角色（审计快照）',
  `trigger_type`     varchar(8)   NOT NULL DEFAULT 'AUTO' COMMENT '触发方式 AUTO自动任务/MANUAL管理员手动',
  `operator_id`      varchar(36)  DEFAULT NULL COMMENT '手动发送时的操作管理员ID',
  `dedup_key`        varchar(64)  NOT NULL DEFAULT 'AUTO' COMMENT '幂等键：AUTO=自动仅一次；MANUAL#时间戳=手动可重复',
  `sent_at`          datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '实际发送时刻',
  `status`           varchar(16)  NOT NULL DEFAULT 'SENT' COMMENT '发送结果 SENT/FAILED',
  `error_msg`        varchar(255) DEFAULT NULL COMMENT '失败原因',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dispatch_once` (`appointment_id`, `seq`, `receiver_user_id`, `dedup_key`),
  KEY `idx_dispatch_appointment` (`appointment_id`),
  KEY `idx_dispatch_expect` (`expect_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='通知发送流水（自动发送同档同人仅一次，手动不受限）';


-- ----------------------------------------------------------------------------
-- 四、扫描索引
--   定时任务按「应发时刻落在本分钟窗口内」反查课次，主表 appointment 目前
--   只有 PRIMARY + idx_tenant_id，需要补一个时间维度索引。
--   用 information_schema 判断，保证脚本可重复执行。
-- ----------------------------------------------------------------------------
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'appointment'
    AND INDEX_NAME = 'idx_appt_datetime_status'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE `appointment` ADD INDEX `idx_appt_datetime_status` (`appointment_datetime`, `status`)',
  'SELECT ''idx_appt_datetime_status 已存在，跳过'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ============================================================================
-- 五、可选：为某租户预置一份默认规则（管理员也可在界面上直接保存，二者等价）
--   内置兜底档位（未做任何配置时服务端使用的默认值）：
--     第 1 档 提前 3 天（4320 分钟）  首次预告  通知学生+教师
--     第 2 档 提前 1 天（1440 分钟）  再次预告  通知学生+教师
--     第 3 档 课前 60 分钟            课前预告  通知学生+教师
--     第 4 档 课前 30 分钟            最后提示  通知学生+教师
--   把 <TENANT_ID> 换成实际租户ID后执行即可；不执行也不影响功能。
-- ============================================================================
-- INSERT INTO `course_notify_rule` (tenant_id, course_id, name, enabled, remark)
-- VALUES (<TENANT_ID>, '', '租户默认上课通知规则', 1, '内置兜底档位的租户级副本')
-- ON DUPLICATE KEY UPDATE name = VALUES(name), enabled = VALUES(enabled);

-- INSERT INTO `course_notify_rule_point`
--   (rule_id, seq, stage, offset_minutes, input_unit, audience, enabled)
-- SELECT r.id, p.seq, p.stage, p.offset_minutes, p.input_unit, p.audience, p.enabled
-- FROM `course_notify_rule` r
-- JOIN (
--   SELECT 1 AS seq, 'PRE_FIRST'  AS stage, 4320 AS offset_minutes, 'day'    AS input_unit, 'BOTH' AS audience, 1 AS enabled
--   UNION ALL SELECT 2, 'PRE_AGAIN',  1440, 'day',    'BOTH', 1
--   UNION ALL SELECT 3, 'PRE_SOON',     60, 'minute', 'BOTH', 1
--   UNION ALL SELECT 4, 'FINAL_CALL',   30, 'minute', 'BOTH', 1
-- ) p
-- WHERE r.tenant_id = <TENANT_ID> AND r.course_id = ''
-- ON DUPLICATE KEY UPDATE
--   stage = VALUES(stage), offset_minutes = VALUES(offset_minutes),
--   input_unit = VALUES(input_unit), audience = VALUES(audience), enabled = VALUES(enabled);


-- ============================================================================
-- 六、存量数据处理建议（执行前请确认）
--   现有 appointment.status 里 noted1=1 / noted2=3 属于「通知标记」，但实际
--   从未发出过消息（sendNotesTo 为空实现）。新方案把通知标记迁到流水表后：
--     · 建议把这 4 条当作「已发」处理，避免上线后历史课被集中补发；
--     · appointment.status 只保留业务状态（active/completed/cancelled/...），
--       noted1/noted2 的语义需要一并收敛，否则管理端状态与通知档位两套口径并存。
--   具体处置脚本待确认后另出，本脚本不动任何存量数据。
-- ============================================================================
