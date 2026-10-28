package com.classroom.event;

import com.classroom.common.ClassroomKey;
import com.classroom.common.ErrorCodes;
import com.classroom.dto.ScheduleEventReq;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.entity.Classroom;
import com.classroom.exception.ClassroomBizException;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.MembershipMapper;
import com.classroom.entity.Membership;
import com.classroom.service.AttendanceService;
import com.classroom.service.ClassroomService;
import com.classroom.service.ReconcileService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

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
    private final AttendanceService attendanceService;
    private final ReconcileService reconcileService;

    public ScheduleEventConsumer(ClassroomMapper classroomMapper,
                                 MembershipMapper membershipMapper,
                                 ClassroomService classroomService,
                                 AttendanceService attendanceService,
                                 ReconcileService reconcileService) {
        this.classroomMapper = classroomMapper;
        this.membershipMapper = membershipMapper;
        this.classroomService = classroomService;
        this.attendanceService = attendanceService;
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
        // 课堂标识按课次级编码：一个排期展开 N 个课次，各建各的课堂。
        // 第 1 课次沿用裸 scheduleId（兼容历史数据），第 2 次起为 scheduleId~N。
        String classroomId = ClassroomKey.of(event.getScheduleId(), event.getClassIndex());
        Classroom existing = classroomMapper.selectById(classroomId);
        if (existing != null) {
            log.info("课堂已存在，跳过创建: scheduleId={}", event.getScheduleId());
            return;
        }
        Classroom c = new Classroom();
        c.setScheduleId(classroomId);
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
        c.setConsumptionVersion(0);
        // 租户必须从事件载荷取：修复前写死 0L，导致租户管理员按 tenant_id 查监控列表恒空，
        // 且课堂归属校验拿不到真实租户。载荷缺失才回退 0（平台级/未绑定租户）。
        c.setTenantId(event.getTenantId() != null ? event.getTenantId() : 0L);
        c.setCreatedAt(LocalDateTime.now());
        c.setUpdatedAt(LocalDateTime.now());
        classroomMapper.insert(c);

        if (event.getStudents() != null) {
            for (ScheduleEventReq.StudentInfo s : event.getStudents()) {
                Membership m = new Membership();
                m.setScheduleId(classroomId);
                m.setUserId(s.getUserId());
                m.setRole("student");
                m.setDisplayName(s.getName());
                m.setOnlineState("OFFLINE");
                m.setKicked(false);
                membershipMapper.insert(m);
            }
        }
        Membership teacher = new Membership();
        teacher.setScheduleId(classroomId);
        teacher.setUserId(event.getTeacher().getUserId());
        teacher.setRole("teacher");
        teacher.setDisplayName(event.getTeacher().getName());
        teacher.setOnlineState("OFFLINE");
        teacher.setKicked(false);
        membershipMapper.insert(teacher);

        // 出勤名单初始化：先全员 ABSENT，enter 时才升级为 PRESENT/LATE。
        // 不预置就统计不出「一次都没进课堂」的缺席学生。
        attendanceService.initRoster(classroomId, studentIds(event.getStudents()));

        log.info("课堂创建完成: scheduleId={}, tenantId={}, students={}", event.getScheduleId(),
                c.getTenantId(),
                event.getStudents() != null ? event.getStudents().size() : 0);
    }

    private void handleUpdated(ScheduleEventReq event) {
        Classroom c = classroomMapper.selectById(ClassroomKey.of(event.getScheduleId(), event.getClassIndex()));
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
        // 名单可能变化：补入新增学生（含出勤行 ABSENT）。
        // 只增不删——被移出名单的学生若已有出勤/课时记录，删掉等于销毁账务证据。
        syncRoster(event);
        log.info("课堂更新完成: scheduleId={}, version={}", event.getScheduleId(), event.getVersion());
    }

    /**
     * 增量同步学生名单：为新出现的学生补 membership + 出勤行（ABSENT）。
     * 已存在的跳过，保证重投同版本事件不会把已签到的人打回缺席。
     */
    private void syncRoster(ScheduleEventReq event) {
        if (event.getStudents() == null || event.getStudents().isEmpty()) return;
        // 课次级标识：名单属于「这一课次」的课堂，不能落到排期级
        String classroomId = ClassroomKey.of(event.getScheduleId(), event.getClassIndex());
        List<String> added = new ArrayList<>();
        for (ScheduleEventReq.StudentInfo s : event.getStudents()) {
            if (s == null || s.getUserId() == null || s.getUserId().isBlank()) continue;
            if (membershipExists(classroomId, s.getUserId())) continue;
            Membership m = new Membership();
            m.setScheduleId(classroomId);
            m.setUserId(s.getUserId());
            m.setRole("student");
            m.setDisplayName(s.getName());
            m.setOnlineState("OFFLINE");
            m.setKicked(false);
            membershipMapper.insert(m);
            added.add(s.getUserId());
        }
        if (!added.isEmpty()) {
            attendanceService.initRoster(classroomId, added);
            log.info("名单增量同步: classroomId={}, 新增学生={}", classroomId, added.size());
        }
    }

    private List<String> studentIds(List<ScheduleEventReq.StudentInfo> students) {
        List<String> ids = new ArrayList<>();
        if (students == null) return ids;
        for (ScheduleEventReq.StudentInfo s : students) {
            if (s != null && s.getUserId() != null && !s.getUserId().isBlank()) {
                ids.add(s.getUserId());
            }
        }
        return ids;
    }

    /** 成员行是否已存在（Membership 是复合主键，MP 的 selectById 不支持，必须走条件查询） */
    private boolean membershipExists(String scheduleId, String userId) {
        LambdaQueryWrapper<Membership> w = new LambdaQueryWrapper<>();
        w.eq(Membership::getScheduleId, scheduleId).eq(Membership::getUserId, userId);
        return membershipMapper.selectCount(w) > 0;
    }

    private void handleCancelled(ScheduleEventReq event) {
        classroomService.cancel(ClassroomKey.of(event.getScheduleId(), event.getClassIndex()));
        log.info("课堂取消完成: scheduleId={}", event.getScheduleId());
    }
}