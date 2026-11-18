-- ============================================================
-- 学生课时账本（余额 + 流水）
-- 库：lesson_appointment
-- 日期：2026-10-28
--
-- 为什么现在才建：`StudentBalanceService` 长期是 Stub（只打日志不落库），
-- 库中没有任何余额/流水表。课时扣减方案 v2 要求「未请假即扣 1 课时并减余量」，
-- 没有账本就只能写日志，故本轮落地这两张表。
--
-- ⚠️ 与 sql/schema 目录惯例的**刻意差异**：本文件用 CREATE TABLE IF NOT EXISTS、
--    **不带 DROP**。因为账本一旦被误跑清空，等于抹掉全部课时记录（不可逆），
--    风险远高于"新环境初始化"的便利性。存量环境重跑本文件是安全的（幂等）。
--
-- 列口径：
--   · biz_key 是**唯一防重键**：同一课次无论被回调、重试还是兜底任务碰多少次，
--     都只会产生一条流水。取值为 classroom:{appointmentId} / leave:{appointmentId} / manual:{uuid}
--   · remaining_lessons 允许为负：历史学生没有课时包记录（total=0），
--     首次扣减即为 -1，表示"欠课时"，由运营补录 total_lessons 平账
--   · change_lessons 负数=消耗、正数=退回/充值
-- ============================================================

CREATE TABLE IF NOT EXISTS `student_lesson_balance` (
  `id`                bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`         bigint       NOT NULL DEFAULT '0' COMMENT '租户ID',
  `student_id`        varchar(36)  NOT NULL COMMENT '学生用户ID',
  `total_lessons`     decimal(8,2) NOT NULL DEFAULT '0.00' COMMENT '累计购买课时（运营补录/充值）',
  `used_lessons`      decimal(8,2) NOT NULL DEFAULT '0.00' COMMENT '累计消耗课时',
  `remaining_lessons` decimal(8,2) NOT NULL DEFAULT '0.00' COMMENT '剩余课时（=total-used，允许负数=欠课时）',
  `version`           int          NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `create_time`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slb_tenant_student` (`tenant_id`, `student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='学生课时余额';

CREATE TABLE IF NOT EXISTS `student_lesson_flow` (
  `id`              bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`       bigint       NOT NULL DEFAULT '0' COMMENT '租户ID',
  `flow_id`         varchar(36)  NOT NULL COMMENT '流水号（UUID）',
  `student_id`      varchar(36)  NOT NULL COMMENT '学生用户ID',
  `booking_id`      varchar(36)  DEFAULT NULL COMMENT '关联预订ID',
  `schedule_id`     varchar(36)  DEFAULT NULL COMMENT '关联排期ID',
  `class_index`     int          DEFAULT NULL COMMENT '课次序号',
  `appointment_id`  int          DEFAULT NULL COMMENT '关联课次ID',
  `change_lessons`  decimal(4,2) NOT NULL COMMENT '变动课时（负数=消耗，正数=退回/充值）',
  `remaining_after` decimal(8,2) NOT NULL COMMENT '变动后余量（对账用）',
  `source`          varchar(20)  NOT NULL COMMENT 'classroom课堂扣减/leave请假退回/manual人工/grant充值',
  `biz_key`         varchar(128) NOT NULL COMMENT '幂等业务键（唯一）',
  `reason`          varchar(255) DEFAULT NULL COMMENT '原因（人工调整必填）',
  `operator_id`     varchar(36)  DEFAULT NULL COMMENT '操作人（人工调整）',
  `create_time`     datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slf_flow` (`flow_id`),
  UNIQUE KEY `uk_slf_biz` (`tenant_id`, `biz_key`),
  KEY `idx_slf_student` (`tenant_id`, `student_id`, `create_time`),
  KEY `idx_slf_appt` (`appointment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课时流水';
