package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.common.BookingStatus;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;

import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * booking → appointment 的状态联动：<b>把"什么时候生成课次、什么时候调整课次"这条业务规则
 * 从浏览器收回服务端</b>（薄弱环节报告根因 B）。
 *
 * <p><b>修复前的现状（为什么这是根因而不是 bug）</b>：课次生成与级联取消都写在前端
 * {@code admin-booking.js} 里，浏览器先算时间再逐条 POST {@code saveAppointment}
 * （{@code forEach} 未 await），取消则要先 PUT 课次状态、再 PUT 预订状态，两次 HTTP 非原子。
 * 后果是这条规则<b>只在 Web 端成立</b>——小程序端压根不生成课次；curl 直接调预订状态接口
 * 可以得到"已确认但没有任何课次行"的预订。库里现存 107 条 booked 与 142 条课次的错配即由此而来。
 *
 * <p><b>联动规则（唯一权威口径）</b>
 * <ul>
 *   <li><b>仅当 booking 状态成为 booked 才生成课次</b>。候补(waiting)、待确认(booking)、
 *       已拒绝(rej-booking) 一律不生成——它们本就不构成"已确认的上课安排"。</li>
 *   <li><b>从 booked 变为其它状态时，按下表整组调整课次</b>（课次保留行，不物理删除，
 *       以免抹掉上课历史；只有 frozen 用于标记"已删除"）。</li>
 * </ul>
 *
 * <pre>
 *   booking 目标状态        → 课次处置
 *   ----------------------------------------------------------
 *   booked（确认）          → 无课次则按排期展开生成(active)；已有则把
 *                             非终态的课次还原为 active（支持"取消被驳回后恢复"）
 *   canceling/cancelling    → 整组置 cancelling（学生/整单发起的取消待确认，
 *                             与教师课次级改期的 t-cancelling 来源可区分）
 *   cancelled/canceled      → 整组置 cancelled
 *   frozen（删除）          → 整组置 frozen
 *   waiting（候补）          → 不生成；已有课次置 cancelled（候补不占席位也不占时间）
 *   rej-booking（拒绝）      → 不生成；已有课次置 cancelled
 *   rej-cancelling（驳回取消）→ 还原为 active（取消没被批准，课次本就该继续有效）
 *   booking（退回待确认）    → 还原为 active（等同取消被驳回）
 *   其余状态                → 不动（防御：拒绝盲写）
 * </pre>
 *
 * <p><b>为什么生成与调整都放在事务内</b>：调用方（BookingService）本身已在事务中，
 * 本类以 {@code REQUIRED} 参与同一事务。课次生成失败时预订状态不会留下"已确认却无课次"的
 * 中间态；这正是原先前端 forEach 未 await 导致的半成品问题。
 */
@Slf4j
@Service
public class BookingAppointmentSyncService {

    @Resource
    private AppointmentService appointmentService;

    @Resource
    private CourseScheduleService courseScheduleService;

    /**
     * 按 booking 的目标状态联动课次。调用方须已持有该 booking 的写锁或在同一事务内。
     *
     * @param booking       已持久化的预订行（须含 bookingId / scheduleId）
     * @param targetStatus  booking 的目标状态
     * @return 联动摘要，供接口返回与日志定位用；从未发生变更时 {@code changed=false}
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRED,
            rollbackFor = Exception.class)
    public SyncOutcome syncOnStatusChange(Booking booking, String targetStatus) {
        SyncOutcome outcome = new SyncOutcome();
        if (booking == null || booking.getBookingId() == null || booking.getBookingId().trim().isEmpty()) {
            return outcome;
        }
        String bookingId = booking.getBookingId();
        String status = targetStatus == null ? "" : targetStatus.trim();

        // ---- 1) 进入 booked：生成课次（幂等），并把可恢复的课次还原为 active ----
        if (BookingStatus.isBooked(status)) {
            boolean generated = courseScheduleService.generateAppointmentsForBooking(
                    bookingId, booking.getScheduleId());
            int restored = restoreActive(bookingId);
            outcome.setAppointmentsGenerated(generated);
            outcome.setAppointmentsRestored(restored);
            outcome.setChanged(generated || restored > 0);
            log.info("联动：{} → booked，生成课次={}，还原为 active 的课次={} 条",
                    bookingId, generated, restored);
            return outcome;
        }

        // ---- 2) 离开 booked：按目标状态整组调整 ----
        List<Appointment> existing = appointmentService.getByBookingId(bookingId);
        if (existing == null || existing.isEmpty()) {
            // 从未生成过课次（如 booking→waiting→cancelled），无联动可做。
            // 注意：这不是异常，而是候补被拒等路径的正常情形。
            log.debug("联动：{} → {}，无既有课次，跳过调整", bookingId, status);
            return outcome;
        }

        String appointmentStatus = targetAppointmentStatus(status);
        if (appointmentStatus == null) {
            // 未登记的状态：不动课次。宁可不同步也不要盲写一个前端不认的值。
            log.warn("联动：{} → {} 未登记课次处置策略，课次保持原状（共 {} 条）",
                    bookingId, status, existing.size());
            outcome.setSkipped(existing.size());
            return outcome;
        }

        // 已是终态的课次（completed/changed）不覆写：那是真实发生过的事实，
        // 把它改成 cancelled 等于抹掉"这节课已经上完了"的记录。
        int updated = 0;
        int preserved = 0;
        for (Appointment appt : existing) {
            String current = appt.getStatus();
            if (AppointmentStatus.COMPLETED.equalsIgnoreCase(current)
                    || AppointmentStatus.CHANGED.equalsIgnoreCase(current)) {
                preserved++;
                continue;
            }
            appointmentService.updateStatusById(appt.getId(), appointmentStatus);
            updated++;
        }
        outcome.setAppointmentsUpdated(updated);
        outcome.setAppointmentsPreserved(preserved);
        outcome.setChanged(updated > 0);
        log.info("联动：{} → {}，课次整组置 {}（更新 {} 条，保留 completed/changed {} 条）",
                bookingId, status, appointmentStatus, updated, preserved);
        return outcome;
    }

    /**
     * booking 目标状态 → 课次目标状态。未登记的返回 {@code null} 表示"不动课次"。
     *
     * <p>{@code null} 与"置为 null 状态"是两回事，故用 null 表达"无策略"而非空串。
     */
    private String targetAppointmentStatus(String bookingStatus) {
        if (BookingStatus.CANCELING.equalsIgnoreCase(bookingStatus)
                || BookingStatus.CANCELLING.equalsIgnoreCase(bookingStatus)) {
            // 学生/整单发起的取消待确认。用 cancelling 而非 t-cancelling：
            // 后者已被教师端「申请改期」占用，两者混用无法从数据反推动作发起方。
            return AppointmentStatus.CANCELLING;
        }
        if (BookingStatus.CANCELLED.equalsIgnoreCase(bookingStatus)
                || BookingStatus.CANCELED.equalsIgnoreCase(bookingStatus)) {
            return AppointmentStatus.CANCELLED;
        }
        if (BookingStatus.FROZEN.equalsIgnoreCase(bookingStatus)) {
            return AppointmentStatus.FROZEN;
        }
        if (BookingStatus.WAITING.equalsIgnoreCase(bookingStatus)
                || BookingStatus.REJ_BOOKING.equalsIgnoreCase(bookingStatus)) {
            // 候补与被拒都不构成已确认的上课安排：若此前有课次（例如 cancelled→waiting），
            // 置为已取消而不是删除，保留痕迹。
            return AppointmentStatus.CANCELLED;
        }
        if (BookingStatus.BOOKING.equalsIgnoreCase(bookingStatus)
                || BookingStatus.REJ_CANCELLING.equalsIgnoreCase(bookingStatus)) {
            // 取消被驳回 / 退回待确认：课次本就该继续有效。
            return AppointmentStatus.ACTIVE;
        }
        return null;
    }

    /**
     * 把该 booking 下"尚未终结"的课次还原为 {@code active}（取消被驳回后的恢复）。
     *
     * <p>已取消/已冻结的课次<b>不</b>被还原——那些是已经落定的结果；
     * 只有 active / noted1 / noted2 这类仍在占位或仅带通知标记的才恢复。
     *
     * @return 实际更新的行数
     */
    private int restoreActive(String bookingId) {
        List<Appointment> existing = appointmentService.getByBookingId(bookingId);
        if (existing == null || existing.isEmpty()) {
            return 0;
        }
        int updated = 0;
        for (Appointment appt : existing) {
            String current = appt.getStatus();
            if (AppointmentStatus.ACTIVE.equalsIgnoreCase(current)) {
                continue;
            }
            if (AppointmentStatus.NOTED1.equalsIgnoreCase(current)
                    || AppointmentStatus.NOTED2.equalsIgnoreCase(current)) {
                // 已通知但仍有效：保持通知痕迹，不改。
                continue;
            }
            appointmentService.updateStatusById(appt.getId(), AppointmentStatus.ACTIVE);
            updated++;
        }
        return updated;
    }

    /** 联动结果摘要（供接口返回与日志，不入业务表） */
    public static class SyncOutcome {
        private boolean changed;
        private boolean appointmentsGenerated;
        private int appointmentsUpdated;
        private int appointmentsRestored;
        private int appointmentsPreserved;
        private int skipped;

        public boolean isChanged() { return changed; }
        public void setChanged(boolean changed) { this.changed = changed; }
        public boolean isAppointmentsGenerated() { return appointmentsGenerated; }
        public void setAppointmentsGenerated(boolean v) { this.appointmentsGenerated = v; }
        public int getAppointmentsUpdated() { return appointmentsUpdated; }
        public void setAppointmentsUpdated(int v) { this.appointmentsUpdated = v; }
        public int getAppointmentsRestored() { return appointmentsRestored; }
        public void setAppointmentsRestored(int v) { this.appointmentsRestored = v; }
        public int getAppointmentsPreserved() { return appointmentsPreserved; }
        public void setAppointmentsPreserved(int v) { this.appointmentsPreserved = v; }
        public int getSkipped() { return skipped; }
        public void setSkipped(int v) { this.skipped = v; }

        public java.util.Map<String, Object> toMap() {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("appointmentsGenerated", appointmentsGenerated);
            m.put("appointmentsUpdated", appointmentsUpdated);
            m.put("appointmentsRestored", appointmentsRestored);
            m.put("appointmentsPreserved", appointmentsPreserved);
            return m;
        }
    }
}
