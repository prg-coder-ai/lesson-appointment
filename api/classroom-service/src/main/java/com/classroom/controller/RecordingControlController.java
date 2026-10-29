package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.Recording;
import com.classroom.recording.RecordingBackendRegistry;
import com.classroom.recording.RecordingProperties;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.RecordingService;
import com.classroom.service.TeachingSessionService;
import com.classroom.ws.WsRoomRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 录制的开始/结束（F6-01 / F6-02）。
 *
 * <p>只有教师/管理员能开录：录制涉及学员肖像与声音，权限口径必须比「能进课堂」更严。
 * 开录与停录都会向房间广播 {@code record:state}——学员端要能看到「本堂课正在录制」的提示，
 * 这是合规底线（不能偷偷录）。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/recording")
public class RecordingControlController {

    private final RecordingService recordingService;
    private final RecordingBackendRegistry backendRegistry;
    private final RecordingProperties recordingProperties;
    private final ClassroomAccessGuard accessGuard;
    private final WsRoomRegistry registry;
    private final TeachingSessionService teachingSession;
    private final ObjectMapper objectMapper;

    public RecordingControlController(RecordingService recordingService,
                                      RecordingBackendRegistry backendRegistry,
                                      RecordingProperties recordingProperties,
                                      ClassroomAccessGuard accessGuard,
                                      WsRoomRegistry registry,
                                      TeachingSessionService teachingSession,
                                      ObjectMapper objectMapper) {
        this.recordingService = recordingService;
        this.backendRegistry = backendRegistry;
        this.recordingProperties = recordingProperties;
        this.accessGuard = accessGuard;
        this.registry = registry;
        this.teachingSession = teachingSession;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/start")
    public Result<Map<String, Object>> start(@PathVariable String scheduleId) {
        if (!canRecord()) {
            return Result.fail(403, "仅教师可开始录制");
        }
        String userId = AuthContext.currentUserId();
        accessGuard.assertAccess(scheduleId, userId, AuthContext.currentRole());

        Recording r = recordingService.start(scheduleId, userId);
        broadcast(scheduleId, true, r.getRecordingId());
        teachingSession.appendEvent(scheduleId, "record:start",
                Map.of("recordingId", r.getRecordingId(), "mode", backendRegistry.activeMode()));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("recordingId", r.getRecordingId());
        m.put("mode", backendRegistry.activeMode());
        m.put("startTime", r.getStartTime());
        m.put("maxUploadBytes", recordingProperties.getMaxUploadBytes());
        m.put("notice", "CLIENT".equals(backendRegistry.activeMode())
                ? "本地录制：只录教师画面与声音，学生画面不进入录制文件"
                : "云端录制：由媒体服务器合流");
        return Result.ok(m);
    }

    @PostMapping("/{recordingId}/stop")
    public Result<Recording> stop(@PathVariable String scheduleId,
                                  @PathVariable Long recordingId,
                                  @RequestBody(required = false) StopReq req) {
        if (!canRecord()) {
            return Result.fail(403, "仅教师可停止录制");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        String ossKey = req == null ? null : req.getOssKey();
        Recording r;
        try {
            r = recordingService.finish(scheduleId, recordingId, ossKey);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
        broadcast(scheduleId, false, recordingId);
        teachingSession.appendEvent(scheduleId, "record:stop",
                Map.of("recordingId", recordingId, "ossKey", ossKey == null ? "" : ossKey));
        return Result.ok(r);
    }

    @GetMapping("/state")
    public Result<Map<String, Object>> state(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        Recording running = recordingService.findRunning(scheduleId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("recording", running != null);
        m.put("recordingId", running == null ? null : running.getRecordingId());
        m.put("mode", backendRegistry.activeMode());
        return Result.ok(m);
    }

    private boolean canRecord() {
        return AuthContext.isTeacher() || AuthContext.isManager();
    }

    private void broadcast(String scheduleId, boolean on, Long recordingId) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "record:state");
            payload.put("on", on);
            payload.put("recordingId", recordingId);
            payload.put("mode", backendRegistry.activeMode());
            payload.put("by", AuthContext.currentUserId());
            registry.broadcastSignal(scheduleId, objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            log.warn("录制状态广播失败: scheduleId={}", scheduleId, e);
        }
    }

    @Data
    public static class StopReq {
        private String ossKey;
    }
}
