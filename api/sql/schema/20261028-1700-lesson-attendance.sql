-- ============================================================
-- 课堂出勤回流表（classroom-service → booking-api）
-- 库：lesson_appointment
-- 日期：2026-10-28
--
-- ⚠️ 本文件属 schema/ 目录，按仓库惯例是「新环境初始化」脚本，内含 DROP TABLE。
--    在**存量环境**重跑本文件会清空已回流的出勤数据（不可逆）。
--    存量环境请改用 sql/patch/20261028-1700-classroom-integration-fix.sql（无 DROP）。
--
-- 写入方：booking-api 的 POST /api/v1/classroom-callback/attendance（HMAC 验签后落库）
-- 读取方：运营/教师端出勤查看、日后学情报表（F7-04）与日终对账（F7-05）
--
-- 列口径说明：
--   · tenant_id 由 course_schedule 反查得出，**不采信回调载荷**（免登录通道，载荷可伪造）
--   · check_in_at / check_out_at / actual_start / actual_end 是课堂侧本地墙钟（Asia/Shanghai），
--     与 appointment.appointment_datetime（UTC）不同源，跨源比对必须先换算
--   · (schedule_id, user_id) 唯一：课堂回流只保留每生每课的最新结论
--   · consumption_version 用于丢弃乱序到达的旧版本
-- ============================================================

DROP TABLE IF EXISTS `lesson_attendance`;
CREATE TABLE `lesson_attendance` (
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
  `class_index`         int         NOT NULL DEFAULT '1' COMMENT '课次序号（排期展开的第几次；2026-10-28 S3）',
  `appointment_id`      int                  DEFAULT NULL COMMENT '对应 appointment.id（结算与状态推进的锚点）',
  `consumed_lessons`    decimal(4,2) NOT NULL DEFAULT '0.00' COMMENT '本次计扣课时：0=请假/取消，1=未请假',
  `consumption_state`   varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending待结算/settled已扣减/waived已免除',
  `settled_at`          datetime             DEFAULT NULL COMMENT '扣减生效时间',
  `adjust_reason`       varchar(255)         DEFAULT NULL COMMENT '人工改判原因',
  `source`              varchar(20) NOT NULL DEFAULT 'classroom' COMMENT '数据来源：classroom=课堂回流',
  `created_at`          datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`          datetime    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_la_schedule_user` (`schedule_id`, `user_id`),
  KEY `idx_la_tenant_status` (`tenant_id`, `attendance_status`),
  KEY `idx_la_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='课堂出勤回流（classroom-service → booking-api，课时消耗依据）';
