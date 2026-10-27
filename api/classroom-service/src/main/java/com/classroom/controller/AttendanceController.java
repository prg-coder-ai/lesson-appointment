package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.Attendance;
import com.classroom.security.AuthContext;
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

    public AttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @GetMapping
    public Result<List<Attendance>> list(@PathVariable String scheduleId) {
        return Result.ok(attendanceService.listBySchedule(scheduleId));
    }

    @PostMapping("/manual-adjust")
    public Result<Void> manualAdjust(@PathVariable String scheduleId,
                                      @RequestParam String userId,
                                      @RequestParam String reason) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可手动补签");
        }
        attendanceService.manualAdjust(scheduleId, userId, reason);
        return Result.success();
    }
}