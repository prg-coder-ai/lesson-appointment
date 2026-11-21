package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.ManualAdjustReq;
import com.classroom.entity.Attendance;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.AttendanceService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：签到/出勤查询（F2）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/attendance")
public class AttendanceController {

    private final AttendanceService attendanceService;
    private final ClassroomAccessGuard accessGuard;

    public AttendanceController(AttendanceService attendanceService,
                                ClassroomAccessGuard accessGuard) {
        this.attendanceService = attendanceService;
        this.accessGuard = accessGuard;
    }

    @GetMapping
    public Result<List<Attendance>> list(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(attendanceService.listBySchedule(scheduleId));
    }

    @PostMapping("/manual-adjust")
    public Result<Void> manualAdjust(@PathVariable String scheduleId,
                                      @RequestBody ManualAdjustReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可手动补签");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        attendanceService.manualAdjust(scheduleId, req.getUserId(), req.getReason());
        return Result.success();
    }
}
