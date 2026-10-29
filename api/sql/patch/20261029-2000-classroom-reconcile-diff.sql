-- ============================================================================
-- 包4A·运营数据面：对账差异登记表（F7-05）
-- 幂等：可重复执行
-- ============================================================================
CREATE TABLE IF NOT EXISTS `classroom_reconcile_diff` (
  `diff_id`      BIGINT       NOT NULL AUTO_INCREMENT,
  `schedule_id`  VARCHAR(64)  NOT NULL,
  `diff_type`    VARCHAR(40)  NOT NULL COMMENT 'MISSING_CALLBACK/CALLBACK_FAILED/VERSION_GAP/STATUS_MISMATCH/DURATION_MISMATCH',
  `severity`     VARCHAR(10)  NOT NULL DEFAULT 'WARN' COMMENT 'WARN/ERROR',
  `detail`       VARCHAR(1000) NULL,
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN/RESOLVED/IGNORED',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at`  DATETIME     NULL,
  `resolved_by`  VARCHAR(64)  NULL,
  `resolve_note` VARCHAR(255) NULL,
  PRIMARY KEY (`diff_id`),
  KEY `idx_status_created` (`status`, `created_at`),
  KEY `idx_schedule` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账差异（F7-05：差异可查、可处置）';
