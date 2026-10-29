package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.MaterialUploadReq;
import com.classroom.dto.TurnPageReq;
import com.classroom.entity.Material;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.MaterialService;
import com.classroom.service.TeachingSessionService;
import com.classroom.ws.WsRoomRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 客户端接口：讲稿上传/拉取/翻页（F4-04~06）。
 *
 * <p>上传/翻页是教师动作，须过「本堂课教师」校验；学生只读（拉列表、跟页）。
 *
 * <p><b>翻页必须广播</b>：修复前 {@code turnPage} 只改库不通知，学生端页面纹丝不动，
 * 所谓「学生跟随翻页」根本没有实现。现在落库 + 广播 {@code page:state} 双写：
 * 在线的人实时跟，迟到/刷新的人靠 {@code GET /materials/current} 或进房下发补齐。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/materials")
public class MaterialController {

    private final MaterialService materialService;
    private final ClassroomAccessGuard accessGuard;
    private final WsRoomRegistry registry;
    private final TeachingSessionService teachingSession;
    private final ObjectMapper objectMapper;

    public MaterialController(MaterialService materialService,
                              ClassroomAccessGuard accessGuard,
                              WsRoomRegistry registry,
                              TeachingSessionService teachingSession,
                              ObjectMapper objectMapper) {
        this.materialService = materialService;
        this.accessGuard = accessGuard;
        this.registry = registry;
        this.teachingSession = teachingSession;
        this.objectMapper = objectMapper;
    }

    /** 登记已上传的讲稿（客户端先走 /uploads 分片上传，再带 ossKey 来登记） */
    @PostMapping
    public Result<Material> upload(@PathVariable String scheduleId, @Valid @RequestBody MaterialUploadReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可上传讲稿");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        Material m = req.getOssKey() != null && !req.getOssKey().isBlank()
                ? materialService.registerUploaded(scheduleId, req.getFileName(), req.getOssKey())
                : materialService.upload(scheduleId, req.getFileName(), req.getFileType(),
                        req.getFileSize(), req.getOssKey());
        broadcastState(scheduleId, m, m.getCurrentPage() == null ? 1 : m.getCurrentPage());
        return Result.ok(m);
    }

    /** 一次性直传（≤100MB；超过走 /uploads 分片）。上传成功即广播给学生 */
    @PostMapping("/file")
    public Result<Material> uploadFile(@PathVariable String scheduleId,
                                       @RequestParam("file") MultipartFile file) throws IOException {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可上传讲稿");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        if (file == null || file.isEmpty()) {
            return Result.fail(400, "文件为空");
        }
        Material m = materialService.uploadBytes(scheduleId, file.getOriginalFilename(), file.getBytes());
        broadcastState(scheduleId, m, 1);
        teachingSession.appendEvent(scheduleId, "material:upload",
                Map.of("materialId", m.getMaterialId(), "fileName", m.getFileName(),
                        "fileType", m.getFileType(), "size", m.getFileSize()));
        return Result.ok(m);
    }

    @GetMapping
    public Result<List<Material>> list(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(materialService.listBySchedule(scheduleId));
    }

    /** 当前生效讲稿（学生进房/刷新定位用） */
    @GetMapping("/current")
    public Result<Material> current(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(materialService.current(scheduleId));
    }

    @PutMapping("/{materialId}/page")
    public Result<Void> turnPage(@PathVariable String scheduleId,
                                 @PathVariable Long materialId,
                                 @RequestBody TurnPageReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可翻页");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        int page = (req.getPage() != null && req.getPage() > 0) ? req.getPage() : 1;
        if (!materialService.turnPage(scheduleId, materialId, page)) {
            return Result.fail(404, "讲稿不存在");
        }
        Material m = materialService.getById(scheduleId, materialId);
        broadcastState(scheduleId, m, page);
        teachingSession.appendEvent(scheduleId, "material:page",
                Map.of("materialId", materialId, "page", page));
        return Result.success();
    }

    /** 广播当前讲稿与页码：在线学生实时跟页；含 url 便于刚进来的人直接渲染 */
    private void broadcastState(String scheduleId, Material m, int page) {
        if (m == null || m.getOssKey() == null) return;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "page:state");
            payload.put("materialId", m.getMaterialId());
            payload.put("fileName", m.getFileName());
            payload.put("fileType", m.getFileType());
            payload.put("url", m.getUrl());
            payload.put("page", page);
            payload.put("by", AuthContext.currentUserId());
            registry.broadcastSignal(scheduleId, objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            // 广播失败不影响落库（下一帧翻页/刷新会纠正）
            log.warn("讲稿状态广播失败: scheduleId={}", scheduleId, e);
        }
    }
}
