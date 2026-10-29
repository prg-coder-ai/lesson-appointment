package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.AttendanceHistoryVO;
import com.classroom.security.AuthContext;
import com.classroom.service.AttendanceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 学生维度出勤查询（F2-07）。
 *
 * <p>与 {@code /classrooms/{sid}/attendance}（按课堂、需成员校验）不同，本端点按<b>当前登录用户</b>
 * 跨课堂聚合历史出勤，任何人只能查自己的，无需传 userId 参数（避免越权查他人）。
 */
@RestController
@RequestMapping("/api/v1/attendance")
public class UserAttendanceController {

    private final AttendanceService attendanceService;

    public UserAttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @GetMapping("/history")
    public Result<List<AttendanceHistoryVO>> history() {
        String userId = AuthContext.currentUserId();
        return Result.ok(attendanceService.listByUser(userId));
    }
}
