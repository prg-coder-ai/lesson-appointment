package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.Classroom;
import com.classroom.security.AuthContext;
import com.classroom.service.ClassroomService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 运营后台接口（F8）。
 */
@RestController
@RequestMapping("/api/v1/admin/classrooms")
public class AdminConsoleController {

    private final ClassroomService classroomService;

    public AdminConsoleController(ClassroomService classroomService) {
        this.classroomService = classroomService;
    }

    @GetMapping("/monitor")
    public Result<List<Classroom>> monitor(@RequestParam(required = false) String status) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可访问运营后台");
        }
        Long tenantId = AuthContext.isPlatformAdmin() ? null : AuthContext.currentTenantId();
        return Result.ok(classroomService.listByStatus(status != null ? status : "LIVE", tenantId));
    }

    @PostMapping("/{scheduleId}/end")
    public Result<Void> remoteEnd(@PathVariable String scheduleId) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可远程结束课堂");
        }
        classroomService.endClass(scheduleId);
        return Result.success();
    }
}