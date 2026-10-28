package com.classroom.event;

import com.classroom.dto.ScheduleEventReq;
import com.classroom.entity.Classroom;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.MembershipMapper;
import com.classroom.service.AttendanceService;
import com.classroom.service.ClassroomService;
import com.classroom.service.ReconcileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * 课次级事件消费的回归测试（2026-10-28，多课次推送配套）。
 *
 * <p>钉住四个「不出错但错账」的点：
 * <ol>
 *   <li>{@code created} 按 {@code classIndex} 编码课堂标识：第 1 课次裸 id、第 2 次起 {@code sid~N}。</li>
 *   <li>{@code cancelled} 不带 classIndex 时按<b>前缀批量</b>取消该排期全部课次课堂；
 *       只取消裸 id 的那一条，会让第 2..N 课次的课堂永远挂在监控列表里。</li>
 *   <li>批量取消必须跳过 CLOSED/CANCELLED/LIVE（里面有出勤与课时消耗，改状态等于抹账务证据）。</li>
 *   <li>{@code updated} 带 {@code classCount} 时清理「课次数变少」后多出来的课堂。</li>
 * </ol>
 */
class ScheduleEventConsumerMultiInstanceTest {

    private ClassroomMapper classroomMapper;
    private MembershipMapper membershipMapper;
    private ClassroomService classroomService;
    private AttendanceService attendanceService;
    private ReconcileService reconcileService;
    private ScheduleEventConsumer consumer;

    @BeforeEach
    void setUp() {
        classroomMapper = mock(ClassroomMapper.class);
        membershipMapper = mock(MembershipMapper.class);
        classroomService = mock(ClassroomService.class);
        attendanceService = mock(AttendanceService.class);
        reconcileService = mock(ReconcileService.class);
        consumer = new ScheduleEventConsumer(classroomMapper, membershipMapper,
                classroomService, attendanceService, reconcileService);
    }

    private static ScheduleEventReq event(String type, Integer classIndex, Integer classCount) {
        ScheduleEventReq e = new ScheduleEventReq();
        e.setEventId("evt-" + type + "-" + classIndex);
        e.setEventType(type);
        e.setScheduleId("SCH-1");
        e.setClassIndex(classIndex);
        e.setClassCount(classCount);
        e.setTenantId(1001L);
        e.setCourseId("C-1");
        e.setCourseName("英语口语");
        ScheduleEventReq.TeacherInfo t = new ScheduleEventReq.TeacherInfo();
        t.setUserId("T-1");
        t.setName("张老师");
        e.setTeacher(t);
        e.setStartTime(LocalDateTime.parse("2026-11-03T10:00:00"));
        e.setEndTime(LocalDateTime.parse("2026-11-03T10:45:00"));
        e.setDuration(45);
        e.setVersion(100);
        return e;
    }

    private static Classroom room(String id, String status) {
        Classroom c = new Classroom();
        c.setScheduleId(id);
        c.setStatus(status);
        return c;
    }

    @Test
    @DisplayName("created 第 2 课次 → 课堂标识编码为 SCH-1~2（第 1 课次保持裸 id）")
    void createdUsesClassLevelKey() {
        consumer.consume(event("created", 2, null));

        org.mockito.ArgumentCaptor<Classroom> captor = org.mockito.ArgumentCaptor.forClass(Classroom.class);
        verify(classroomMapper).insert(captor.capture());
        assertEquals("SCH-1~2", captor.getValue().getScheduleId(), "第 2 课次必须编码，不能与第 1 课次撞 id");
        assertEquals(1001L, captor.getValue().getTenantId(), "租户从事件载荷取，不能写死 0");
        assertEquals(45, captor.getValue().getDuration(), "单课时长随事件落库，别回落 60");
    }

    @Test
    @DisplayName("created 第 1 课次 → 仍是裸 id（历史数据兼容，不可省）")
    void createdFirstInstanceKeepsBareId() {
        consumer.consume(event("created", 1, null));

        org.mockito.ArgumentCaptor<Classroom> captor = org.mockito.ArgumentCaptor.forClass(Classroom.class);
        verify(classroomMapper).insert(captor.capture());
        assertEquals("SCH-1", captor.getValue().getScheduleId());
    }

    @Test
    @DisplayName("cancelled 不带 classIndex → 按前缀批量取消该排期全部课次课堂")
    void cancelledCancelsWholeScheduleGroup() {
        when(classroomMapper.listByScheduleGroup("SCH-1")).thenReturn(
                List.of(room("SCH-1", "SCHEDULED"), room("SCH-1~2", "SCHEDULED"), room("SCH-1~3", "SCHEDULED")));
        when(classroomMapper.updateStatus(anyString(), anyString(), anyString())).thenReturn(1);

        consumer.consume(event("cancelled", null, null));

        verify(classroomMapper).updateStatus("SCH-1", "SCHEDULED", "CANCELLED");
        verify(classroomMapper).updateStatus("SCH-1~2", "SCHEDULED", "CANCELLED");
        verify(classroomMapper).updateStatus("SCH-1~3", "SCHEDULED", "CANCELLED");
        verify(classroomService, never()).cancel(anyString());
    }

    @Test
    @DisplayName("cancelled 带 classIndex → 只取消那一个课次（旧推送方/单课次场景）")
    void cancelledWithIndexCancelsSingle() {
        consumer.consume(event("cancelled", 2, null));

        verify(classroomService).cancel("SCH-1~2");
        verify(classroomMapper, never()).listByScheduleGroup(anyString());
    }

    @Test
    @DisplayName("批量取消跳过 CLOSED/CANCELLED/LIVE —— 里面已有出勤与课时消耗，改状态等于抹证据")
    void cancelledSkipsClosedAndLive() {
        when(classroomMapper.listByScheduleGroup("SCH-1")).thenReturn(
                List.of(room("SCH-1", "CLOSED"), room("SCH-1~2", "CANCELLED"),
                        room("SCH-1~3", "LIVE"), room("SCH-1~4", "SCHEDULED")));
        when(classroomMapper.updateStatus(anyString(), anyString(), anyString())).thenReturn(1);

        consumer.consume(event("cancelled", null, null));

        verify(classroomMapper).updateStatus("SCH-1~4", "SCHEDULED", "CANCELLED");
        verify(classroomMapper, never()).updateStatus(eq("SCH-1"), anyString(), anyString());
        verify(classroomMapper, never()).updateStatus(eq("SCH-1~3"), anyString(), anyString());
    }

    @Test
    @DisplayName("updated 带 classCount=2 → 取消多出来的第 3 课次课堂")
    void updatedCancelsOrphanInstances() {
        Classroom first = room("SCH-1", "SCHEDULED");
        first.setVersion(1);
        when(classroomMapper.selectById("SCH-1")).thenReturn(first);
        when(classroomMapper.listByScheduleGroup("SCH-1")).thenReturn(
                List.of(first, room("SCH-1~2", "SCHEDULED"), room("SCH-1~3", "SCHEDULED")));
        when(classroomMapper.updateStatus(anyString(), anyString(), anyString())).thenReturn(1);

        consumer.consume(event("updated", 1, 2));

        verify(classroomMapper).updateStatus("SCH-1~3", "SCHEDULED", "CANCELLED");
        verify(classroomMapper, never()).updateStatus(eq("SCH-1~2"), anyString(), anyString());
        verify(classroomMapper, never()).updateStatus(eq("SCH-1"), anyString(), anyString());
    }

    @Test
    @DisplayName("updated 不带 classCount（旧推送方）→ 不做任何清理，避免误取消")
    void updatedWithoutClassCountNoCleanup() {
        Classroom first = room("SCH-1", "SCHEDULED");
        first.setVersion(1);
        when(classroomMapper.selectById("SCH-1")).thenReturn(first);

        consumer.consume(event("updated", 1, null));

        verify(classroomMapper, never()).listByScheduleGroup(anyString());
        verify(classroomMapper, never()).updateStatus(anyString(), anyString(), anyString());
    }
}
