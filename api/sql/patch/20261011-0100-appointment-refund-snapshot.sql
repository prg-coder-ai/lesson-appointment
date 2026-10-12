-- ============================================================
-- 退费档位快照（时间态处理方案 B1，2026-10-11）
-- 依据：doc-develop/时间态处理方案-排期与预订.md 第六节
-- 规则：学生提交请假/改期申请（cancelling / t-cancelling）时，
--       按【提交时刻】的提前量判定档位并快照落库；
--       管理端审核确认按快照执行，不再按确认时刻重算。
-- 列：refund_snapshot TEXT NULL —— JSON：
--       { "snapshotAt": "yyyy-MM-dd HH:mm:ss"(UTC),
--         "hint": { ...RefundHintVO 全量（level/refundPercent/minutesAhead/...） } }
-- 存量行该列为 NULL：审核时按确认时刻重算（现状兜底），见 LeaveRefundSettleService。
-- ============================================================

ALTER TABLE `appointment`
  ADD COLUMN `refund_snapshot` TEXT NULL
  COMMENT '退费档位快照(JSON: snapshotAt+hint，学生提交申请时按提交时刻判定；管理端审核按快照执行)' AFTER `status`;
