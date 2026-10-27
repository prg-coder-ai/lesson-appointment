package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.EnterClassroomReq;
import com.classroom.entity.Classroom;
import com.classroom.security.AuthContext;
import com.classroom.service.ClassroomService;
import com.classroom.service.MembershipService;
import com.classroom.service.AttendanceService;
import org.springframework.web.bind.annotation.*;

/**
 * 客户端接口：课堂接入/控制（F1, F3）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}")
public class ClassroomController {

    private final ClassroomService classroomService;
    private final MembershipService membershipService;
    private final AttendanceService attendanceService;

    public ClassroomController(ClassroomService classroomService,
                               MembershipService membershipService,
                               AttendanceService attendanceService) {
        this.classroomService = classroomService;
        this.membershipService = membershipService;
        this.attendanceService = attendanceService;
    }

    @GetMapping("/status")
    public Result<Classroom> getStatus(@PathVariable String scheduleId) {
        return Result.ok(classroomService.getById(scheduleId));
    }

    @PostMapping("/enter")
    public Result<Void> enter(@PathVariable String scheduleId, @RequestBody(required = false) EnterClassroomReq req) {
        Classroom c = classroomService.getById(scheduleId);
        String userId = AuthContext.currentUserId();
        String role = AuthContext.currentRole();
        String displayName = (req != null && req.getDisplayName() != null) ? req.getDisplayName() : userId;
        membershipService.join(scheduleId, userId, role, displayName);
        if ("student".equals(role)) {
            attendanceService.checkIn(scheduleId, userId, c.getStartTime());
        }
        return Result.success();
    }

    @PostMapping("/leave")
    public Result<Void> leave(@PathVariable String scheduleId) {
        String userId = AuthContext.currentUserId();
        membershipService.leave(scheduleId, userId, "active");
        attendanceService.checkOut(scheduleId, userId);
        return Result.success();
    }

    @PostMapping("/start")
    public Result<Void> start(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可开课");
        }
        classroomService.startClass(scheduleId);
        return Result.success();
    }

    @PostMapping("/end")
    public Result<Void> end(@PathVariable String scheduleId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可下课");
        }
        classroomService.endClass(scheduleId);
        return Result.success();
    }

    @PostMapping("/members/{userId}/kick")
    public Result<Void> kick(@PathVariable String scheduleId, @PathVariable String userId) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可移出成员");
        }
        membershipService.kick(scheduleId, userId);
        return Result.success();
    }
}