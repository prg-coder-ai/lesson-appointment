package com.classroom.controller;

import com.classroom.common.ErrorCodes;
import com.classroom.common.Result;
import com.classroom.dto.EnterClassroomReq;
import com.classroom.entity.Classroom;
import com.classroom.entity.Membership;
import com.classroom.guard.RateLimitService;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.AttendanceService;
import com.classroom.service.CallbackService;
import com.classroom.service.ClassroomPublishGuard;
import com.classroom.service.ClassroomService;
import com.classroom.service.MembershipService;
import com.classroom.ws.WsRoomRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：课堂接入/控制（F1, F3）。
 *
 * <p>每个入口都先过 {@link ClassroomAccessGuard}：修复前这些接口只校验「是否登录」，
 * 任何登录用户拿到 scheduleId 就能读课堂，甚至 {@code enter} 把自己塞进名单并签到。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}")
public class ClassroomController {

    private final ClassroomService classroomService;
    private final MembershipService membershipService;
    private final AttendanceService attendanceService;
    private final ClassroomAccessGuard accessGuard;
    private final CallbackService callbackService;
    private final RateLimitService rateLimit;
    private final WsRoomRegistry wsRegistry;
    private final ClassroomPublishGuard publishGuard;

    /** 进课堂限流：同一用户每分钟最多进几次（刷新/重连会打到这里，阈值不能太小） */
    @Value("${classroom.rate-limit.enter-per-minute:30}")
    private int enterPerMinute;

    public ClassroomController(ClassroomService classroomService,
                               MembershipService membershipService,
                               AttendanceService attendanceService,
                               ClassroomAccessGuard accessGuard,
                               CallbackService callbackService,
                               RateLimitService rateLimit,
                               WsRoomRegistry wsRegistry,
                               ClassroomPublishGuard publishGuard) {
        this.classroomService = classroomService;
        this.membershipService = membershipService;
        this.attendanceService = attendanceService;
        this.accessGuard = accessGuard;
        this.callbackService = callbackService;
        this.rateLimit = rateLimit;
        this.wsRegistry = wsRegistry;
        this.publishGuard = publishGuard;
    }

    @GetMapping("/status")
    public Result<Classroom> getStatus(@PathVariable String scheduleId) {
        return Result.ok(accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole()));
    }

    @PostMapping("/enter")
    public Result<Void> enter(@PathVariable String scheduleId, @RequestBody(required = false) EnterClassroomReq req) {
        String userId = AuthContext.currentUserId();
        String role = AuthContext.currentRole();
        // 用户维度限流（包4B）：刷新/重连正常，但脚本刷 enter 会污染在线态与出勤区间
        if (!rateLimit.tryAcquire("enter", userId, enterPerMinute, 60)) {
            return Result.fail(ErrorCodes.RATE_LIMITED, "进入课堂过于频繁，请稍后再试");
        }
        // 名单校验在 guard 内完成：非名单成员直接 40301，不会走到 join 去新建 membership 行
        Classroom c = accessGuard.assertAccess(scheduleId, userId, role);
        String displayName = (req != null && req.getDisplayName() != null) ? req.getDisplayName() : userId;
        membershipService.join(scheduleId, userId, role, displayName);
        if ("student".equals(role)) {
            attendanceService.checkIn(scheduleId, userId, c.getStartTime());
            // 签到事件回流预约侧，让 appointment.status 立刻显示「已签到」。
            // 异步且失败忽略：签到标记是展示态，真正的出勤结论由课后收尾的回流裁定。
            callbackService.sendJoinEvent(scheduleId, userId, java.time.LocalDateTime.now());
        }
        return Result.success();
    }

    @PostMapping("/leave")
    public Result<Void> leave(@PathVariable String scheduleId) {
        String userId = AuthContext.currentUserId();
        accessGuard.assertAccess(scheduleId, userId, AuthContext.currentRole());
        membershipService.leave(scheduleId, userId, "active");
        attendanceService.checkOut(scheduleId, userId);
        return Result.success();
    }

    @PostMapping("/start")
    public Result<Void> start(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可开课");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        classroomService.startClass(scheduleId);
        broadcastState(scheduleId, "LIVE");
        return Result.success();
    }

    /**
     * 暂停：LIVE → PAUSED。期间教师端与学生端都不允许发布音视频/白板/聊天
     * （{@link ClassroomPublishGuard} 在 WS 入口权威拦截）。
     */
    @PostMapping("/pause")
    public Result<Void> pause(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可暂停课堂");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        classroomService.pauseClass(scheduleId);
        broadcastState(scheduleId, "PAUSED");
        return Result.success();
    }

    /** 恢复：PAUSED → LIVE（不重建媒体房间、不重写 actualStart） */
    @PostMapping("/resume")
    public Result<Void> resume(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可恢复课堂");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        classroomService.resumeClass(scheduleId);
        broadcastState(scheduleId, "LIVE");
        return Result.success();
    }

    /**
     * 教师端「下课」。
     *
     * <p><b>提前下课转暂停（2026-11-17）</b>：若当前时间早于计划上课时间 {@code start_time}，
     * 「下课」不结束课堂（不触发出勤收尾与课时回流），而是转为暂停——常见场景是教师提前进课堂
     * 调试设备后想离开，此时下课会把一堂没真实发生的课结算掉。暂停不重建房间、不重写
     * {@code actualStart}，教师稍后回来点「进行中」即可恢复。
     *
     * <p>判断放在 Controller 这层（教师端入口），<b>不动</b> {@link ClassroomService#endClass}：
     * 管理端强制结束（AdminConsoleController）、自动下课、教师掉线结课仍走原入口，保持
     * 「管理员能无条件关掉任意课堂」的运维能力。
     *
     * <p>返回值带 {@code action} 字段：{@code paused_early}=已转暂停，前端据此改提示文案、
     * 且不执行「离开课堂」；缺省（正常下课）前端按原流程处理。
     */
    @PostMapping("/end")
    public Result<java.util.Map<String, Object>> end(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可下课");
        }
        Classroom c = accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        java.util.Map<String, Object> resp = new java.util.LinkedHashMap<>();
        String status = c.getStatus();

        // 尚未到计划上课时间：下课改成暂停（已暂停则幂等，不重复流转）
        if (c.getStartTime() != null && java.time.LocalDateTime.now().isBefore(c.getStartTime())
                && ("LIVE".equals(status) || "PAUSED".equals(status))) {
            if ("LIVE".equals(status)) {
                classroomService.pauseClass(scheduleId);
            }
            broadcastState(scheduleId, "PAUSED");
            resp.put("action", "paused_early");
            resp.put("status", "PAUSED");
            return Result.ok(resp);
        }

        classroomService.endClass(scheduleId);
        broadcastState(scheduleId, "CLOSED");
        resp.put("action", "closed");
        resp.put("status", "CLOSED");
        return Result.ok(resp);
    }

    /** 状态流转后广播权威状态，前端据此同步状态徽标与发布门禁（控制类消息，门禁放行） */
    private void broadcastState(String scheduleId, String status) {
        publishGuard.invalidate(scheduleId);
        wsRegistry.broadcastSignal(scheduleId,
                "{\"type\":\"class:state\",\"status\":\"" + status + "\"}");
    }

    @PostMapping("/members/{userId}/kick")
    public Result<Void> kick(@PathVariable String scheduleId, @PathVariable String userId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可移出成员");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        membershipService.kick(scheduleId, userId);
        return Result.success();
    }

    @GetMapping("/members")
    public Result<List<Membership>> members(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(membershipService.listBySchedule(scheduleId));
    }
}
