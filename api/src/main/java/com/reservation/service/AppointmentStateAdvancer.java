package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.entity.Appointment;
import com.reservation.mapper.AppointmentMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 课次状态推进（2026-10-28，课时扣减方案 v2 第二节）。
 *
 * <h3>为什么单独抽一个类</h3>
 * 写 {@code appointment.status} 的地方此前散落在控制器（学生点按钮）与同步服务（预订联动）里，
 * 没有统一入口。课堂回调与兜底任务要改状态时，如果再各写一份 {@code UPDATE}，
 * 终态保护、请假互斥、CAS 并发这些规则就会被抄漏——而漏掉任何一条都表现为
 * 「课次状态被改回去」这种事后极难复现的数据问题。
 *
 * <h3>状态迁移规则</h3>
 * <pre>
 *   active / noted1 / noted2 ──进入课堂──▶ checked-in ──课堂收尾──▶ completed
 *        │                                     │
 *        └────────课堂收尾（从未进入）──────────┴──▶ absent
 * </pre>
 * <ul>
 *   <li><b>终态保护</b>：{@link AppointmentStatus#CLOSED} 内的状态（completed/absent/
 *       cancelled/t-cancelled/changed/frozen）一律不改，返回 {@code false}；</li>
 *   <li><b>请假互斥</b>：{@code cancelling}/{@code s-cancelling}/{@code t-cancelling}
 *       处于审核中，此时改状态会把申请吞掉，一律不动；</li>
 *   <li><b>CAS 更新</b>：改状态时带上「当前状态」作为条件。课堂回调与兜底任务并发时，
 *       只有一个能改成功，另一个拿到 0 行按幂等处理——不会出现后到的覆盖先到的。</li>
 * </ul>
 *
 * <p><b>为什么所有 Mapper 调用都 IgnoreTenant</b>：课堂回调与定时任务都没有
 * {@code TenantContext}，租户插件会兜底拼 {@code tenant_id = -1}，表现为「更新 0 行」而不报错。
 */
@Service
public class AppointmentStateAdvancer {

    private static final Logger log = LoggerFactory.getLogger(AppointmentStateAdvancer.class);

    private final AppointmentMapper appointmentMapper;

    public AppointmentStateAdvancer(AppointmentMapper appointmentMapper) {
        this.appointmentMapper = appointmentMapper;
    }

    /**
     * 学生进入课堂 → {@code checked-in}。
     *
     * <p>只改状态，<b>不产生任何费用动作</b>（用户明确：签到只表示学生出席现状）。
     *
     * @return true=本次发生了状态变更；false=无需变更（已是 checked-in / 终态 / 请假中）
     */
    public boolean markCheckedIn(Appointment appointment) {
        if (appointment == null || appointment.getId() == null) {
            return false;
        }
        String current = normalize(appointment.getStatus());
        if (AppointmentStatus.CHECKED_IN.equals(current)) {
            return false;
        }
        if (AppointmentStatus.isClosed(current) || AppointmentStatus.isCancelling(current)) {
            log.debug("签到不改状态(当前={}): appointmentId={}", current, appointment.getId());
            return false;
        }
        int affected = appointmentMapper.casStatusIgnoreTenant(appointment.getId(), appointment.getStatus(),
                AppointmentStatus.CHECKED_IN);
        if (affected > 0) {
            log.info("课次已签到: appointmentId={}, {} → checked-in", appointment.getId(), current);
            return true;
        }
        log.debug("签到状态变更未命中(并发已改): appointmentId={}, 期望从={}", appointment.getId(), current);
        return false;
    }

    /**
     * 课堂收尾 → 落终态：进过课堂记 {@code completed}，从未进入记 {@code absent}。
     *
     * @param appointment 课次（需含 id 与当前 status）
     * @param attended    是否进入过课堂（由 {@code lesson_attendance.check_in_at} 是否非空决定）
     * @return true=本次发生了状态变更
     */
    public boolean finalizeAfterClass(Appointment appointment, boolean attended) {
        if (appointment == null || appointment.getId() == null) {
            return false;
        }
        String current = normalize(appointment.getStatus());
        if (AppointmentStatus.isClosed(current)) {
            // 终态不再改写：已 completed/absent 的课次重复回调不报错、不覆盖、不改扣减
            log.debug("课次已是终态，收尾跳过: appointmentId={}, status={}", appointment.getId(), current);
            return false;
        }
        if (AppointmentStatus.isCancelling(current)) {
            // 请假审核中：不能把申请吞成 completed/absent，等审核结论
            log.info("课次请假审核中，收尾跳过: appointmentId={}, status={}", appointment.getId(), current);
            return false;
        }
        String target = attended ? AppointmentStatus.COMPLETED : AppointmentStatus.ABSENT;
        int affected = appointmentMapper.casStatusIgnoreTenant(appointment.getId(), appointment.getStatus(), target);
        if (affected > 0) {
            log.info("课次收尾: appointmentId={}, {} → {} (attended={})",
                    appointment.getId(), current, target, attended);
            return true;
        }
        log.debug("收尾状态变更未命中(并发已改): appointmentId={}, 期望从={}", appointment.getId(), current);
        return false;
    }

    /** 是否为请假族（供调用方判断「免扣」原因，避免各处重写判断） */
    public boolean isLeaveExempt(Appointment appointment) {
        return appointment != null && AppointmentStatus.isLessonExempt(appointment.getStatus());
    }

    private String normalize(String status) {
        return status == null ? "" : status.trim().toLowerCase();
    }
}
