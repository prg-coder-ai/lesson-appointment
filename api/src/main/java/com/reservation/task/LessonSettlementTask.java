package com.reservation.task;

import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.LessonAttendance;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.LessonAttendanceMapper;
import com.reservation.common.ScheduleGenerator;
import com.reservation.service.LessonSettlementService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 课时兜底结算任务（2026-10-28，课时扣减方案 v2 第五节「兜底路径」）。
 *
 * <h3>为什么必须有这个任务</h3>
 * 扣减规则是「<b>没请假就扣</b>」，这条规则**不依赖课堂是否接通**。但主路径是课堂收尾回调——
 * 以下三种情况回调永远不会来，课次会停在 {@code active}/{@code checked-in}：
 * <ol>
 *   <li>租户没开通课堂（线下授课，或还没绑定实例）；</li>
 *   <li>课堂服务挂了 / 网络中断 / 回调重试耗尽进死信；</li>
 *   <li>课堂侧收尾失败（如收尾事务抛错，只记了 ERROR 日志）。</li>
 * </ol>
 * 没有兜底，这些课次就永远欠着课时、账永远对不平，而且「学生白上一节课」的成本由机构承担。
 *
 * <h3>判出席用什么是安全的</h3>
 * 有出勤回流 → 按 {@code lesson_attendance.check_in_at} 是否非空判 completed/absent；
 * <b>没有出勤回流</b>（未开通课堂）→ 一律判 {@code completed}。理由：
 * 线下课没有签到数据不等于学生没来，判缺席会让家长看到「缺席」而实际上了课，
 * 争议成本远高于账务上少区分一次。
 *
 * <h3>幂等</h3>
 * 结算本身按 {@code classroom:{appointmentId}} 幂等，本任务重复跑、与回调并发跑都不会重复扣。
 * 任务粒度用 {@code fixedDelay} 而不是 {@code fixedRate}：上一轮没跑完不叠加下一轮。
 */
@Component
public class LessonSettlementTask {

    private static final Logger log = LoggerFactory.getLogger(LessonSettlementTask.class);

    private final AppointmentMapper appointmentMapper;
    private final BookingMapper bookingMapper;
    private final LessonAttendanceMapper attendanceMapper;
    private final LessonSettlementService settlementService;

    /** 宽限期（小时）：给迟到补录、人工改判、回调重试留窗口，避免刚下课就锁死 */
    @Value("${lesson.settle.grace-hours:24}")
    private int graceHours;

    /** 单轮最多处理多少条，防止一次拉爆内存与事务 */
    @Value("${lesson.settle.batch-size:200}")
    private int batchSize;

    /** 防重叠：@Scheduled 是 fixedDelay 已经不重叠，但多实例部署时仍需本地闸（分布式锁属后续） */
    private final AtomicBoolean running = new AtomicBoolean(false);

    public LessonSettlementTask(AppointmentMapper appointmentMapper,
                                BookingMapper bookingMapper,
                                LessonAttendanceMapper attendanceMapper,
                                LessonSettlementService settlementService) {
        this.appointmentMapper = appointmentMapper;
        this.bookingMapper = bookingMapper;
        this.attendanceMapper = attendanceMapper;
        this.settlementService = settlementService;
    }

    /**
     * 每 10 分钟扫一次「该结算但没结算」的课次。
     *
     * <p>{@code initialDelay} 2 分钟：启动瞬间数据库连接池还在预热，立刻全表扫容易把
     * 首屏接口拖慢；错开两分钟对业务无影响。
     */
    @Scheduled(fixedDelayString = "${lesson.settle.interval-ms:600000}",
            initialDelayString = "${lesson.settle.initial-delay-ms:120000}")
    public void settleOverdueAppointments() {
        if (!running.compareAndSet(false, true)) {
            log.debug("上一轮兜底结算尚未结束，跳过本轮");
            return;
        }
        try {
            // appointment_datetime 是 UTC，deadline 也必须是 UTC（tz 守卫约束）
            LocalDateTime deadline = ScheduleGenerator.nowUtc().minusHours(graceHours);
            List<Appointment> pending = appointmentMapper.selectPendingSettlement(deadline, batchSize);
            if (pending.isEmpty()) {
                return;
            }
            log.info("兜底结算开始: 待结算={} 条, 截止时间(UTC)={}", pending.size(), deadline);

            int settled = 0, failed = 0;
            for (Appointment appt : pending) {
                try {
                    if (settleOne(appt) != null) settled++;
                } catch (Exception e) {
                    failed++;
                    // 单条失败不影响其余：下一轮会再扫到它（状态没变）
                    log.warn("兜底结算失败(下轮重试): appointmentId={}, err={}", appt.getId(), e.getMessage());
                }
            }
            log.info("兜底结算完成: 成功={}, 失败={}, 本批={}", settled, failed, pending.size());
        } catch (Exception e) {
            log.error("兜底结算任务异常", e);
        } finally {
            running.set(false);
        }
    }

    /** 结算单个课次；归户失败返回 null */
    private LessonSettlementService.Outcome settleOne(Appointment appt) {
        Booking booking = bookingMapper.selectByIdIgnoreTenant(appt.getBookingId());
        if (booking == null) {
            log.warn("兜底结算跳过(预订已删): appointmentId={}, bookingId={}", appt.getId(), appt.getBookingId());
            return null;
        }
        // 出席判定：有出勤回流就按签到时间；完全没有回流说明没开通课堂 → 按到课处理
        LessonAttendance attendance = attendanceMapper.selectOneIgnoreTenant(
                booking.getScheduleId(), booking.getStudentId());
        boolean attended = attendance == null || attendance.getCheckInAt() != null;

        return settlementService.settle(booking.getScheduleId(), booking.getStudentId(),
                appt.getClassIndex(), attended, "settle-task");
    }
}
