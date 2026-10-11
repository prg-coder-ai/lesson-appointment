package com.reservation.service;

import com.reservation.dto.BalanceAdjustRequest;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.vo.RefundHintVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 「请假/改期」审核通过后的退费结算编排。
 *
 * <p>把三件事串起来，让控制器保持轻薄：
 * <ol>
 *   <li>{@link RefundRuleService} 给出应退档位（免责 / 部分退费 / 不退费）；</li>
 *   <li>{@link StudentBalanceService} 按该档位登记余额调整（当前为预留实现，不入账）；</li>
 *   <li>全过程只记日志，<b>不抛异常</b>——结算出错不该让「确认请假」这个业务动作失败。</li>
 * </ol>
 *
 * <p><b>档位时间基准（2026-10-11 时间态处理方案 第六节，用户拍板）</b>：
 * 按<b>学生提交申请时刻</b>的提前量判定——申请提交时档位快照已落库
 * （{@code appointment.refund_snapshot}），审核结算读快照执行，
 * <b>不按管理员确认时刻重算</b>。管理端拖延不应让学生档位恶化，
 * 学生也不能靠撤回重提刷新提前量（双向锁定）。
 * 存量无快照行：按确认时刻重算（旧行为兜底），日志注明。
 */
@Service
public class LeaveRefundSettleService {

    private static final Logger log = LoggerFactory.getLogger(LeaveRefundSettleService.class);

    @Autowired
    private RefundRuleService refundRuleService;
    @Autowired
    private StudentBalanceService studentBalanceService;
    @Autowired
    private AppointmentMapper appointmentMapper;
    @Autowired
    private BookingMapper bookingMapper;

    /**
     * 管理员确认请假（课次状态置为 cancelled）后调用。
     *
     * @param appointmentId 课次ID
     * @param operatorId    操作人（确认请假的管理员）ID，可为 null
     * @return 本次判定结果；任何异常都吞掉并返回 null，绝不影响主流程
     */
    public RefundHintVO settleAfterLeaveConfirmed(Integer appointmentId, String operatorId) {
        try {
            // 有快照 → 学生提交时刻锁定的档位；无快照（存量）→ 确认时刻重算（旧行为兜底）
            RefundHintVO hint = refundRuleService.hintByAppointmentForReview(appointmentId);
            if (hint == null) {
                return null;
            }

            log.info("【请假确认】课次{} 退改判定：{}（{}），退费比例{}%，{}",
                    appointmentId, hint.getLevelText(), hint.getScopeText(),
                    hint.getRefundPercent(), hint.getMessage());

            // 免责与不退费都无需动账（一个退全额、一个不退），只有部分退费才产生金额调整；
            // 但为避免将来余额体系落地时漏掉「免责单」的流水留痕，这里三档都登记，
            // 由 StudentBalanceService 的实现自行决定金额为 0 时是否写流水。
            String studentId = resolveStudentId(appointmentId);
            BalanceAdjustRequest request = studentBalanceService.buildRequestFromHint(
                    hint, hint.getBookingId(), studentId, operatorId);
            String adjustId = studentBalanceService.adjustByRefundRule(request);

            if (!studentBalanceService.isAvailable()) {
                log.warn("【请假确认】退费档位为「{}」，但余额体系尚未落地，"
                                + "本次退费未入账（adjustId 已生成，等待余额表建立后补偿）：课次{}",
                        hint.getLevelText(), appointmentId);
            } else {
                log.info("【请假确认】余额调整已登记，adjustId={}", adjustId);
            }
            return hint;
        } catch (Exception e) {
            log.warn("【请假确认】退费结算失败，已忽略以免影响请假审核主流程。课次{}，原因：{}",
                    appointmentId, e.getMessage());
            return null;
        }
    }

    /** appointment → booking → studentId */
    private String resolveStudentId(Integer appointmentId) {
        try {
            Appointment appointment = appointmentMapper.selectById(appointmentId);
            if (appointment == null || appointment.getBookingId() == null) {
                return null;
            }
            Booking booking = bookingMapper.selectById(appointment.getBookingId());
            return booking == null ? null : booking.getStudentId();
        } catch (Exception e) {
            log.warn("解析课次{}的学生ID失败：{}", appointmentId, e.getMessage());
            return null;
        }
    }
}
