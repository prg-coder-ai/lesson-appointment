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
import com.classroom.service.ClassroomService;
import com.classroom.service.MembershipService;
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

    /** 进课堂限流：同一用户每分钟最多进几次（刷新/重连会打到这里，阈值不能太小） */
    @Value("${classroom.rate-limit.enter-per-minute:30}")
    private int enterPerMinute;

    public ClassroomController(ClassroomService classroomService,
                               MembershipService membershipService,
                               AttendanceService attendanceService,
                               ClassroomAccessGuard accessGuard,
                               CallbackService callbackService,
                               RateLimitService rateLimit) {
        this.classroomService = classroomService;
        this.membershipService = membershipService;
        this.attendanceService = attendanceService;
        this.accessGuard = accessGuard;
        this.callbackService = callbackService;
        this.rateLimit = rateLimit;
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
        return Result.success();
    }

    @PostMapping("/end")
    public Result<Void> end(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可下课");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        classroomService.endClass(scheduleId);
        return Result.success();
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
