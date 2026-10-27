package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.SubmissionReq;
import com.classroom.entity.Submission;
import com.classroom.security.AuthContext;
import com.classroom.service.SubmissionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

/**
 * 客户端接口：学生作品上传（F5）。
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/submissions")
public class SubmissionController {

    private final SubmissionService submissionService;

    public SubmissionController(SubmissionService submissionService) {
        this.submissionService = submissionService;
    }

    @PostMapping
    public Result<Submission> submit(@PathVariable String scheduleId, @Valid @RequestBody SubmissionReq req) {
        String userId = AuthContext.currentUserId();
        Submission s = submissionService.submit(scheduleId, userId, req.getSubmissionType(),
                req.getContent(), req.getOssKey(), req.getDurationSec());
        return Result.ok(s);
    }

    @GetMapping
    public Result<List<Submission>> list(@PathVariable String scheduleId) {
        return Result.ok(submissionService.listBySchedule(scheduleId));
    }

    @PutMapping("/{submissionId}/review")
    public Result<Void> review(@PathVariable String scheduleId,
                               @PathVariable Long submissionId,
                               @RequestParam(required = false) String comment,
                               @RequestParam(required = false) BigDecimal score) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可批阅作品");
        }
        submissionService.review(submissionId, comment, score);
        return Result.success();
    }
}