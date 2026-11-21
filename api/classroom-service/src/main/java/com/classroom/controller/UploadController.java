package com.classroom.controller;

import com.classroom.common.ErrorCodes;
import com.classroom.common.Result;
import com.classroom.dto.UploadInitReq;
import com.classroom.guard.RateLimitService;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.storage.StorageService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 分片上传接口（F4-04 讲稿 ≤100MB / F5-01 作品断点续传 / F6 录制成片上传）。
 *
 * <p>四步：init（登记）→ 逐片 PUT → complete（合并）→ 业务侧登记 ossKey。
 * 断点续传靠 {@code GET /uploads/{uploadId}} 回传已传分片，客户端跳过它们继续传，
 * 不需要客户端自己记进度。
 *
 * <p><b>安全</b>：init 时必须过 {@link ClassroomAccessGuard}（不是本课堂的人不能往这个
 * 课堂目录里写东西）；后续每个分片都校验会话属主，避免拿别人的 uploadId 覆盖内容。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/uploads")
public class UploadController {

    private final StorageService storageService;
    private final ClassroomAccessGuard accessGuard;
    private final RateLimitService rateLimit;

    /** 上传会话创建限流：每用户每分钟上限（每次上传 1 次 init，30 足够正常使用） */
    @Value("${classroom.rate-limit.upload-per-minute:30}")
    private int uploadPerMinute;

    public UploadController(StorageService storageService,
                            ClassroomAccessGuard accessGuard,
                            RateLimitService rateLimit) {
        this.storageService = storageService;
        this.accessGuard = accessGuard;
        this.rateLimit = rateLimit;
    }

    @PostMapping("/init")
    public Result<Map<String, Object>> init(@Valid @RequestBody UploadInitReq req) {
        String userId = AuthContext.currentUserId();
        accessGuard.assertAccess(req.getScheduleId(), userId, AuthContext.currentRole());
        // 限流放在鉴权之后：只有合法的课堂成员才值得计数，未授权请求不该占用配额
        if (!rateLimit.tryAcquire("upload", userId, uploadPerMinute, 60)) {
            return Result.fail(ErrorCodes.RATE_LIMITED, "上传过于频繁，请稍后再试");
        }
        if ("RECORDING".equalsIgnoreCase(req.getPurpose())
                && !AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可上传录制文件");
        }
        StorageService.UploadSession s = storageService.init(
                req.getPurpose(), req.getScheduleId(), req.getFileName(), req.getFileSize(), userId);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("uploadId", s.getUploadId());
        m.put("key", s.getKey());
        m.put("partSize", s.getPartSize());
        m.put("partCount", s.getPartCount());
        m.put("storageType", storageService.storageType());
        return Result.ok(m);
    }

    /** 已传分片（断点续传：客户端据此跳过已传部分） */
    @GetMapping("/{uploadId}")
    public Result<Map<String, Object>> status(@PathVariable String uploadId) {
        StorageService.UploadSession s = storageService.session(uploadId);
        List<Integer> uploaded = storageService.uploadedParts(uploadId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("uploadId", s.getUploadId());
        m.put("key", s.getKey());
        m.put("status", s.getStatus());
        m.put("partSize", s.getPartSize());
        m.put("partCount", s.getPartCount());
        m.put("uploadedParts", uploaded);
        return Result.ok(m);
    }

    /** 上传单个分片（原始字节体，Content-Type 无所谓） */
    @PutMapping("/{uploadId}/parts/{partNumber}")
    public Result<Map<String, Object>> uploadPart(@PathVariable String uploadId,
                                                 @PathVariable int partNumber,
                                                 @RequestBody byte[] data) {
        storageService.uploadPart(uploadId, partNumber, data, AuthContext.currentUserId());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("partNumber", partNumber);
        m.put("size", data == null ? 0 : data.length);
        return Result.ok(m);
    }

    /** 合并分片；缺片会返回缺哪些序号（客户端补传后再来一次即可） */
    @PostMapping("/{uploadId}/complete")
    public Result<Map<String, Object>> complete(@PathVariable String uploadId) {
        String key = storageService.complete(uploadId, AuthContext.currentUserId());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ossKey", key);
        m.put("url", storageService.signedUrl(key));
        m.put("size", storageService.size(key));
        return Result.ok(m);
    }

    @DeleteMapping("/{uploadId}")
    public Result<Void> abort(@PathVariable String uploadId) {
        storageService.abort(uploadId, AuthContext.currentUserId());
        return Result.success();
    }
}
