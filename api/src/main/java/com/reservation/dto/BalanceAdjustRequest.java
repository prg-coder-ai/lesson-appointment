package com.reservation.dto;

import lombok.Data;

/**
 * 「学生余额调整」请求。
 *
 * <p><b>预留接口</b>：当前项目尚未定义学生余额表与流水表，
 * 该类是余额体系落地时前后端共同的契约，字段已按「一笔退改引起的余额变动」设计齐全。
 * 落地时需要补的库表（供参考，本次未创建）：
 * <pre>
 *   student_balance        学生余额账户（student_id, tenant_id, balance, 乐观锁 version）
 *   student_balance_flow   余额流水（adjust_id, student_id, booking_id, appointment_id,
 *                          change_amount, balance_after, source, reason, operator_id, create_time）
 * </pre>
 */
@Data
public class BalanceAdjustRequest {

    /** 幂等键：同一笔退改只应调整一次。建议由调用方传业务唯一值，如 appointmentId + 动作码 */
    private String adjustId;

    /** 预订ID */
    private String bookingId;

    /** 学生ID */
    private String studentId;

    /** 课次ID（appointment.id） */
    private Integer appointmentId;

    /**
     * 变动金额（元）：正数=退回学生余额，负数=从余额扣收。
     * 金额体系未落地前允许为 null，表示「只登记规则结论、不设金额」。
     */
    private java.math.BigDecimal amount;

    /** 对应原始金额（元）：用于展示「原价 X 退 Y」 */
    private java.math.BigDecimal originalAmount;

    /** 实际退费比例（%）：0-100 */
    private Integer refundPercent;

    /** 规则判定档位：free 免责 / partial 部分退费 / none 不退费 */
    private String ruleLevel;

    /** 变动原因（面向用户的说明文案） */
    private String reason;

    /** 操作人ID（确认请假的管理员） */
    private String operatorId;

    /** 租户ID */
    private Long tenantId;
}
