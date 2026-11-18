-- ============================================================
-- 在线课堂对接修复补丁（2026-10-28）
-- 适用库：lesson_appointment
-- 内容：
--   1) 修正 sys_eclassroom_instance 的 api_base_path / ws_base_path 默认值与存量脏数据
--   2) 新增 lesson_attendance（课堂出勤回流落库表，课时消耗依据）
-- 幂等：可重复执行
-- ============================================================

-- ------------------------------------------------------------
-- 1. base_path 语义修正
--    旧默认 /api/v1/classroom 拼出 /api/v1/classroom/schedules/events 这类不存在的路径，
--    导致排期事件推送 404（best-effort 静默）且前端课堂页整体 404。
--    新语义：api_base_path = API 根（含版本前缀）；ws_base_path = WS 根（空串=host:port）
-- ------------------------------------------------------------
ALTER TABLE `sys_eclassroom_instance`
  MODIFY COLUMN `api_base_path` varchar(128) DEFAULT '/api/v1'
    COMMENT 'API根路径（含版本前缀，不含业务段）',
  MODIFY COLUMN `ws_base_path` varchar(128) DEFAULT ''
    COMMENT 'WebSocket根路径（空串=host:port 根，前端补 /ws/classrooms/{sid}/...）';

UPDATE `sys_eclassroom_instance`
SET `api_base_path` = '/api/v1'
WHERE `api_base_path` IS NULL OR `api_base_path` IN ('', '/', '/api/v1/classroom');

UPDATE `sys_eclassroom_instance`
SET `ws_base_path` = ''
WHERE `ws_base_path` IS NULL OR `ws_base_path` IN ('/', '/ws');

-- ------------------------------------------------------------
-- 2. 课堂出勤回流表 lesson_attendance
--    与 sql/schema/20261028-1700-lesson-attendance.sql 列定义必须保持一致
--    （schema 版含 DROP，仅用于新环境；本版用 IF NOT EXISTS，供存量环境安全新增）。
--    改列时两处同改，否则新环境与存量环境会漂移。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lesson_attendance` (
  `id`                  bigint      NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`           bigint      NOT NULL DEFAULT '0' COMMENT '租户ID（由 schedule 反查，非客户端上报）',
  `schedule_id`         varchar(64) NOT NULL COMMENT '排期ID（=课堂ID）',
  `course_id`           varchar(64)          DEFAULT NULL COMMENT '课程ID（课堂服务回传）',
  `user_id`             varchar(64) NOT NULL COMMENT '学生用户ID',
  `role`                varchar(16)          DEFAULT NULL COMMENT '角色：student/teacher',
  `attendance_status`   varchar(16) NOT NULL COMMENT '出勤状态：present/late/absent/left/rejoined',
  `check_in_at`         datetime             DEFAULT NULL COMMENT '签到时间（课堂侧本地墙钟 Asia/Shanghai）',
  `check_out_at`        datetime             DEFAULT NULL COMMENT '离开时间（课堂侧本地墙钟）',
  `effective_minutes`   int         NOT NULL DEFAULT '0' COMMENT '有效课时（分钟，已扣抖动并封顶课时时长）',
  `classroom_status`    varchar(20)          DEFAULT NULL COMMENT '回流时课堂状态：CLOSED/CANCELLED 等',
  `actual_start`        datetime             DEFAULT NULL COMMENT '实际开课时间（课堂侧墙钟）',
  `actual_end`          datetime             DEFAULT NULL COMMENT '实际下课时间（课堂侧墙钟）',
  `consumption_version` int         NOT NULL DEFAULT '1' COMMENT '课时消耗版本号，防乱序覆盖',
  `source`              varchar(20) NOT NULL DEFAULT 'classroom' COMMENT '数据来源：classroom=课堂回流',
  `created_at`          datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`          datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_la_schedule_user` (`schedule_id`, `user_id`),
  KEY `idx_la_tenant_status` (`tenant_id`, `attendance_status`),
  KEY `idx_la_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='课堂出勤回流（classroom-service → booking-api，课时消耗依据）';
