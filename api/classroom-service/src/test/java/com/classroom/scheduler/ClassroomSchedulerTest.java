package com.classroom.scheduler;

import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.entity.RollCallRecord;
import com.classroom.mapper.PresenceSegmentMapper;
import com.classroom.mapper.ReconcileLogMapper;
import com.classroom.mapper.RollCallRecordMapper;
import com.classroom.mapper.SessionRecordMapper;
import com.classroom.mapper.SubmissionMapper;
import com.classroom.service.CallbackService;
import com.classroom.service.ClassroomService;
import com.classroom.service.MembershipService;
import com.classroom.service.RecordingService;
import com.classroom.ws.OnlineStateManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * P0-D 七个扫描器的单元测试（Mockito，无 Spring 上下文）。
 *
 * <p>钉住每条扫描器的「选行 → 动作」映射，以及「单条失败不污染整轮」的容错。
 */
class ClassroomSchedulerTest {

    private ClassroomService classroomService;
    private MembershipService membershipService;
    private OnlineStateManager onlineStateManager;
    private RollCallRecordMapper rollCallRecordMapper;
    private PresenceSegmentMapper presenceSegmentMapper;
    private ReconcileLogMapper reconcileLogMapper;
    private RecordingService recordingService;
    private SessionRecordMapper sessionRecordMapper;
    private SubmissionMapper submissionMapper;
    private CallbackService callbackService;
    private ClassroomScheduler scheduler;

    @BeforeEach
    void setUp() {
        classroomService = mock(ClassroomService.class);
        membershipService = mock(MembershipService.class);
        onlineStateManager = mock(OnlineStateManager.class);
        rollCallRecordMapper = mock(RollCallRecordMapper.class);
        presenceSegmentMapper = mock(PresenceSegmentMapper.class);
        reconcileLogMapper = mock(ReconcileLogMapper.class);
        recordingService = mock(RecordingService.class);
        sessionRecordMapper = mock(SessionRecordMapper.class);
        submissionMapper = mock(SubmissionMapper.class);
        callbackService = mock(CallbackService.class);
        scheduler = new ClassroomScheduler(classroomService, membershipService, onlineStateManager,
                rollCallRecordMapper, presenceSegmentMapper, reconcileLogMapper, recordingService,
                sessionRecordMapper, submissionMapper, callbackService);
    }

    private Classroom classroom(String scheduleId, String status, Boolean autoStart) {
        Classroom c = new Classroom();
        c.setScheduleId(scheduleId);
        c.setStatus(status);
        c.setAutoStart(autoStart);
        c.setCourseId("C-1");
        c.setCourseName("测试课");
        c.setTenantId(3L);
        return c;
    }

    private Membership membership(String scheduleId, String userId, String onlineState) {
        Membership m = new Membership();
        m.setScheduleId(scheduleId);
        m.setUserId(userId);
        m.setOnlineState(onlineState);
        return m;
    }

    private void setAutoStartEnabled(boolean v) {
        try {
            Field f = ClassroomScheduler.class.getDeclaredField("autoStartEnabled");
            f.setAccessible(true);
            f.set(scheduler, v);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void setTeacherDropGraceSeconds(int v) {
        try {
            Field f = ClassroomScheduler.class.getDeclaredField("teacherDropGraceSeconds");
            f.setAccessible(true);
            f.set(scheduler, v);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // ============ 1. 就绪提醒 ============
    @Test
    @DisplayName("就绪提醒：SCHEDULED 翻成 READY 后推送提醒")
    void scanReadyReminder_flipsAndAlerts() {
        when(classroomService.findReadyToRemind(anyInt()))
                .thenReturn(List.of(classroom("S1", "SCHEDULED", null)));
        when(classroomService.markReady("S1")).thenReturn(true);

        scheduler.scanReadyReminder();

        verify(classroomService).markReady("S1");
        verify(callbackService).sendAlert(eq("S1"), any());
    }

    @Test
    @DisplayName("就绪提醒：未翻成功（已被开课）不再发提醒")
    void scanReadyReminder_noAlertWhenNotFlipped() {
        when(classroomService.findReadyToRemind(anyInt()))
                .thenReturn(List.of(classroom("S1", "SCHEDULED", null)));
        when(classroomService.markReady("S1")).thenReturn(false);

        scheduler.scanReadyReminder();

        verify(callbackService, never()).sendAlert(anyString(), any());
    }

    @Test
    @DisplayName("就绪提醒：单条抛错不污染后续课堂")
    void scanReadyReminder_resilientToItemError() {
        when(classroomService.findReadyToRemind(anyInt()))
                .thenReturn(List.of(classroom("c1", "SCHEDULED", null), classroom("c2", "SCHEDULED", null)));
        when(classroomService.markReady("c1")).thenThrow(new RuntimeException("boom"));
        when(classroomService.markReady("c2")).thenReturn(true);

        assertDoesNotThrow(() -> scheduler.scanReadyReminder());

        verify(callbackService, never()).sendAlert(eq("c1"), any());
        verify(callbackService).sendAlert(eq("c2"), any());
    }

    // ============ 2. 自动开课 ============
    @Test
    @DisplayName("自动开课：全局开 + 到点 → startClass")
    void scanAutoStart_startsWhenDue() {
        setAutoStartEnabled(true);
        when(classroomService.findDueToStart()).thenReturn(List.of(classroom("S1", "SCHEDULED", null)));

        scheduler.scanAutoStart();

        verify(classroomService).startClass("S1");
    }

    @Test
    @DisplayName("自动开课：全局关 → 不开课")
    void scanAutoStart_globalDisabled() {
        setAutoStartEnabled(false);
        when(classroomService.findDueToStart()).thenReturn(List.of(classroom("S1", "SCHEDULED", null)));

        scheduler.scanAutoStart();

        verify(classroomService, never()).startClass(anyString());
    }

    @Test
    @DisplayName("自动开课：单课堂 autoStart=false → 跳过该课堂")
    void scanAutoStart_singleClassDisabled() {
        setAutoStartEnabled(true);
        when(classroomService.findDueToStart()).thenReturn(List.of(classroom("S1", "SCHEDULED", false)));

        scheduler.scanAutoStart();

        verify(classroomService, never()).startClass("S1");
    }

    // ============ 3. 自动下课 ============
    @Test
    @DisplayName("自动下课：LIVE 超期 → endClass")
    void scanAutoEnd_closesOverdue() {
        when(classroomService.findOverdueLive(anyInt())).thenReturn(List.of(classroom("S1", "LIVE", null)));

        scheduler.scanAutoEnd();

        verify(classroomService).endClass("S1");
    }

    // ============ 4. 学生掉线判定 ============
    @Test
    @DisplayName("学生掉线：DB 在线但 Redis key 消失 → 判 OFFLINE")
    void scanStudentDrop_marksOfflineWhenRedisKeyGone() {
        when(classroomService.listByStatus(eq("LIVE"), isNull()))
                .thenReturn(List.of(classroom("S1", "LIVE", null)));
        when(membershipService.listOnline("S1")).thenReturn(List.of(membership("S1", "U1", "ONLINE")));
        when(onlineStateManager.isOnline("S1", "U1")).thenReturn(false);

        scheduler.scanStudentDrop();

        verify(membershipService).leave("S1", "U1", "timeout");
    }

    @Test
    @DisplayName("学生掉线：Redis key 仍在 → 不动")
    void scanStudentDrop_noActionWhenRedisKeyPresent() {
        when(classroomService.listByStatus(eq("LIVE"), isNull()))
                .thenReturn(List.of(classroom("S1", "LIVE", null)));
        when(membershipService.listOnline("S1")).thenReturn(List.of(membership("S1", "U1", "ONLINE")));
        when(onlineStateManager.isOnline("S1", "U1")).thenReturn(true);

        scheduler.scanStudentDrop();

        verify(membershipService, never()).leave(anyString(), anyString(), anyString());
    }

    // ============ 5. 点名超时 ============
    @Test
    @DisplayName("点名超时：PENDING 超时 → TIMEOUT")
    void scanRollCallTimeout_marksTimeout() {
        RollCallRecord r = new RollCallRecord();
        r.setRollcallId(7L);
        r.setScheduleId("S1");
        r.setStatus("PENDING");
        r.setInitiatedAt(LocalDateTime.now().minusHours(1));
        when(rollCallRecordMapper.listExpiredPending(any(LocalDateTime.class))).thenReturn(List.of(r));
        when(rollCallRecordMapper.updateById((RollCallRecord) any(RollCallRecord.class))).thenReturn(1);

        scheduler.scanRollCallTimeout();

        var captor = org.mockito.ArgumentCaptor.forClass(RollCallRecord.class);
        verify(rollCallRecordMapper).updateById(captor.capture());
        assertEquals("TIMEOUT", captor.getValue().getStatus());
        assertEquals(7L, captor.getValue().getRollcallId());
    }

    // ============ 6. 教师掉线结课 ============
    @Test
    @DisplayName("教师掉线结课：教师离线超宽限 → 自动结课")
    void scanTeacherDrop_closesAfterGrace() {
        setTeacherDropGraceSeconds(120);
        when(classroomService.listByStatus(eq("LIVE"), isNull()))
                .thenReturn(List.of(classroom("S1", "LIVE", null)));
        Membership teacher = membership("S1", "T1", "OFFLINE");
        teacher.setLeaveTime(LocalDateTime.now().minusSeconds(200));
        when(membershipService.getTeacher("S1")).thenReturn(teacher);

        scheduler.scanTeacherDrop();

        verify(classroomService).endClass("S1");
    }

    @Test
    @DisplayName("教师掉线结课：宽限内不结课")
    void scanTeacherDrop_noCloseWithinGrace() {
        setTeacherDropGraceSeconds(120);
        when(classroomService.listByStatus(eq("LIVE"), isNull()))
                .thenReturn(List.of(classroom("S1", "LIVE", null)));
        Membership teacher = membership("S1", "T1", "OFFLINE");
        teacher.setLeaveTime(LocalDateTime.now().minusSeconds(10));
        when(membershipService.getTeacher("S1")).thenReturn(teacher);

        scheduler.scanTeacherDrop();

        verify(classroomService, never()).endClass("S1");
    }

    @Test
    @DisplayName("教师掉线结课：无教师记录 → 不动")
    void scanTeacherDrop_noTeacherRecord() {
        when(classroomService.listByStatus(eq("LIVE"), isNull()))
                .thenReturn(List.of(classroom("S1", "LIVE", null)));
        when(membershipService.getTeacher("S1")).thenReturn(null);

        scheduler.scanTeacherDrop();

        verify(classroomService, never()).endClass("S1");
    }

    // ============ 7. 过期数据清理 ============
    @Test
    @DisplayName("过期清理：六张表各删一次")
    void scanRetentionCleanup_callsAllDeleteMappers() {
        scheduler.scanRetentionCleanup();

        verify(presenceSegmentMapper).deleteBefore(any(LocalDateTime.class));
        verify(rollCallRecordMapper).deleteByInitiatedAtBefore(any(LocalDateTime.class));
        verify(reconcileLogMapper).deleteByReceivedAtBefore(any(LocalDateTime.class));
        verify(sessionRecordMapper).deleteByEndTimeBefore(any(LocalDateTime.class));
        verify(submissionMapper).deleteByCreatedAtBefore(any(LocalDateTime.class));
        verify(recordingService).purgeExpired();
    }
}
