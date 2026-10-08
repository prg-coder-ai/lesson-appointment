-- ============================================================
-- 补丁：登记预约业务场景分类（幂等，可重复执行）
--
-- 背景：booking api 的 MessageNotifyService 会自动以
--   BOOKING_CREATED / BOOKING_CONFIRMED / LEAVE_CREATED
-- 作为 categoryCode 调 message-service 发消息，但这三个编码从未在
-- msg_category 中登记过，导致 message-service 一律以业务码 404
-- 「消息分类编码不存在」拒收。而发送是 best-effort（HTTP 200 但 body.code=404
-- 不抛异常），所以后端日志仍打印"消息自动发送成功"，静默失败了很久。
--
-- 影响面：学生预约/候补申请（通知教师+管理员）、管理员确认预约、
--         学生请假申请 三类自动消息此前全部未落库。
--
-- 作用域：tenant_id=0 平台预置，getCategoryByCode 会回退到 tenant 0，
--         所有租户均可直接使用；is_system_predefined=1 表示不可删。
-- parent 取「发起角色」维度：学生发起的挂 1002，管理员发起的挂 1001。
-- ============================================================
USE message_center;

INSERT IGNORE INTO msg_category
  (category_id, tenant_id, category_code, category_name, category_level, parent_id, sort, is_system_predefined)
VALUES
  (2006, 0, 'BOOKING_CREATED',   '预约/候补申请',     2, 1002, 3, 1),
  (2007, 0, 'BOOKING_CONFIRMED', '预约确认/候补递补', 2, 1001, 3, 1),
  (2008, 0, 'LEAVE_CREATED',     '学生请假申请',      2, 1002, 4, 1);

-- 校验
SELECT category_id, category_code, category_name, category_level, parent_id
FROM msg_category
WHERE tenant_id = 0 AND category_code IN ('BOOKING_CREATED','BOOKING_CONFIRMED','LEAVE_CREATED')
ORDER BY category_id;
