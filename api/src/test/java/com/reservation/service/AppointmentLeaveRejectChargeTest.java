package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.entity.Appointment;
import com.reservation.mapper.AppointmentMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 请假驳回补扣单测（S6）。
 *
 * <p>守的是「申假即免扣」口径下唯一的漏扣口子：
 * 学生先提请假（不扣）→ 被管理员驳回（状态回 active）→ 课照上，
 * 若没有本补扣，这一节课的课时永远收不回来。
 *
 * <p>同时守住反向风险：<b>正常状态变更绝不能触发扣减</b>——
 * 批量更新时若不区分「原来是否在请假中」，每次点按钮都会扣一次课时。
 */
class AppointmentLeaveRejectChargeTest {

    private AppointmentService service;
    private LessonDeductionService deductionService;
    private AppointmentMapper appointmentMapper;

    @BeforeEach
    void setUp() {
        service = new AppointmentService();
        deductionService = mock(LessonDeductionService.class);
        appointmentMapper = mock(AppointmentMapper.class);
        ReflectionTestUtils.setField(service, "lessonDeductionService", deductionService);
        ReflectionTestUtils.setField(service, "baseMapper", appointmentMapper);
    }

    @Test
    @DisplayName("请假日被驳回退回 active → 必须补扣")
    void rejectedLeaveCharges() {
        Appointment before = appt(1, AppointmentStatus.CANCELLING);
        Appointment fresh = appt(1, AppointmentStatus.ACTIVE);
        when(appointmentMapper.selectById(1)).thenReturn(fresh);

        service.chargeIfLeaveRejected(before, AppointmentStatus.ACTIVE);

        verify(deductionService).settleByAppointment(fresh);
    }

    @Test
    @DisplayName("学生课次级取消被驳回（s-cancelling → active）→ 同样补扣")
    void rejectedStudentCancelCharges() {
        Appointment before = appt(2, AppointmentStatus.S_CANCELLING);
        when(appointmentMapper.selectById(2)).thenReturn(appt(2, AppointmentStatus.ACTIVE));

        service.chargeIfLeaveRejected(before, AppointmentStatus.ACTIVE);

        verify(deductionService).settleByAppointment(any(Appointment.class));
    }

    @Test
    @DisplayName("原本不是请假中（active → completed）→ 不补扣")
    void normalTransitionDoesNotCharge() {
        Appointment before = appt(3, AppointmentStatus.ACTIVE);

        service.chargeIfLeaveRejected(before, AppointmentStatus.COMPLETED);

        verify(deductionService, never()).settleByAppointment(any(Appointment.class));
    }

    @Test
    @DisplayName("请假获准（cancelling → cancelled）→ 仍免扣，不补")
    void approvedLeaveDoesNotCharge() {
        Appointment before = appt(4, AppointmentStatus.CANCELLING);

        service.chargeIfLeaveRejected(before, AppointmentStatus.CANCELLED);

        verify(deductionService, never()).settleByAppointment(any(Appointment.class));
    }

    @Test
    @DisplayName("驳回后改成教师取消（t-cancelled）→ 免扣，不补")
    void teacherCancelledDoesNotCharge() {
        Appointment before = appt(5, AppointmentStatus.CANCELLING);

        service.chargeIfLeaveRejected(before, AppointmentStatus.T_CANCELLED);

        verify(deductionService, never()).settleByAppointment(any(Appointment.class));
    }

    @Test
    @DisplayName("补扣抛异常 → 不得上抛（状态已改成功，账务失败不能回滚业务）")
    void chargeFailureIsSwallowed() {
        Appointment before = appt(6, AppointmentStatus.CANCELLING);
        Appointment fresh = appt(6, AppointmentStatus.ACTIVE);
        when(appointmentMapper.selectById(6)).thenReturn(fresh);
        when(deductionService.settleByAppointment(any(Appointment.class)))
                .thenThrow(new IllegalStateException("模拟账务失败"));

        service.chargeIfLeaveRejected(before, AppointmentStatus.ACTIVE);

        // 没有异常抛出即通过；调用发生过
        verify(deductionService).settleByAppointment(fresh);
    }

    private Appointment appt(int id, String status) {
        Appointment a = new Appointment();
        a.setId(id);
        a.setTenantId(2L);
        a.setBookingId("bk-" + id);
        a.setClassIndex(1);
        a.setStatus(status);
        return a;
    }
}
