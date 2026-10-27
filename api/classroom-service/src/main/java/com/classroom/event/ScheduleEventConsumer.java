package com.classroom.event;

import com.classroom.common.ErrorCodes;
import com.classroom.dto.ScheduleEventReq;
import com.classroom.entity.Classroom;
import com.classroom.exception.ClassroomBizException;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.MembershipMapper;
import com.classroom.entity.Membership;
import com.classroom.service.ClassroomService;
import com.classroom.service.ReconcileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 排期事件消费者：处理 created/updated/cancelled 事件。
 * MQ 主通道消费 + REST 降级接收均路由到本类。
 */
@Slf4j
@Component
public class ScheduleEventConsumer {

    private final ClassroomMapper classroomMapper;
    private final MembershipMapper membershipMapper;
    private final ClassroomService classroomService;
    private final ReconcileService reconcileService;

    public ScheduleEventConsumer(ClassroomMapper classroomMapper,
                                 MembershipMapper membershipMapper,
                                 ClassroomService classroomService,
                                 ReconcileService reconcileService) {
        this.classroomMapper = classroomMapper;
        this.membershipMapper = membershipMapper;
        this.classroomService = classroomService;
        this.reconcileService = reconcileService;
    }

    public void consume(ScheduleEventReq event) {
        try {
            switch (event.getEventType()) {
                case "created" -> handleCreated(event);
                case "updated" -> handleUpdated(event);
                case "cancelled" -> handleCancelled(event);
                default -> log.warn("未知事件类型: {}", event.getEventType());
            }
            reconcileService.logEvent(event.getEventId(), event.getEventType(),
                    event.getScheduleId(), "SUCCESS", null, null);
        } catch (ClassroomBizException e) {
            if (e.getCode() == ErrorCodes.EVENT_STALE_VERSION) {
                reconcileService.logEvent(event.getEventId(), event.getEventType(),
                        event.getScheduleId(), "SKIPPED", "stale_version", null);
            } else {
                reconcileService.logEvent(event.getEventId(), event.getEventType(),
                        event.getScheduleId(), "FAILED", null, e.getMessage());
            }
        } catch (Exception e) {
            log.error("事件处理失败: eventId={}", event.getEventId(), e);
            reconcileService.logEvent(event.getEventId(), event.getEventType(),
                    event.getScheduleId(), "FAILED", null, e.getMessage());
        }
    }

    public Classroom getSchedule(String scheduleId) {
        return classroomService.getById(scheduleId);
    }

    private void handleCreated(ScheduleEventReq event) {
        Classroom existing = classroomMapper.selectById(event.getScheduleId());
        if (existing != null) {
            log.info("课堂已存在，跳过创建: scheduleId={}", event.getScheduleId());
            return;
        }
        Classroom c = new Classroom();
        c.setScheduleId(event.getScheduleId());
        c.setCourseId(event.getCourseId());
        c.setCourseName(event.getCourseName());
        c.setTeacherId(event.getTeacher().getUserId());
        c.setTeacherName(event.getTeacher().getName());
        c.setStartTime(event.getStartTime());
        c.setEndTime(event.getEndTime());
        c.setDuration(event.getDuration() != null ? event.getDuration() : 60);
        c.setStatus("SCHEDULED");
        c.setAutoStart(true);
        c.setVersion(event.getVersion() != null ? event.getVersion() : 1);
        c.setTenantId(0L);
        c.setCreatedAt(LocalDateTime.now());
        c.setUpdatedAt(LocalDateTime.now());
        classroomMapper.insert(c);

        if (event.getStudents() != null) {
            for (ScheduleEventReq.StudentInfo s : event.getStudents()) {
                Membership m = new Membership();
                m.setScheduleId(event.getScheduleId());
                m.setUserId(s.getUserId());
                m.setRole("student");
                m.setDisplayName(s.getName());
                m.setOnlineState("OFFLINE");
                m.setKicked(false);
                membershipMapper.insert(m);
            }
        }
        Membership teacher = new Membership();
        teacher.setScheduleId(event.getScheduleId());
        teacher.setUserId(event.getTeacher().getUserId());
        teacher.setRole("teacher");
        teacher.setDisplayName(event.getTeacher().getName());
        teacher.setOnlineState("OFFLINE");
        teacher.setKicked(false);
        membershipMapper.insert(teacher);

        log.info("课堂创建完成: scheduleId={}, students={}", event.getScheduleId(),
                event.getStudents() != null ? event.getStudents().size() : 0);
    }

    private void handleUpdated(ScheduleEventReq event) {
        Classroom c = classroomMapper.selectById(event.getScheduleId());
        if (c == null) {
            handleCreated(event);
            return;
        }
        if (event.getVersion() != null && c.getVersion() != null && event.getVersion() < c.getVersion()) {
            throw new ClassroomBizException(ErrorCodes.EVENT_STALE_VERSION,
                    "旧版本事件已忽略: received=" + event.getVersion() + ", current=" + c.getVersion());
        }
        c.setCourseName(event.getCourseName());
        c.setStartTime(event.getStartTime());
        c.setEndTime(event.getEndTime());
        if (event.getDuration() != null) c.setDuration(event.getDuration());
        if (event.getVersion() != null) c.setVersion(event.getVersion());
        c.setUpdatedAt(LocalDateTime.now());
        classroomMapper.updateById(c);
        log.info("课堂更新完成: scheduleId={}, version={}", event.getScheduleId(), event.getVersion());
    }

    private void handleCancelled(ScheduleEventReq event) {
        classroomService.cancel(event.getScheduleId());
        log.info("课堂取消完成: scheduleId={}", event.getScheduleId());
    }
}