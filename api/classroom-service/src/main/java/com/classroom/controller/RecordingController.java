package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.Recording;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.RecordingService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 客户端接口：录制回放（F6）。
 *
 * <p>回放权限是 F6-03 的硬要求（仅本课堂成员与授权运营）：修复前这两个接口
 * 没有任何成员校验，任何登录用户知道 scheduleId 就能拿到回放地址。
 */
@RestController
@RequestMapping("/api/v1/recordings")
public class RecordingController {

    private final RecordingService recordingService;
    private final ClassroomAccessGuard accessGuard;

    public RecordingController(RecordingService recordingService, ClassroomAccessGuard accessGuard) {
        this.recordingService = recordingService;
        this.accessGuard = accessGuard;
    }

    @GetMapping("/{scheduleId}")
    public Result<List<Recording>> list(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(recordingService.listBySchedule(scheduleId));
    }

    @GetMapping("/{scheduleId}/playback")
    public Result<String> playback(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        String url = recordingService.getPlaybackUrl(scheduleId);
        if (url == null) {
            return Result.fail(409, "录制尚未就绪");
        }
        return Result.ok(url);
    }
}
