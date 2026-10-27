package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.MaterialUploadReq;
import com.classroom.entity.Material;
import com.classroom.service.MaterialService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：讲稿上传/拉取（F4-04~06）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/materials")
public class MaterialController {

    private final MaterialService materialService;

    public MaterialController(MaterialService materialService) {
        this.materialService = materialService;
    }

    @PostMapping
    public Result<Material> upload(@PathVariable String scheduleId, @Valid @RequestBody MaterialUploadReq req) {
        Material m = materialService.upload(scheduleId, req.getFileName(), req.getFileType(),
                req.getFileSize(), req.getOssKey());
        return Result.ok(m);
    }

    @GetMapping
    public Result<List<Material>> list(@PathVariable String scheduleId) {
        return Result.ok(materialService.listBySchedule(scheduleId));
    }

    @PutMapping("/{materialId}/page")
    public Result<Void> turnPage(@PathVariable String scheduleId,
                                 @PathVariable Long materialId,
                                 @RequestParam int page) {
        materialService.turnPage(scheduleId, materialId, page);
        return Result.success();
    }
}