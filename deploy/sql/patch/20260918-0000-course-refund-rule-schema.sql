-- ============================================================================
-- 课程退改（免责 / 部分退费 / 不退费）规则表
-- 日期：2026-09-18
-- 库：lesson_appointment
--
-- 设计要点
--   1. 一个租户一份「默认规则」+ 每门课程可单独「覆盖」：
--      course_id = ''   → 该租户的默认规则（唯一一条）
--      course_id = 'xxx' → 该课程的专属规则
--      求值顺序：课程规则 > 租户默认规则 > 代码内兜底默认值
--   2. 时间点用「分钟」这一个单位落库（避免小时/分钟两套口径打架），
--      *_unit 仅记录管理员在界面上选择的录入粒度，供回显，不参与计算。
--   3. 只存两个阈值，不退费区由「不足部分退费线」推导：
--        提前 >= free_before_minutes                      → 免责（退 100%）
--        partial_before_minutes <= 提前 < free_before_minutes → 部分退费（退 partial_refund_percent%）
--        提前 < partial_before_minutes                    → 不退费（退 0%）
--      这样不会出现「不退费线高于部分退费线」这类自相矛盾的配置。
--   4. 幂等：可重复执行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `course_refund_rule` (
  `id`                    bigint       NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `tenant_id`             bigint       NOT NULL DEFAULT '0' COMMENT '租户ID（0=平台/历史单租户数据）',
  `course_id`             varchar(36)  NOT NULL DEFAULT '' COMMENT '课程ID；空串=本租户默认规则',
  `enabled`               tinyint(1)   NOT NULL DEFAULT '1' COMMENT '是否启用：1启用 0停用（停用后视为未配置，回落到租户默认）',
  `free_before_minutes`   int          NOT NULL DEFAULT '1440' COMMENT '免责线（分钟）：提前量≥该值免收退改费用',
  `free_unit`             varchar(8)   NOT NULL DEFAULT 'hour' COMMENT '免责线录入粒度：hour/minute（仅界面回显用）',
  `partial_before_minutes` int         NOT NULL DEFAULT '720' COMMENT '部分退费线（分钟）：提前量≥该值且不足免责线，按比例退费',
  `partial_unit`          varchar(8)   NOT NULL DEFAULT 'hour' COMMENT '部分退费线录入粒度：hour/minute（仅界面回显用）',
  `partial_refund_percent` int         NOT NULL DEFAULT '50' COMMENT '部分退费比例（%）：0-100',
  `remark`                varchar(255) DEFAULT NULL COMMENT '备注',
  `create_time`           datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`           datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_rule_tenant_course` (`tenant_id`, `course_id`),
  KEY `idx_refund_rule_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='课程退改规则（免责/部分退费/不退费时间点）';

-- ----------------------------------------------------------------------------
-- 可选：为某个租户预置一份默认规则（管理员也可在界面上直接保存，二者等价）
-- 把 <TENANT_ID> 换成实际租户ID后执行即可；不执行也不影响功能——
-- 未配置时服务端按内置默认（免责 24 小时 / 部分退费 12 小时 / 退 50%）提示。
-- ----------------------------------------------------------------------------
-- INSERT INTO `course_refund_rule`
--   (tenant_id, course_id, enabled, free_before_minutes, free_unit,
--    partial_before_minutes, partial_unit, partial_refund_percent, remark)
-- VALUES
--   (<TENANT_ID>, '', 1, 1440, 'hour', 720, 'hour', 50, '租户默认退改规则')
-- ON DUPLICATE KEY UPDATE
--   free_before_minutes = VALUES(free_before_minutes),
--   partial_before_minutes = VALUES(partial_before_minutes),
--   partial_refund_percent = VALUES(partial_refund_percent);
