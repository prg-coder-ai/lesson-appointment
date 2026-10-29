package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.MaterialUploadReq;
import com.classroom.dto.TurnPageReq;
import com.classroom.entity.Material;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.MaterialService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：讲稿上传/拉取（F4-04~06）。
 *
 * <p>上传/翻页是教师动作，须过「本堂课教师」校验；学生只读（拉列表）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/materials")
public class MaterialController {

    private final MaterialService materialService;
    private final ClassroomAccessGuard accessGuard;

    public MaterialController(MaterialService materialService, ClassroomAccessGuard accessGuard) {
        this.materialService = materialService;
        this.accessGuard = accessGuard;
    }

    @PostMapping
    public Result<Material> upload(@PathVariable String scheduleId, @Valid @RequestBody MaterialUploadReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可上传讲稿");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        Material m = materialService.upload(scheduleId, req.getFileName(), req.getFileType(),
                req.getFileSize(), req.getOssKey());
        return Result.ok(m);
    }

    @GetMapping
    public Result<List<Material>> list(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(materialService.listBySchedule(scheduleId));
    }

    @PutMapping("/{materialId}/page")
    public Result<Void> turnPage(@PathVariable String scheduleId,
                                 @PathVariable Long materialId,
                                 @RequestBody TurnPageReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可翻页");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        materialService.turnPage(scheduleId, materialId, req.getPage() != null ? req.getPage() : 1);
        return Result.success();
    }
}
