package com.classroom.controller;

import com.classroom.common.ErrorCodes;
import com.classroom.common.Result;
import com.classroom.dto.RollCallReq;
import com.classroom.guard.RateLimitService;
import com.classroom.entity.RollCallRecord;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.RollCallService;
import com.classroom.service.TeachingSessionService;
import com.classroom.ws.WsRoomRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 客户端接口：点名（F4-11~12）。
 *
 * <p>P1 改造：发起后向房间 WS 广播 {@code rollcall:start}（含 rollcallId / targetUserId），
 * 命中学生端弹出强提示 + 响铃（F4-12）；学生应答后广播 {@code rollcall:answered}。
 * 每次点名/应答同时写入教学环节流水（F4-18）。</p>
 */
@RestController
@RequestMapping("/api/v1/classrooms/{scheduleId}/rollcall")
public class RollCallController {

    private final RollCallService rollCallService;
    private final ClassroomAccessGuard accessGuard;
    private final WsRoomRegistry registry;
    private final TeachingSessionService teachingSession;
    private final RateLimitService rateLimit;

    /** 发起点名限流：每用户每分钟上限（教师手抖连点会刷出一串 PENDING 点名） */
    @Value("${classroom.rate-limit.rollcall-per-minute:10}")
    private int rollcallPerMinute;

    public RollCallController(RollCallService rollCallService, ClassroomAccessGuard accessGuard,
                             WsRoomRegistry registry, TeachingSessionService teachingSession,
                             RateLimitService rateLimit) {
        this.rollCallService = rollCallService;
        this.accessGuard = accessGuard;
        this.registry = registry;
        this.teachingSession = teachingSession;
        this.rateLimit = rateLimit;
    }

    @PostMapping
    public Result<RollCallRecord> initiate(@PathVariable String scheduleId, @RequestBody(required = false) RollCallReq req) {
        if (!AuthContext.isTeacher() && !AuthContext.isManager()) {
            return Result.fail(403, "仅教师可发起点名");
        }
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        if (!rateLimit.tryAcquire("rollcall", AuthContext.currentUserId(), rollcallPerMinute, 60)) {
            return Result.fail(ErrorCodes.RATE_LIMITED, "点名过于频繁，请稍后再试");
        }
        String target = req != null ? req.getTargetUserId() : null;
        RollCallRecord record = rollCallService.initiate(scheduleId, target);
        String msg = "{\"type\":\"rollcall:start\",\"rollcallId\":" + record.getRollcallId()
                + ",\"targetUserId\":" + q(record.getTargetUserId()) + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "rollcall", Map.of("rollcallId", record.getRollcallId(), "target", record.getTargetUserId()));
        return Result.ok(record);
    }

    @GetMapping
    public Result<List<RollCallRecord>> list(@PathVariable String scheduleId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        return Result.ok(rollCallService.listBySchedule(scheduleId));
    }

    @PostMapping("/{rollcallId}/answer")
    public Result<Void> answer(@PathVariable String scheduleId, @PathVariable Long rollcallId) {
        accessGuard.assertAccess(scheduleId, AuthContext.currentUserId(), AuthContext.currentRole());
        String userId = AuthContext.currentUserId();
        rollCallService.answer(scheduleId, rollcallId);
        String msg = "{\"type\":\"rollcall:answered\",\"rollcallId\":" + rollcallId
                + ",\"userId\":" + q(userId) + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "rollcall_answer", Map.of("rollcallId", rollcallId, "userId", userId));
        return Result.success();
    }

    private String q(String s) {
        return s == null ? "null" : "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
