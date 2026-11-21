package com.classroom.controller;

import com.classroom.common.ErrorCodes;
import com.classroom.common.Result;
import com.classroom.dto.ReviewReq;
import com.classroom.dto.SubmissionReq;
import com.classroom.entity.Submission;
import com.classroom.guard.RateLimitService;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.SubmissionService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

/**
 * 客户端接口：学生作品上传与点评（F5）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/submissions")
public class SubmissionController {

    private final SubmissionService submissionService;
    private final ClassroomAccessGuard accessGuard;
    private final RateLimitService rateLimit;

    /** 提交作业限流：每用户每分钟上限（防止脚本刷作品把存储打满） */
    @Value("${classroom.rate-limit.submit-per-minute:20}")
    private int submitPerMinute;

    public SubmissionController(SubmissionService submissionService,
                                ClassroomAccessGuard accessGuard,
                                RateLimitService rateLimit) {
        this.submissionService = submissionService;
        this.accessGuard = accessGuard;
        this.rateLimit = rateLimit;
    }

    @PostMapping
    public Result<Submission> submit(@PathVariable String scheduleId, @Valid @RequestBody SubmissionReq req) {
        String userId = AuthContext.currentUserId();
        accessGuard.assertAccess(scheduleId, userId, AuthContext.currentRole());
        if (!rateLimit.tryAcquire("submit", userId, submitPerMinute, 60)) {
            return Result.fail(ErrorCodes.RATE_LIMITED, "提交过于频繁，请稍后再试");
        }
        Submission s = submissionService.submit(scheduleId, userId, req.getSubmissionType(),
                req.getContent(), req.getOssKey(), req.getDurationSec());
        return Result.ok(s);
    }

    /**
     * 带文件的作品提交（语音/图片/文件，≤100MB）。
     *
     * <p>文字类仍走上面的 JSON 接口；这里专治「前端没有上传入口」——
     * 之前只收 ossKey，学生端根本没有能产出 ossKey 的地方，F5-01 等于没做。
     */
    @PostMapping("/file")
    public Result<Submission> submitFile(@PathVariable String scheduleId,
                                         @RequestParam("file") MultipartFile file,
                                         @RequestParam(value = "submissionType", required = false) String submissionType,
                                         @RequestParam(value = "content", required = false) String content,
                                         @RequestParam(value = "durationSec", required = false) Integer durationSec)
            throws IOException {
        String userId = AuthContext.currentUserId();
        accessGuard.assertAccess(scheduleId, userId, AuthContext.currentRole());
        if (!rateLimit.tryAcquire("submit", userId, submitPerMinute, 60)) {
            return Result.fail(ErrorCodes.RATE_LIMITED, "提交过于频繁，请稍后再试");
        }
        if (file == null || file.isEmpty()) {
            return Result.fail(400, "文件为空");
        }
        String type = submissionType == null ? guessType(file.getOriginalFilename()) : submissionType;
        Submission s = submissionService.submitFile(scheduleId, userId, type, content,
                file.getOriginalFilename(), file.getBytes(), durationSec);
        return Result.ok(s);
    }

    @GetMapping
    public Result<List<Submission>> list(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(submissionService.listBySchedule(scheduleId));
    }

    @PutMapping("/{submissionId}/review")
    public Result<Void> review(@PathVariable String scheduleId,
                               @PathVariable Long submissionId,
                               @RequestBody ReviewReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可批阅作品");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        submissionService.review(submissionId, req.getComment(), req.getScore());
        return Result.success();
    }

    /** 未显式指定类型时按扩展名推断（语音/图片/其他），避免前端漏传就 500 */
    private String guessType(String fileName) {
        String n = fileName == null ? "" : fileName.toLowerCase(java.util.Locale.ROOT);
        if (n.endsWith(".mp3") || n.endsWith(".wav") || n.endsWith(".m4a")
                || n.endsWith(".aac") || n.endsWith(".ogg") || n.endsWith(".webm")) {
            return "AUDIO";
        }
        if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg")
                || n.endsWith(".gif") || n.endsWith(".webp")) {
            return "IMAGE";
        }
        return "FILE";
    }
}
