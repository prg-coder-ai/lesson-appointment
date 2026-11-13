-- ============================================================
-- 课堂名单回补：修复「预约成功但进课堂报 40301 你不在本课堂名单内」
-- 日期：2026-11-13
--
-- 根因（已由 classroom-service.log 与两库数据交叉证实）：
--   classroom.classroom 是在排期推送 created 事件时创建的，名单按**当时的 booking 快照**
--   预建（ScheduleEventConsumer.handleCreated）；之后新下的预约不会回补名单，
--   而 ClassroomAccessGuard.assertAccess 对「学生且不在名单」直接抛 MEMBER_NOT_IN_CLASSROOM，
--   enter 又刻意不自动建行（防越权）。于是「课堂先建 → 学生后预约 → 永远进不去」。
--   本次实测：课堂 d8965e… 建于 12:36:34，学生 bb302f… 预约于 12:40:07，
--   12:43/12:48 两次进房被拒；全库 classroom_membership 中 role='student' 为 0 行。
--
-- 作用（幂等、只增不删、不改任何已有行）：
--   1) 为「课堂已存在 + booking.status=booked + 名单缺行」的学生补 membership(student)
--   2) 为已有 student 名单但缺出勤行的补 attendance(ABSENT)，与 initRoster 同口径
--   注意 display_name 取 user.name：与 ClassroomEventPushService 推送时一致
--   （该列在主库是加密姓名，此处不做解密，保持一致）。
--
-- 这是**数据回补**，不解决「以后新预约仍缺名单」的链路问题；根治需要单独拍板
-- （见对话：预约成功后推 roster 事件 / 或 guard 按有效预约放行）。
-- ============================================================

INSERT INTO `classroom`.`classroom_membership`
  (`schedule_id`, `user_id`, `role`, `display_name`, `online_state`, `kicked`)
SELECT b.`schedule_id`, b.`student_id`, 'student', u.`name`, 'OFFLINE', 0
FROM `lesson_appointment`.`booking` b
JOIN `classroom`.`classroom` c
  ON c.`schedule_id` COLLATE utf8mb4_general_ci = b.`schedule_id` COLLATE utf8mb4_general_ci
JOIN `lesson_appointment`.`user` u
  ON u.`user_id` COLLATE utf8mb4_general_ci = b.`student_id` COLLATE utf8mb4_general_ci
WHERE b.`status` = 'booked'
  AND b.`student_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `classroom`.`classroom_membership` m
    WHERE m.`schedule_id` COLLATE utf8mb4_general_ci = b.`schedule_id` COLLATE utf8mb4_general_ci
      AND m.`user_id` COLLATE utf8mb4_general_ci = b.`student_id` COLLATE utf8mb4_general_ci
  );

INSERT INTO `classroom`.`classroom_attendance`
  (`schedule_id`, `user_id`, `attendance_status`, `effective_minutes`, `late`, `manual_adjust`)
SELECT m.`schedule_id`, m.`user_id`, 'ABSENT', 0, 0, 0
FROM `classroom`.`classroom_membership` m
JOIN `classroom`.`classroom` c
  ON c.`schedule_id` COLLATE utf8mb4_general_ci = m.`schedule_id` COLLATE utf8mb4_general_ci
WHERE m.`role` = 'student'
  AND NOT EXISTS (
    SELECT 1 FROM `classroom`.`classroom_attendance` a
    WHERE a.`schedule_id` COLLATE utf8mb4_general_ci = m.`schedule_id` COLLATE utf8mb4_general_ci
      AND a.`user_id` COLLATE utf8mb4_general_ci = m.`user_id` COLLATE utf8mb4_general_ci
  );

-- 校验：执行后应为 0
-- SELECT b.schedule_id, b.student_id FROM lesson_appointment.booking b
-- JOIN classroom.classroom c ON c.schedule_id COLLATE utf8mb4_general_ci = b.schedule_id COLLATE utf8mb4_general_ci
-- WHERE b.status='booked' AND NOT EXISTS (
--   SELECT 1 FROM classroom.classroom_membership m
--   WHERE m.schedule_id COLLATE utf8mb4_general_ci = b.schedule_id COLLATE utf8mb4_general_ci
--     AND m.user_id COLLATE utf8mb4_general_ci = b.student_id COLLATE utf8mb4_general_ci);
