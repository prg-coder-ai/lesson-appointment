-- ============================================================================
-- 包4B·运营合规：内容审核/查阅留痕（F8-03）
-- 幂等：可重复执行
-- ============================================================================
CREATE TABLE IF NOT EXISTS `classroom_audit_log` (
  `audit_id`    BIGINT       NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(20)  NOT NULL COMMENT 'SUBMISSION/CHAT/RECORDING/CLASSROOM',
  `target_id`   VARCHAR(64)  NULL COMMENT '作品id/课次id等；查阅类动作可为空',
  `schedule_id` VARCHAR(64)  NULL,
  `action`      VARCHAR(20)  NOT NULL COMMENT 'VIEW/FLAG/PASS',
  `operator_id` VARCHAR(64)  NOT NULL,
  `note`        VARCHAR(255) NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_schedule` (`schedule_id`),
  KEY `idx_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容审核与查阅留痕（F8-03）';
