package com.reservation.service;

import com.reservation.dto.BalanceAdjustRequest;
import com.reservation.vo.RefundHintVO;

/**
 * 学生余额调整服务 —— <b>预留接口</b>。
 *
 * <p>当前项目<b>尚未</b>建立学生余额账户表与余额流水表，因此只定义契约、不落库。
 * 退改规则判定完成后，由管理员确认请假的动作触发本接口，
 * 待余额体系落地时只需替换实现（见 {@link StudentBalanceServiceStub}），调用方无需改动。
 *
 * <p>落地时需要补齐的库表（本次<b>未</b>创建，供后续迁移脚本参考）：
 * <pre>
 *   student_balance       学生余额账户
 *                         (id, tenant_id, student_id, balance, version, update_time)
 *                         唯一键 (tenant_id, student_id)
 *   student_balance_flow  余额流水
 *                         (id, tenant_id, adjust_id, student_id, booking_id, appointment_id,
 *                          change_amount, balance_after, refund_percent, rule_level,
 *                          source, reason, operator_id, create_time)
 *                         唯一键 (tenant_id, adjust_id)  ← 保证同一笔退改只调整一次（幂等）
 * </pre>
 *
 * <p><b>调用方约定</b>：本接口不得抛出异常影响主流程。请调用方用 try/catch 包住，
 * 余额调整失败只是账目问题，不应让「确认请假」这个业务动作失败。
 */
public interface StudentBalanceService {

    /**
     * 依据退改规则结果登记一笔余额调整。
     *
     * @param request 调整请求（含幂等键、金额、比例、档位、原因）
     * @return 调整流水号；当前占位实现恒返回 {@code null}，表示「未落地、未记账」
     */
    String adjustByRefundRule(BalanceAdjustRequest request);

    /**
     * 把一次退改规则判定转成余额调整请求（不含金额，金额体系未落地）。
     *
     * @param hint        规则判定结果
     * @param bookingId   预订ID
     * @param studentId   学生ID
     * @param operatorId  操作人（确认请假的管理员）ID
     * @return 可直接交给 {@link #adjustByRefundRule} 的请求对象
     */
    BalanceAdjustRequest buildRequestFromHint(RefundHintVO hint, String bookingId,
                                             String studentId, String operatorId);

    /** 余额体系是否已落地可用（占位实现返回 false，调用方据此决定是否提示「待入账」） */
    boolean isAvailable();
}
