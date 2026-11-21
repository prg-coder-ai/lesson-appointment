package com.reservation.service;

import com.reservation.common.AppointmentStatus;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.StudentLessonBalance;
import com.reservation.entity.StudentLessonFlow;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.StudentLessonBalanceMapper;
import com.reservation.mapper.StudentLessonFlowMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 课时扣减规则单测（课时扣减方案 v2 第三节）。
 *
 * <p>核心断言只有一条：<b>扣费只看有没有请假，与上了多久无关</b>。
 * 因此这里不去构造任何「有效时长」，只喂状态。
 */
class LessonDeductionServiceTest {

    private StudentLessonBalanceMapper balanceMapper;
    private StudentLessonFlowMapper flowMapper;
    private BookingMapper bookingMapper;
    private LessonDeductionService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        balanceMapper = mock(StudentLessonBalanceMapper.class);
        flowMapper = mock(StudentLessonFlowMapper.class);
        bookingMapper = mock(BookingMapper.class);

        // TransactionTemplate 用真实实例但换掉事务管理器：execute 会直接执行回调，
        // 这样既能跑到 doDeductInTx 的全部逻辑，又不需要真的起数据库。
        PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
        TransactionTemplate template = new TransactionTemplate(txManager) {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(mock(org.springframework.transaction.TransactionStatus.class));
            }
        };

        service = new LessonDeductionService(balanceMapper, flowMapper, bookingMapper, txManager);
        // 用 template 替换内部实例（字段是构造里 new 的，用反射换掉）
        ReflectionTestUtils.setField(service, "perClassLessons", new BigDecimal("1.0"));
        ReflectionTestUtils.setField(service, "transactionTemplate", template);
    }

    // ==================== 免扣族 ====================

    @Test
    @DisplayName("学生请假申请中（cancelling）→ 免扣，且不写流水")
    void leaveAppliedIsExempt() {
        Appointment appt = appt(1001, AppointmentStatus.CANCELLING);

        LessonDeductionService.DeductResult r = service.settleByAppointment(appt);

        assertTrue(r.exempt, "请假申请中必须免扣");
        assertFalse(r.deducted);
        verify(flowMapper, never()).insertExplicit(any(StudentLessonFlow.class));
        verify(balanceMapper, never()).applyUsedDelta(anyLong(), anyString(), any());
    }

    @Test
    @DisplayName("请假获准（cancelled）→ 免扣")
    void leaveApprovedIsExempt() {
        assertTrue(service.settleByAppointment(appt(1002, AppointmentStatus.CANCELLED)).exempt);
    }

    @Test
    @DisplayName("学生课次级取消申请（s-cancelling）→ 免扣")
    void studentCancelApplyingIsExempt() {
        assertTrue(service.settleByAppointment(appt(1003, AppointmentStatus.S_CANCELLING)).exempt);
    }

    @Test
    @DisplayName("教师取消（t-cancelled）→ 免扣（非学生责任）")
    void teacherCancelledIsExempt() {
        assertTrue(service.settleByAppointment(appt(1004, AppointmentStatus.T_CANCELLED)).exempt);
    }

    @Test
    @DisplayName("已改期（changed）→ 本次免扣")
    void changedIsExempt() {
        assertTrue(service.settleByAppointment(appt(1005, AppointmentStatus.CHANGED)).exempt);
    }

    // ==================== 必扣族 ====================

    @Test
    @DisplayName("缺席（absent）没请假 → 照扣 1 课时")
    void absentStillCharged() {
        stubHappyPath("stu-absent", new BigDecimal("5.00"));
        Appointment appt = appt(2001, AppointmentStatus.ABSENT);

        LessonDeductionService.DeductResult r = service.settleByAppointment(appt);

        assertTrue(r.deducted, "缺席但未请假必须扣课时");
        assertEquals(0, new BigDecimal("-1.00").compareTo(r.change), "变动应为 -1 课时");
        assertEquals(0, new BigDecimal("4.00").compareTo(r.remainingAfter));
    }

    @Test
    @DisplayName("已签到（checked-in）未请假 → 扣 1 课时")
    void checkedInCharged() {
        stubHappyPath("stu-ci", new BigDecimal("2.00"));
        assertTrue(service.settleByAppointment(appt(2002, AppointmentStatus.CHECKED_IN)).deducted);
    }

    @Test
    @DisplayName("已完成（completed）未请假 → 扣 1 课时")
    void completedCharged() {
        stubHappyPath("stu-cp", new BigDecimal("2.00"));
        assertTrue(service.settleByAppointment(appt(2003, AppointmentStatus.COMPLETED)).deducted);
    }

    @Test
    @DisplayName("生效中（active）到点结算 → 扣 1 课时（兜底任务走这条）")
    void activeCharged() {
        stubHappyPath("stu-ac", new BigDecimal("2.00"));
        assertTrue(service.settleByAppointment(appt(2004, AppointmentStatus.ACTIVE)).deducted);
    }

    // ==================== 幂等 ====================

    @Test
    @DisplayName("同一课次重复结算 → 第二次命中幂等，余额不再变动")
    void idempotentByBizKey() {
        Appointment appt = appt(3001, AppointmentStatus.ABSENT);
        when(flowMapper.countByBizKey(anyLong(), eq("classroom:3001"))).thenReturn(1);

        LessonDeductionService.DeductResult r = service.settleByAppointment(appt);

        assertTrue(r.duplicate);
        assertFalse(r.deducted);
        verify(balanceMapper, never()).applyUsedDelta(anyLong(), anyString(), any());
    }

    @Test
    @DisplayName("并发撞唯一键（DuplicateKeyException）→ 按已结算处理，不抛给调用方")
    void concurrentDuplicateTreatedAsSettled() {
        stubHappyPath("stu-dup", new BigDecimal("3.00"));
        when(flowMapper.insertExplicit(any(StudentLessonFlow.class)))
                .thenThrow(new DuplicateKeyException("uk_slf_biz"));

        LessonDeductionService.DeductResult r = service.settleByAppointment(appt(3002, AppointmentStatus.ABSENT));

        assertTrue(r.duplicate, "唯一键冲突应视为幂等命中");
        assertFalse(r.deducted);
    }

    // ==================== 余额边界 ====================

    @Test
    @DisplayName("余额不足（0）→ 允许扣成负数，表示欠课时")
    void allowNegativeBalance() {
        stubHappyPath("stu-poor", BigDecimal.ZERO);

        LessonDeductionService.DeductResult r = service.settleByAppointment(appt(4001, AppointmentStatus.ABSENT));

        assertTrue(r.deducted);
        assertEquals(0, new BigDecimal("-1.00").compareTo(r.remainingAfter), "应扣成 -1（欠课时）");
    }

    @Test
    @DisplayName("流水记的是负数变动，且带上幂等键与课次ID")
    void flowCarriesBizKeyAndAppointment() {
        stubHappyPath("stu-flow", new BigDecimal("10.00"));

        service.settleByAppointment(appt(4002, AppointmentStatus.ABSENT));

        ArgumentCaptor<StudentLessonFlow> cap = ArgumentCaptor.forClass(StudentLessonFlow.class);
        verify(flowMapper, times(1)).insertExplicit(cap.capture());
        StudentLessonFlow flow = cap.getValue();
        assertEquals("classroom:4002", flow.getBizKey());
        assertEquals(Integer.valueOf(4002), flow.getAppointmentId());
        assertEquals(0, new BigDecimal("-1.00").compareTo(flow.getChangeLessons()));
        assertEquals("classroom", flow.getSource());
        assertEquals("stu-flow", flow.getStudentId());
    }

    @Test
    @DisplayName("课次无法归户（预订不存在）→ 抛错而不是静默跳过")
    void missingBookingFails() {
        Appointment appt = appt(5001, AppointmentStatus.ABSENT);
        when(flowMapper.countByBizKey(anyLong(), anyString())).thenReturn(0);
        when(bookingMapper.selectByIdIgnoreTenant(anyString())).thenReturn(null);

        assertThrows(IllegalArgumentException.class, () -> service.settleByAppointment(appt));
        verify(balanceMapper, never()).applyUsedDelta(anyLong(), anyString(), any());
    }

    // ==================== 夹具 ====================

    private Appointment appt(int id, String status) {
        Appointment a = new Appointment();
        a.setId(id);
        a.setTenantId(2L);
        a.setBookingId("bk-" + id);
        a.setClassIndex(1);
        a.setStatus(status);
        return a;
    }

    private void stubHappyPath(String studentId, BigDecimal remaining) {
        when(flowMapper.countByBizKey(anyLong(), anyString())).thenReturn(0);
        Booking b = new Booking();
        b.setBookingId("bk");
        b.setStudentId(studentId);
        when(bookingMapper.selectByIdIgnoreTenant(anyString())).thenReturn(b);
        when(balanceMapper.insertIfAbsent(anyLong(), anyString())).thenReturn(1);

        StudentLessonBalance balance = new StudentLessonBalance();
        balance.setTenantId(2L);
        balance.setStudentId(studentId);
        balance.setRemainingLessons(remaining);
        balance.setVersion(0);
        when(balanceMapper.selectForUpdate(anyLong(), anyString())).thenReturn(balance);
        when(balanceMapper.applyUsedDelta(anyLong(), anyString(), any())).thenReturn(1);
        when(flowMapper.insertExplicit(any(StudentLessonFlow.class))).thenReturn(1);
    }
}
