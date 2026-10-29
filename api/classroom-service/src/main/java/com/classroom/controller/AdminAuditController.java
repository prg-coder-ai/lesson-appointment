package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.AuditLog;
import com.classroom.entity.Submission;
import com.classroom.security.AuthContext;
import com.classroom.service.AuditService;
import com.classroom.storage.StorageService;
import lombok.Data;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 内容审核与查阅留痕（F8-03）。
 *
 * <p>作品抽查列表带签名 URL：运营点开就能看/听，而不是拿一个 ossKey 去求开发。
 * 每次标记/通过/查阅都写 {@code classroom_audit_log}，谁动的、什么时候、为什么，都能查。
 */
@RestController
@RequestMapping("/api/v1/admin/audit")
public class AdminAuditController {

    private final AuditService auditService;
    private final StorageService storageService;

    public AdminAuditController(AuditService auditService, StorageService storageService) {
        this.auditService = auditService;
        this.storageService = storageService;
    }

    @GetMapping("/submissions")
    public Result<List<Submission>> submissions(@RequestParam(required = false) String scheduleId,
                                               @RequestParam(required = false) String status,
                                               @RequestParam(required = false, defaultValue = "50") int limit) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可抽查作品");
        }
        List<Submission> list = auditService.listSubmissions(scheduleId, status, limit);
        list.forEach(s -> {
            if (s.getOssKey() != null && !s.getOssKey().isBlank()) {
                s.setUrl(storageService.signedUrl(s.getOssKey()));
            }
        });
        return Result.ok(list);
    }

    @PostMapping("/submissions/{submissionId}/flag")
    public Result<Void> flag(@PathVariable Long submissionId, @RequestBody(required = false) AuditReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可标记违规");
        }
        if (!auditService.flagSubmission(submissionId, AuthContext.currentUserId(),
                req == null ? null : req.getNote())) {
            return Result.fail(404, "作品不存在");
        }
        return Result.success();
    }

    @PostMapping("/submissions/{submissionId}/pass")
    public Result<Void> pass(@PathVariable Long submissionId, @RequestBody(required = false) AuditReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可审核作品");
        }
        if (!auditService.passSubmission(submissionId, AuthContext.currentUserId(),
                req == null ? null : req.getNote())) {
            return Result.fail(404, "作品不存在");
        }
        return Result.success();
    }

    /**
     * 查阅聊天留痕。
     *
     * <p>聊天内容本身不落库（课堂聊天是即时消息，不做归档），所以这里只记
     * 「谁在什么时候查阅了哪个课堂的聊天」。没有这条记录，「有没有人偷看过聊天」无从追溯。
     */
    @PostMapping("/chat/{scheduleId}/view")
    public Result<Void> chatView(@PathVariable String scheduleId, @RequestBody(required = false) AuditReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查阅聊天");
        }
        auditService.logChatView(scheduleId, AuthContext.currentUserId(),
                req == null ? null : req.getNote());
        return Result.success();
    }

    @GetMapping("/logs")
    public Result<List<AuditLog>> logs(@RequestParam(required = false, defaultValue = "7") int days,
                                       @RequestParam(required = false) String scheduleId) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看审核留痕");
        }
        return Result.ok(auditService.listLogs(days, scheduleId));
    }

    @Data
    public static class AuditReq {
        private String note;
    }
}
