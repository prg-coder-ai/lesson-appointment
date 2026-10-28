package com.reservation.task;

import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.LessonAttendance;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.LessonAttendanceMapper;
import com.reservation.service.LessonSettlementService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 兜底结算任务单测。
 *
 * <p>重点守两条容易写错的判断：
 * <ul>
 *   <li><b>有出勤回流</b>时按 {@code checkInAt} 判出席（没签到 → absent）；</li>
 *   <li><b>完全没有回流</b>（未开通课堂）时按到课处理 —— 判缺席会让家长看到
 *       「缺席」而实际上了课，争议成本高于账务少区分一次。</li>
 * </ul>
 */
class LessonSettlementTaskTest {

    private AppointmentMapper appointmentMapper;
    private BookingMapper bookingMapper;
    private LessonAttendanceMapper attendanceMapper;
    private LessonSettlementService settlementService;
    private LessonSettlementTask task;

    @BeforeEach
    void setUp() {
        appointmentMapper = mock(AppointmentMapper.class);
        bookingMapper = mock(BookingMapper.class);
        attendanceMapper = mock(LessonAttendanceMapper.class);
        settlementService = mock(LessonSettlementService.class);
        task = new LessonSettlementTask(appointmentMapper, bookingMapper, attendanceMapper, settlementService);
        ReflectionTestUtils.setField(task, "graceHours", 24);
        ReflectionTestUtils.setField(task, "batchSize", 200);
    }

    @Test
    @DisplayName("无待结算 → 直接返回，不查预订")
    void nothingToSettle() {
        when(appointmentMapper.selectPendingSettlement(any(), anyInt())).thenReturn(List.of());

        task.settleOverdueAppointments();

        verify(bookingMapper, never()).selectByIdIgnoreTenant(anyString());
        verify(settlementService, never()).settle(any(), any(), any(), anyBoolean(), any());
    }

    @Test
    @DisplayName("有出勤回流且签到过 → attended=true")
    void attendedWhenCheckInExists() {
        stubPending(appt(1, "bk-1", 1));
        when(bookingMapper.selectByIdIgnoreTenant("bk-1")).thenReturn(booking("bk-1", "sch-1", "stu-1"));
        LessonAttendance att = new LessonAttendance();
        att.setCheckInAt(LocalDateTime.now());
        when(attendanceMapper.selectOneIgnoreTenant("sch-1", "stu-1")).thenReturn(att);
        when(settlementService.settle(any(), any(), any(), anyBoolean(), any()))
                .thenReturn(new LessonSettlementService.Outcome());

        task.settleOverdueAppointments();

        verify(settlementService, times(1)).settle(eq("sch-1"), eq("stu-1"), eq(1), eq(true), eq("settle-task"));
    }

    @Test
    @DisplayName("有出勤回流但从未签到 → attended=false（缺席）")
    void absentWhenNeverCheckedIn() {
        stubPending(appt(2, "bk-2", 1));
        when(bookingMapper.selectByIdIgnoreTenant("bk-2")).thenReturn(booking("bk-2", "sch-2", "stu-2"));
        LessonAttendance att = new LessonAttendance(); // checkInAt 为 null
        when(attendanceMapper.selectOneIgnoreTenant("sch-2", "stu-2")).thenReturn(att);
        when(settlementService.settle(any(), any(), any(), anyBoolean(), any()))
                .thenReturn(new LessonSettlementService.Outcome());

        task.settleOverdueAppointments();

        verify(settlementService, times(1)).settle(eq("sch-2"), eq("stu-2"), eq(1), eq(false), eq("settle-task"));
    }

    @Test
    @DisplayName("完全没有出勤回流（未开通课堂）→ 按到课处理，不能判缺席")
    void noAttendanceMeansAttended() {
        stubPending(appt(3, "bk-3", 1));
        when(bookingMapper.selectByIdIgnoreTenant("bk-3")).thenReturn(booking("bk-3", "sch-3", "stu-3"));
        when(attendanceMapper.selectOneIgnoreTenant("sch-3", "stu-3")).thenReturn(null);
        when(settlementService.settle(any(), any(), any(), anyBoolean(), any()))
                .thenReturn(new LessonSettlementService.Outcome());

        task.settleOverdueAppointments();

        verify(settlementService, times(1)).settle(eq("sch-3"), eq("stu-3"), eq(1), eq(true), eq("settle-task"));
    }

    @Test
    @DisplayName("预订已删 → 跳过，不影响同批其余课次")
    void skipWhenBookingMissing() {
        stubPending(appt(4, "bk-missing", 1), appt(5, "bk-ok", 1));
        when(bookingMapper.selectByIdIgnoreTenant("bk-missing")).thenReturn(null);
        when(bookingMapper.selectByIdIgnoreTenant("bk-ok")).thenReturn(booking("bk-ok", "sch-5", "stu-5"));
        when(attendanceMapper.selectOneIgnoreTenant("sch-5", "stu-5")).thenReturn(null);
        when(settlementService.settle(any(), any(), any(), anyBoolean(), any()))
                .thenReturn(new LessonSettlementService.Outcome());

        task.settleOverdueAppointments();

        verify(settlementService, times(1)).settle(eq("sch-5"), eq("stu-5"), eq(1), eq(true), eq("settle-task"));
    }

    @Test
    @DisplayName("单条结算抛异常 → 不中断整批")
    void singleFailureDoesNotBreakBatch() {
        stubPending(appt(6, "bk-6", 1), appt(7, "bk-7", 1));
        when(bookingMapper.selectByIdIgnoreTenant("bk-6")).thenReturn(booking("bk-6", "sch-6", "stu-6"));
        when(bookingMapper.selectByIdIgnoreTenant("bk-7")).thenReturn(booking("bk-7", "sch-7", "stu-7"));
        when(attendanceMapper.selectOneIgnoreTenant(anyString(), anyString())).thenReturn(null);
        when(settlementService.settle(any(), any(), any(), anyBoolean(), any()))
                .thenThrow(new IllegalStateException("模拟结算失败"))
                .thenReturn(new LessonSettlementService.Outcome());

        task.settleOverdueAppointments();

        // 两条都被尝试过（第一条抛错后循环继续）
        verify(settlementService, times(2)).settle(any(), any(), any(), anyBoolean(), any());
    }

    // ==================== 夹具 ====================

    private void stubPending(Appointment... appts) {
        when(appointmentMapper.selectPendingSettlement(any(), anyInt())).thenReturn(List.of(appts));
    }

    private Appointment appt(int id, String bookingId, int classIndex) {
        Appointment a = new Appointment();
        a.setId(id);
        a.setTenantId(2L);
        a.setBookingId(bookingId);
        a.setClassIndex(classIndex);
        a.setStatus("active");
        return a;
    }

    private Booking booking(String id, String scheduleId, String studentId) {
        Booking b = new Booking();
        b.setBookingId(id);
        b.setScheduleId(scheduleId);
        b.setStudentId(studentId);
        b.setTenantId(2L);
        return b;
    }
}
