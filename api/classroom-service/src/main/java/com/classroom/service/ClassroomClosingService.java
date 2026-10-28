package com.classroom.service;

import com.classroom.dto.AttendanceCallbackReq;
import com.classroom.entity.Attendance;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.mapper.ClassroomMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 下课收尾编排（需求 F2-05 / F2-06 / F7-01）。
 *
 * <p>修复前 {@code endClass} 只做了「状态改 CLOSED + 记 actualEnd」两件事，
 * 出勤名单不生成、成员在线状态不清、课时消耗明细不产出、回调不发出——
 * 这正是 {@code sendAttendanceCallback} 零调用者的根因：没有收尾链路可以挂。
 *
 * <p>现在收尾固定五件事，缺一条链路就断：
 * <ol>
 *   <li>闭合所有未结束的在线区间（否则「最后一段」会被算到以后某次查询）；</li>
 *   <li>重算每位学生的有效时长（区间累加 + 抖动合并 + 课时封顶）；</li>
 *   <li>把过程态 LEFT/REJOINED 归一为最终出勤结论 ABSENT/PRESENT/LATE；</li>
 *   <li>成员在线状态全部置 OFFLINE；</li>
 *   <li>课时消耗版本号 +1 并组装出勤名单，异步回流预约系统。</li>
 * </ol>
 *
 * <p><b>事务边界</b>：1–4 在同一个事务里（{@link TransactionTemplate} 显式界定），
 * 回调在<b>事务提交之后</b>才发。若在事务内发，一旦后续回滚，
 * 预约系统已经落库了一份不存在的课堂出勤——比不回流更难查。
 */
@Slf4j
@Service
public class ClassroomClosingService {

    private final ClassroomMapper classroomMapper;
    private final AttendanceService attendanceService;
    private final MembershipService membershipService;
    private final CallbackService callbackService;
    private final TransactionTemplate transactionTemplate;

    public ClassroomClosingService(ClassroomMapper classroomMapper,
                                   AttendanceService attendanceService,
                                   MembershipService membershipService,
                                   CallbackService callbackService,
                                   PlatformTransactionManager transactionManager) {
        this.classroomMapper = classroomMapper;
        this.attendanceService = attendanceService;
        this.membershipService = membershipService;
        this.callbackService = callbackService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * 课堂已流转为 CLOSED 后执行收尾并回流。
     *
     * @param closeAt 下课时间（与 classroom.actual_end 一致）
     */
    public void closeAfterEnd(String scheduleId, LocalDateTime closeAt) {
        AttendanceCallbackReq payload;
        try {
            payload = transactionTemplate.execute(status -> doClose(scheduleId, closeAt));
        } catch (Exception e) {
            // 收尾失败不能让「下课」这个动作回滚：状态已是 CLOSED，人已经走了。
            // 留 ERROR 供人工补跑（重放走同一入口即可，幂等：区间已闭合、名单按结论覆盖）。
            log.error("下课收尾失败，需人工补跑: scheduleId={}", scheduleId, e);
            return;
        }
        if (payload == null) return;
        // 事务已提交，此时回流才有意义
        callbackService.sendAttendanceCallback(scheduleId, payload);
        log.info("下课收尾完成并已发起出勤回流: scheduleId={}, version={}, 明细={}",
                scheduleId, payload.getConsumptionVersion(),
                payload.getItems() == null ? 0 : payload.getItems().size());
    }

    private AttendanceCallbackReq doClose(String scheduleId, LocalDateTime closeAt) {
        Classroom c = classroomMapper.selectById(scheduleId);
        if (c == null) {
            log.warn("收尾时课堂不存在，跳过: scheduleId={}", scheduleId);
            return null;
        }

        // 1–3. 闭合区间 + 重算有效时长 + 归一最终出勤结论
        List<Attendance> roster = attendanceService.finalizeSchedule(scheduleId, closeAt);

        // 4. 成员在线状态全部置离线
        int offline = membershipService.closeAllOnline(scheduleId);

        // 5. 课时消耗版本号 +1（幂等重跑会得到更大的版本，预约侧按版本丢弃旧报文）
        int nextVersion = (c.getConsumptionVersion() == null ? 0 : c.getConsumptionVersion()) + 1;
        Classroom versionUpdate = new Classroom();
        versionUpdate.setScheduleId(scheduleId);
        versionUpdate.setConsumptionVersion(nextVersion);
        versionUpdate.setActualEnd(closeAt);
        classroomMapper.updateById(versionUpdate);

        AttendanceCallbackReq req = new AttendanceCallbackReq();
        req.setScheduleId(scheduleId);
        req.setCourseId(c.getCourseId());
        req.setClassroomStatus("CLOSED");
        req.setActualStart(c.getActualStart());
        req.setActualEnd(closeAt);
        req.setConsumptionVersion(nextVersion);
        req.setItems(buildItems(scheduleId, roster));

        log.info("下课收尾: scheduleId={}, 出勤明细={}, 置离线成员={}, version={}",
                scheduleId, req.getItems().size(), offline, nextVersion);
        return req;
    }

    private List<AttendanceCallbackReq.AttendanceItem> buildItems(String scheduleId, List<Attendance> roster) {
        List<AttendanceCallbackReq.AttendanceItem> items = new ArrayList<>();
        if (roster == null) return items;
        for (Attendance a : roster) {
            AttendanceCallbackReq.AttendanceItem item = new AttendanceCallbackReq.AttendanceItem();
            item.setUserId(a.getUserId());
            item.setRole(resolveRole(scheduleId, a.getUserId()));
            item.setAttendanceStatus(a.getAttendanceStatus());
            item.setCheckInAt(a.getCheckInAt());
            item.setCheckOutAt(a.getCheckOutAt());
            item.setEffectiveMinutes(a.getEffectiveMinutes() == null ? 0 : a.getEffectiveMinutes());
            items.add(item);
        }
        return items;
    }

    /**
     * 出勤表本身不存角色（只有学生签到），角色从成员表取。
     * 成员行丢失时按 student 兜底——出勤名单的主体是学生，教师不参与课时核算。
     */
    private String resolveRole(String scheduleId, String userId) {
        Membership m = membershipService.getOne(scheduleId, userId);
        return (m != null && m.getRole() != null) ? m.getRole() : "student";
    }
}
