-- ==============================================================================
-- classroom-service 建表 DDL
-- 独立 schema classroom，与 booking-api/message-service 数据库完全隔离
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `classroom` DEFAULT CHARACTER SET utf8mb4;
USE `classroom`;

-- 课堂（排期的课中投影，schedule_id 即课堂 id）
CREATE TABLE `classroom` (
  `schedule_id`    VARCHAR(64)  NOT NULL COMMENT '排期id=课堂id',
  `course_id`      VARCHAR(64)  NOT NULL COMMENT '课程id',
  `course_name`    VARCHAR(255) NOT NULL COMMENT '课程名称快照',
  `teacher_id`     VARCHAR(64)  NOT NULL COMMENT '教师userId',
  `teacher_name`   VARCHAR(128) NOT NULL COMMENT '教师姓名快照',
  `start_time`     DATETIME     NOT NULL COMMENT '预约开始时间',
  `end_time`       DATETIME     NOT NULL COMMENT '预约结束时间',
  `duration`       INT          NOT NULL COMMENT '课时时长(分钟)',
  `status`         VARCHAR(20)  NOT NULL DEFAULT 'SCHEDULED'
                  COMMENT 'SCHEDULED/READY/LIVE/CLOSED/CANCELLED',
  `auto_start`     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '到点自动开课',
  `version`        INT          NOT NULL DEFAULT 1 COMMENT '排期数据版本号',
  `consumption_version` INT     NOT NULL DEFAULT 0 COMMENT '课时消耗版本号(每次下课收尾+1)',
  `actual_start`   DATETIME     NULL COMMENT '实际开课时间',
  `actual_end`     DATETIME     NULL COMMENT '实际下课时间',
  `tenant_id`      BIGINT       NOT NULL DEFAULT 0 COMMENT '租户id',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`),
  KEY `idx_status` (`status`),
  KEY `idx_teacher` (`teacher_id`),
  KEY `idx_tenant_status` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课堂';

-- 成员（课堂内成员视图）
CREATE TABLE `classroom_membership` (
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `user_id`       VARCHAR(64)  NOT NULL,
  `role`          VARCHAR(10)  NOT NULL COMMENT 'teacher/student',
  `display_name`  VARCHAR(128) NOT NULL COMMENT '姓名快照',
  `join_time`     DATETIME     NULL COMMENT '首次加入时间',
  `leave_time`    DATETIME     NULL COMMENT '最后离开时间',
  `leave_reason`  VARCHAR(20)  NULL COMMENT 'active/disconnect/kicked',
  `online_state`  VARCHAR(10)  NOT NULL DEFAULT 'OFFLINE' COMMENT 'ONLINE/IDLE/OFFLINE',
  `kicked`        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '被移出(禁止重入)',
  PRIMARY KEY (`schedule_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课堂成员';

-- 签到记录（出勤与课时核算依据）
CREATE TABLE `classroom_attendance` (
  `schedule_id`       VARCHAR(64)  NOT NULL,
  `user_id`           VARCHAR(64)  NOT NULL,
  `attendance_status` VARCHAR(10)  NOT NULL DEFAULT 'ABSENT'
                     COMMENT 'ABSENT/PRESENT/LATE/LEFT/REJOINED',
  `check_in_at`       DATETIME     NULL COMMENT '签到时间',
  `check_out_at`      DATETIME     NULL COMMENT '离开时间',
  `effective_minutes` INT          NOT NULL DEFAULT 0 COMMENT '有效时长(分钟)',
  `late`              TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '迟到标记',
  `manual_adjust`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '教师手动补签',
  `adjust_reason`     VARCHAR(255) NULL COMMENT '补签原因',
  `adjust_by`         VARCHAR(64)  NULL COMMENT '补签操作人(教师 userId)',
  PRIMARY KEY (`schedule_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='签到记录';

-- 在线区间（有效时长核算依据）
-- 每进一次课堂记一段，离开时闭合；有效时长 = 合并间隙≤60s 的相邻段后各段秒数之和，封顶课时时长。
-- 需求 F2-03：多次进出累计、扣除 60 秒内抖动重连、封顶。
CREATE TABLE `classroom_presence_segment` (
  `id`           BIGINT      NOT NULL AUTO_INCREMENT,
  `schedule_id`  VARCHAR(64) NOT NULL COMMENT '排期id=课堂id',
  `user_id`      VARCHAR(64) NOT NULL COMMENT '用户id',
  `join_at`      DATETIME    NOT NULL COMMENT '进入时间',
  `leave_at`     DATETIME    NULL     COMMENT '离开时间(NULL=尚未闭合)',
  `leave_reason` VARCHAR(20) NULL     COMMENT 'active/disconnect/kicked/closed',
  `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ps_schedule_user` (`schedule_id`, `user_id`, `join_at`),
  KEY `idx_ps_open` (`schedule_id`, `user_id`, `leave_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课堂在线区间(有效时长核算依据)';

-- 教学记录（课堂运行档案）
CREATE TABLE `classroom_session_record` (
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `start_time`    DATETIME     NULL COMMENT '实际开始时间',
  `end_time`      DATETIME     NULL COMMENT '实际结束时间',
  `actual_minutes` INT         NULL COMMENT '实际时长(分钟)',
  `event_log`     TEXT         NULL COMMENT '教学环节事件流水(JSON)',
  `whiteboard_snapshot` TEXT   NULL COMMENT '白板快照(JSON)',
  PRIMARY KEY (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教学记录';

-- 课堂实时运行时态（服务器强控态落库，当前仅全员禁言）
CREATE TABLE `classroom_runtime_state` (
  `schedule_id` VARCHAR(64)  NOT NULL COMMENT '排期id=课堂id',
  `mute_all`    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '全员禁言(服务器强控,落库恢复)',
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课堂实时运行时态';

-- 讲稿
CREATE TABLE `classroom_material` (
  `material_id`   BIGINT       NOT NULL AUTO_INCREMENT,
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `file_name`     VARCHAR(255) NOT NULL,
  `file_type`     VARCHAR(20)  NOT NULL COMMENT 'PDF/PPT/IMAGE',
  `file_size`     BIGINT       NOT NULL,
  `oss_key`       VARCHAR(512) NOT NULL COMMENT '对象存储key',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'UPLOADING' COMMENT 'UPLOADING/READY/FAILED',
  `current_page`  INT          NOT NULL DEFAULT 0 COMMENT '当前翻页(教师侧)',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`material_id`),
  KEY `idx_schedule` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='讲稿';

-- 点名记录
CREATE TABLE `classroom_rollcall` (
  `rollcall_id`   BIGINT       NOT NULL AUTO_INCREMENT,
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `target_user_id` VARCHAR(64) NULL COMMENT '指定学生(NULL=随机)',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/ANSWERED/TIMEOUT',
  `initiated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `answered_at`   DATETIME     NULL,
  PRIMARY KEY (`rollcall_id`),
  KEY `idx_schedule` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点名记录';

-- 学生作品
CREATE TABLE `classroom_submission` (
  `submission_id` BIGINT       NOT NULL AUTO_INCREMENT,
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `user_id`       VARCHAR(64)  NOT NULL,
  `submission_type` VARCHAR(20) NOT NULL COMMENT 'AUDIO/TEXT/IMAGE/FILE',
  `content`       TEXT         NULL COMMENT '文字内容(TEXT类型)',
  `oss_key`       VARCHAR(512) NULL COMMENT '文件存储key(非TEXT类型)',
  `duration_sec`  INT          NULL COMMENT '语音时长(秒)',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'SUBMITTED' COMMENT 'SUBMITTED/REVIEWED',
  `teacher_comment` TEXT       NULL COMMENT '教师点评',
  `score`         DECIMAL(5,2) NULL COMMENT '评分',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`submission_id`),
  KEY `idx_schedule_user` (`schedule_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生作品';

-- 录制
CREATE TABLE `classroom_recording` (
  `recording_id`  BIGINT       NOT NULL AUTO_INCREMENT,
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `start_time`    DATETIME     NOT NULL,
  `end_time`      DATETIME     NULL,
  `oss_key`       VARCHAR(512) NULL COMMENT '录制文件key',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'RECORDING' COMMENT 'RECORDING/READY/FAILED',
  `retention_days` INT         NOT NULL DEFAULT 90 COMMENT '保留天数',
  `expire_at`     DATETIME     NULL COMMENT '过期时间',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`recording_id`),
  KEY `idx_schedule` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='录制';

-- 对账流水（契约执行证据）
CREATE TABLE `classroom_reconcile_log` (
  `event_id`      VARCHAR(64)  NOT NULL COMMENT '事件唯一id(幂等去重)',
  `event_type`    VARCHAR(20)  NOT NULL COMMENT 'created/updated/cancelled',
  `schedule_id`   VARCHAR(64)  NOT NULL,
  `result`        VARCHAR(20)  NOT NULL COMMENT 'SUCCESS/SKIPPED/FAILED',
  `skip_reason`   VARCHAR(50)  NULL COMMENT 'stale_version/duplicate',
  `fail_reason`   VARCHAR(500) NULL,
  `retry_count`   INT          NOT NULL DEFAULT 0,
  `received_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_schedule` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账流水';
-- 对账差异（F7-05：差异可查、可处置）
CREATE TABLE `classroom_reconcile_diff` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对账差异（F7-05）';

-- 内容审核与查阅留痕（F8-03，包4B）
-- 与 api/sql/patch/20261029-2010-classroom-audit-log.sql 保持一致；
-- 二者都保留的原因：新建库跑本文件即可自洽，存量库只跑 patch。
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
