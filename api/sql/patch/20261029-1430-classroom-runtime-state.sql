-- 课堂实时运行时态表（P1 教学闭环：全员禁言服务器强控落库 + 重启恢复）
-- 幂等：表已存在则跳过
CREATE TABLE IF NOT EXISTS `classroom_runtime_state` (
  `schedule_id` VARCHAR(64)  NOT NULL COMMENT '排期id=课堂id',
  `mute_all`    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '全员禁言(服务器强控,落库恢复)',
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课堂实时运行时态';
