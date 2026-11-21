package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.LessonAttendanceMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 课次结算编排（2026-10-28，课时扣减方案 v2 第五节）。
 *
 * <p>把「定位课次 → 扣减课时 → 推进状态 → 回写出勤结算列」四步收成一个入口。
 * 课堂回调（S3）与兜底任务（S4）都调这里，**保证两条路径口径完全一致**——
 * 若各写一遍，回调路径改了规则、兜底路径没改，就会出现「同样的课，线上课扣了、离线课没扣」。
 *
 * <h3>执行顺序为什么是「先扣后改状态」</h3>
 * <ul>
 *   <li>先扣减：扣减幂等（{@code biz_key=classroom:appointmentId}），重复调用不会多扣；
 *       若扣减失败抛异常，状态还停在原值，兜底任务下次会重试整条链路；</li>
 *   <li>后改状态：改状态用 CAS，失败说明别人已经改过，属于正常并发，不需要回滚扣减；</li>
 *   <li>反过来（先改状态后扣）的风险更大：状态一旦落了 completed/absent 就是终态，
 *       若随后扣减失败，兜底任务不会再扫到它，这笔课就永久漏扣了。</li>
 * </ul>
 *
 * <h3>不包外层事务</h3>
 * 扣减内部已有独立事务（见 {@code LessonDeductionService}），状态推进是单条 CAS。
 * 硬包一个大事务只会让「撞唯一键」的幂等语义失效（整个事务被标记 rollback-only）。
 */
@Service
public class LessonSettlementService {

    private static final Logger log = LoggerFactory.getLogger(LessonSettlementService.class);

    public static final String STATE_SETTLED = "settled";
    public static final String STATE_WAIVED = "waived";
    public static final String STATE_PENDING = "pending";

    private final BookingMapper bookingMapper;
    private final AppointmentMapper appointmentMapper;
    private final LessonDeductionService deductionService;
    private final AppointmentStateAdvancer stateAdvancer;
    private final LessonAttendanceMapper attendanceMapper;

    public LessonSettlementService(BookingMapper bookingMapper,
                                   AppointmentMapper appointmentMapper,
                                   LessonDeductionService deductionService,
                                   AppointmentStateAdvancer stateAdvancer,
                                   LessonAttendanceMapper attendanceMapper) {
        this.bookingMapper = bookingMapper;
        this.appointmentMapper = appointmentMapper;
        this.deductionService = deductionService;
        this.stateAdvancer = stateAdvancer;
        this.attendanceMapper = attendanceMapper;
    }

    /**
     * 结算一个学生的某个课次。
     *
     * @param scheduleId 排期ID（课堂ID）
     * @param studentId  学生用户ID
     * @param classIndex 课次序号；null 时取该预订的首个课次（课次级升级前的兼容路径）
     * @param attended   是否进入过课堂（决定 completed / absent）
     * @param source     调用来源（classroom 回调 / settle-task 兜底），仅用于日志
     */
    public Outcome settle(String scheduleId, String studentId, Integer classIndex,
                          boolean attended, String source) {
        Outcome out = new Outcome();
        out.scheduleId = scheduleId;
        out.studentId = studentId;

        // 排期 id 要解掉课次后缀才能命中 booking（booking.schedule_id 存裸 id）；
        // 而写 lesson_attendance / 更新结算列时仍用原始编码 id，与课堂侧保持一致。
        String realScheduleId = com.reservation.common.ClassroomKey.scheduleIdOf(scheduleId);
        Booking booking = bookingMapper.selectByScheduleAndStudentIgnoreTenant(realScheduleId, studentId);
        if (booking == null) {
            out.reason = "预订不存在，无法归户";
            log.warn("课次结算跳过({}): scheduleId={}, studentId={}, 原因={}", source, scheduleId, studentId, out.reason);
            return out;
        }
        Appointment appointment = (classIndex == null)
                ? appointmentMapper.selectFirstByBooking(booking.getBookingId())
                : appointmentMapper.selectByBookingAndClassIndex(booking.getBookingId(), classIndex);
        if (appointment == null) {
            out.reason = "课次不存在";
            log.warn("课次结算跳过({}): scheduleId={}, studentId={}, classIndex={}, 原因={}",
                    source, scheduleId, studentId, classIndex, out.reason);
            return out;
        }
        out.appointmentId = appointment.getId();
        out.classIndex = appointment.getClassIndex();

        // 1. 扣减（幂等）。请假族在这里返回 exempt，不会写流水。
        LessonDeductionService.DeductResult deduct = deductionService.settleByAppointment(appointment);
        out.deducted = deduct.deducted;
        out.exempt = deduct.exempt;
        out.duplicate = deduct.duplicate;
        out.consumedLessons = deduct.change == null ? BigDecimal.ZERO : deduct.change.negate();
        out.remainingAfter = deduct.remainingAfter;

        // 2. 状态推进（终态保护 + 请假互斥 + CAS）
        out.statusChanged = stateAdvancer.finalizeAfterClass(appointment, attended);

        // 3. 回写出勤结算列（供运营查看与对账；失败不影响主流程）
        String state = deduct.exempt ? STATE_WAIVED : (deduct.deducted || deduct.duplicate ? STATE_SETTLED : STATE_PENDING);
        try {
            attendanceMapper.updateSettlementIgnoreTenant(scheduleId, studentId, appointment.getId(),
                    appointment.getClassIndex(), out.consumedLessons, state, LocalDateTime.now());
        } catch (Exception e) {
            log.warn("出勤结算列回写失败(不影响扣减与状态): scheduleId={}, studentId={}, err={}",
                    scheduleId, studentId, e.getMessage());
        }

        log.info("课次结算({}): scheduleId={}, studentId={}, appointmentId={}, 状态={}→{},"
                        + " 扣减={}, 免扣={}, 幂等命中={}, 余量={}",
                source, scheduleId, studentId, appointment.getId(), appointment.getStatus(),
                attended ? AppointmentStatus.COMPLETED : AppointmentStatus.ABSENT,
                out.consumedLessons, out.exempt, out.duplicate, out.remainingAfter);
        return out;
    }

    /**
     * 仅签到（不扣费、不改终态）。课堂 enter 时调用。
     */
    public boolean markCheckedIn(String scheduleId, String studentId) {
        String realScheduleId = com.reservation.common.ClassroomKey.scheduleIdOf(scheduleId);
        Booking booking = bookingMapper.selectByScheduleAndStudentIgnoreTenant(realScheduleId, studentId);
        if (booking == null) return false;
        Appointment appointment = appointmentMapper.selectFirstByBooking(booking.getBookingId());
        if (appointment == null) return false;
        return stateAdvancer.markCheckedIn(appointment);
    }

    /** 结算结果（供控制器汇总与日志） */
    public static class Outcome {
        public String scheduleId;
        public String studentId;
        public Integer appointmentId;
        public Integer classIndex;
        /** 本次真的扣了课时 */
        public boolean deducted;
        /** 因请假/取消而免扣 */
        public boolean exempt;
        /** 命中幂等（此前已结算） */
        public boolean duplicate;
        /** 课次状态是否被本次推进 */
        public boolean statusChanged;
        public BigDecimal consumedLessons = BigDecimal.ZERO;
        public BigDecimal remainingAfter;
        /** 跳过原因（预订/课次不存在等） */
        public String reason;

        public boolean skipped() {
            return reason != null;
        }
    }
}
