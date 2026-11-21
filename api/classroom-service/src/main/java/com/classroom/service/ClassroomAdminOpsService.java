package com.classroom.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.classroom.common.ClassroomKey;
import com.classroom.common.ErrorCodes;
import com.classroom.dto.CreateTempClassroomReq;
import com.classroom.dto.AddMembersReq;
import com.classroom.dto.ScheduleEventReq;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.event.ScheduleEventConsumer;
import com.classroom.exception.ClassroomBizException;
import com.classroom.mapper.ClassroomMapper;
import com.classroom.mapper.MembershipMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 管理员应急操作：临时建课、临场加学员（B1/B2）。
 *
 * <p><b>为什么不直接 insert classroom</b>：课堂的生命周期不只是一行记录——
 * 还要建教师/学生 membership、初始化出勤名单（全员 ABSENT）、并让后续的改期/取消事件能对上。
 * 这些逻辑都在 {@link ScheduleEventConsumer#consume} 里，绕过去就会造出「有课堂但没人、没出勤、
 * 取消事件找不到」的孤儿数据。所以这里**合成一条 created 事件**复用同一条链路，
 * 与运营台手工重放报文走的是完全相同的代码路径。
 *
 * <p><b>与正式排期的区别</b>（调用方必须知道）：临时课堂的 scheduleId 是这里生成的 UUID，
 * 预约侧没有对应 {@code course_schedule} 记录。后果：
 * <ul>
 *   <li>学生端「我的课堂」看不到（那份列表按 booking 取，见 student-myClassroom.js）；</li>
 *   <li>课时不结算、学情报表不收（出勤回流要查 course_schedule，查不到会判永久失败）；</li>
 *   <li>只能靠管理员发链接进课堂。</li>
 * </ul>
 * 要「算课时、进报表」的课，仍然必须走正常排期建课。
 */
@Slf4j
@Service
public class ClassroomAdminOpsService {

    /** 临时课默认时长（分钟），与排期事件里 duration 的默认口径一致 */
    private static final int DEFAULT_DURATION_MINUTES = 60;

    private final ScheduleEventConsumer eventConsumer;
    private final ClassroomMapper classroomMapper;
    private final MembershipMapper membershipMapper;
    private final AttendanceService attendanceService;

    public ClassroomAdminOpsService(ScheduleEventConsumer eventConsumer,
                                    ClassroomMapper classroomMapper,
                                    MembershipMapper membershipMapper,
                                    AttendanceService attendanceService) {
        this.eventConsumer = eventConsumer;
        this.classroomMapper = classroomMapper;
        this.membershipMapper = membershipMapper;
        this.attendanceService = attendanceService;
    }

    /**
     * 创建一节临时课堂。
     *
     * @param operatorTenantId 调用者的租户（平台管理员为 0 或 null），请求未指定租户时用它兜底
     */
    public Map<String, Object> createTempClassroom(CreateTempClassroomReq req, Long operatorTenantId) {
        if (req == null || isBlank(req.getTeacherId())) {
            throw new ClassroomBizException(400, "teacherId 不能为空：课堂要按教师本人判定准入");
        }
        int duration = (req.getDuration() != null && req.getDuration() > 0)
                ? req.getDuration() : DEFAULT_DURATION_MINUTES;
        // 毫秒截断：前端 datetime-local 常带秒，带纳秒的 now() 会让展示与比较都出现奇怪的小数
        LocalDateTime start = req.getStartTime() != null
                ? req.getStartTime() : LocalDateTime.now().withNano(0);
        LocalDateTime end = req.getEndTime() != null
                ? req.getEndTime() : start.plusMinutes(duration);
        if (!end.isAfter(start)) {
            throw new ClassroomBizException(400, "结束时间必须晚于开始时间");
        }
        Long tenantId = req.getTenantId() != null ? req.getTenantId()
                : (operatorTenantId != null ? operatorTenantId : 0L);

        String scheduleId = UUID.randomUUID().toString().replace("-", "");
        ScheduleEventReq event = new ScheduleEventReq();
        // eventId 与 scheduleId 绑定：同一节课重复点「创建」不会因为 eventId 冲突被幂等挡掉，
        // 而真正重复投递同一节课时又天然唯一（scheduleId 每次都新生成，所以实际不会重复）。
        event.setEventId("tmp-" + scheduleId);
        event.setEventType("created");
        event.setScheduleId(scheduleId);
        // 第 1 课次沿用裸 id（见 ClassroomKey.of），临时课不存在多课次概念
        event.setClassIndex(1);
        event.setTenantId(tenantId);
        event.setCourseId("tmp-" + scheduleId);
        event.setCourseName(isBlank(req.getCourseName()) ? "临时课堂" : req.getCourseName().trim());

        ScheduleEventReq.TeacherInfo teacher = new ScheduleEventReq.TeacherInfo();
        teacher.setUserId(req.getTeacherId().trim());
        teacher.setName(isBlank(req.getTeacherName()) ? req.getTeacherId().trim() : req.getTeacherName().trim());
        event.setTeacher(teacher);

        List<ScheduleEventReq.StudentInfo> students = new ArrayList<>();
        if (req.getStudents() != null) {
            for (CreateTempClassroomReq.StudentItem s : req.getStudents()) {
                if (s == null || isBlank(s.getUserId())) continue;
                ScheduleEventReq.StudentInfo si = new ScheduleEventReq.StudentInfo();
                si.setUserId(s.getUserId().trim());
                si.setName(isBlank(s.getName()) ? s.getUserId().trim() : s.getName().trim());
                students.add(si);
            }
        }
        event.setStudents(students);
        event.setStartTime(start);
        event.setEndTime(end);
        event.setDuration(duration);
        event.setVersion(1);

        eventConsumer.consume(event);

        String classroomId = ClassroomKey.of(scheduleId, 1);
        Classroom created = classroomMapper.selectById(classroomId);
        if (created == null) {
            // 正常情况下不会走到这里：事件消费是同步的。真出现说明消费链路抛了异常或被幂等挡掉。
            throw new ClassroomBizException(500, "课堂创建失败，请查看 classroom-service 日志");
        }
        log.warn("管理员创建临时课堂: scheduleId={}, tenantId={}, teacher={}, students={}, {} ~ {}",
                scheduleId, tenantId, teacher.getUserId(), students.size(), start, end);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scheduleId", scheduleId);
        out.put("classroomId", created.getScheduleId());
        out.put("courseName", created.getCourseName());
        out.put("teacherId", created.getTeacherId());
        out.put("status", created.getStatus());
        out.put("startTime", created.getStartTime());
        out.put("endTime", created.getEndTime());
        out.put("duration", created.getDuration());
        out.put("tenantId", created.getTenantId());
        out.put("studentCount", students.size());
        // 链接由前端按 pageUrl 拼（会带上 tCode），后端不猜前端域名的部署形态
        return out;
    }

    /**
     * 给指定课堂补学员：写 membership + 出勤行（ABSENT）。
     *
     * <p>幂等：已存在的成员直接跳过（不覆盖在线态、不重置出勤），方便应急时反复点。
     *
     * <p>为什么不用 {@code MembershipService.join}：它会把 {@code online_state} 置成 ONLINE，
     * 人还没来就在名单里显示在线，人数统计会虚高。这里按"预置名单"语义写 OFFLINE。
     */
    public Map<String, Object> addMembers(String scheduleId, AddMembersReq req, Long operatorTenantId) {
        if (isBlank(scheduleId)) {
            throw new ClassroomBizException(400, "scheduleId 不能为空");
        }
        Classroom classroom = classroomMapper.selectById(scheduleId);
        if (classroom == null) {
            throw new ClassroomBizException(ErrorCodes.CLASSROOM_NOT_FOUND, "课堂不存在：" + scheduleId);
        }
        // 跨租户防护：平台管理员（tenant 0/null）可跨，租户管理员只能动自己租户的课堂
        if (operatorTenantId != null && operatorTenantId > 0
                && classroom.getTenantId() != null && classroom.getTenantId() > 0
                && !operatorTenantId.equals(classroom.getTenantId())) {
            throw new ClassroomBizException(403, "无权操作其他租户的课堂");
        }
        if (req == null || req.getStudents() == null || req.getStudents().isEmpty()) {
            throw new ClassroomBizException(400, "students 不能为空");
        }

        List<String> added = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        for (CreateTempClassroomReq.StudentItem s : req.getStudents()) {
            if (s == null || isBlank(s.getUserId())) continue;
            String userId = s.getUserId().trim();
            if (membershipExists(scheduleId, userId)) {
                skipped.add(userId);
                continue;
            }
            Membership m = new Membership();
            m.setScheduleId(scheduleId);
            m.setUserId(userId);
            m.setRole("student");
            m.setDisplayName(isBlank(s.getName()) ? userId : s.getName().trim());
            m.setOnlineState("OFFLINE");
            m.setKicked(false);
            membershipMapper.insert(m);
            added.add(userId);
        }
        // 出勤行必须一起补：没有行的话，这个人进课堂才签到、没进就永远不进统计，
        // 「应到/缺勤」会漏掉他（initRoster 自带已存在判断，可反复调用）
        if (!added.isEmpty()) {
            attendanceService.initRoster(scheduleId, added);
        }
        log.warn("管理员临时加学员: scheduleId={}, added={}, skipped={}, note={}",
                scheduleId, added.size(), skipped.size(), req.getNote());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scheduleId", scheduleId);
        out.put("added", added);
        out.put("skipped", skipped);
        out.put("addedCount", added.size());
        out.put("skippedCount", skipped.size());
        return out;
    }

    private boolean membershipExists(String scheduleId, String userId) {
        LambdaQueryWrapper<Membership> w = new LambdaQueryWrapper<>();
        w.eq(Membership::getScheduleId, scheduleId).eq(Membership::getUserId, userId);
        return membershipMapper.selectCount(w) > 0;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
