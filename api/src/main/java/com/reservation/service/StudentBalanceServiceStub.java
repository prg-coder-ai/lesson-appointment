package com.reservation.service;

import com.reservation.dto.BalanceAdjustRequest;
import com.reservation.utils.TenantContext;
import com.reservation.vo.RefundHintVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * {@link StudentBalanceService} 的占位实现。
 *
 * <p><b>为什么是空实现</b>：学生余额账户与流水表尚未建立，此时若凭空写库会埋下
 * 「有流水无账户」「金额对不上」的脏数据。因此本实现只把「本该发生的余额调整」
 * 完整记进日志（含幂等键、比例、档位、原因），既不写库也不抛错，
 * 让退改规则判定与请假审核流程现在就能跑通。
 *
 * <p><b>将来如何接管</b>：新建 {@code student_balance} / {@code student_balance_flow} 两张表后，
 * 把本类替换为真实实现即可——调用方（{@code AppointmentController}）依赖的是接口，
 * 不需要任何改动。真实实现至少要做到：
 * <ol>
 *   <li>以 {@code adjustId} 做幂等：先按唯一键插入流水，重复请求直接返回原流水号；</li>
 *   <li>账户行加锁（{@code SELECT ... FOR UPDATE}）后再改余额，避免并发覆盖；</li>
 *   <li>余额不足时不阻断主流程，改为登记「待处理」状态，由管理员人工介入。</li>
 * </ol>
 */
@Service
public class StudentBalanceServiceStub implements StudentBalanceService {

    private static final Logger log = LoggerFactory.getLogger(StudentBalanceServiceStub.class);

    @Override
    public String adjustByRefundRule(BalanceAdjustRequest request) {
        if (request == null) {
            return null;
        }
        // 只登记「本应发生的调整」，不落库。日志级别用 warn 便于在联调期一眼看到。
        log.warn("【余额调整-预留】余额体系尚未落地，本次调整未入账。"
                        + "adjustId={}, tenantId={}, studentId={}, bookingId={}, appointmentId={}, "
                        + "ruleLevel={}, refundPercent={}%, amount={}, reason={}, operatorId={}",
                request.getAdjustId(), request.getTenantId(), request.getStudentId(),
                request.getBookingId(), request.getAppointmentId(), request.getRuleLevel(),
                request.getRefundPercent(), request.getAmount(), request.getReason(),
                request.getOperatorId());
        return null;
    }

    @Override
    public BalanceAdjustRequest buildRequestFromHint(RefundHintVO hint, String bookingId,
                                                     String studentId, String operatorId) {
        BalanceAdjustRequest request = new BalanceAdjustRequest();
        if (hint == null) {
            return request;
        }
        // 幂等键：课次ID + 档位。同一课次因同一档位重复确认时，真实实现应命中同一笔流水。
        request.setAdjustId(hint.getAppointmentId() == null
                ? null
                : "APPT-" + hint.getAppointmentId() + "-" + hint.getLevel());
        request.setBookingId(bookingId);
        request.setStudentId(studentId);
        request.setAppointmentId(hint.getAppointmentId());
        request.setRefundPercent(hint.getRefundPercent());
        request.setRuleLevel(hint.getLevel());
        request.setReason(hint.getMessage());
        request.setOperatorId(operatorId);
        request.setTenantId(TenantContext.getTenantId());
        // amount / originalAmount 留空：金额体系未落地，无法得知订单金额
        return request;
    }

    @Override
    public boolean isAvailable() {
        return false;
    }
}
