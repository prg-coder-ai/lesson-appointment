package com.reservation.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.common.Result;
import com.reservation.dto.AlertCallbackReq;
import com.reservation.dto.AttendanceCallbackReq;
import com.reservation.dto.ClassroomEventCallbackReq;
import com.reservation.dto.ReconcileCallbackReq;
import com.reservation.utils.HmacVerifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * classroom-service 回调接收控制器。
 *
 * <p>classroom-service 在课堂关闭/事件发生/告警/对账时，
 * 通过 HMAC 签名回调本控制器，将课堂运行数据回流到预约系统。
 *
 * <p><b>鉴权</b>：不使用 JWT，而是通过 X-Hmac-Signature 头做 HMAC-SHA256 签名验证。
 * 端点已在 SecurityConfig / JwtAuthenticationFilter / WebMvcConfig / authz 守卫四处白名单同步放行。
 *
 * <p>接口前缀: /api/v1/classrooms
 */
@RestController
@RequestMapping("/api/v1/classrooms")
public class ClassroomCallbackController {

    private static final Logger log = LoggerFactory.getLogger(ClassroomCallbackController.class);

    @Autowired
    private HmacVerifier hmacVerifier;
    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 接收 classroom-service 的出勤回流。
     * 课堂关闭后 classroom-service 将出勤与课时消耗明细推送过来，
     * 主系统据此更新课次出勤记录。
     */
    @PostMapping("/attendance")
    public Result<Void> receiveAttendance(
            @RequestBody AttendanceCallbackReq req,
            @RequestHeader("X-Hmac-Signature") String signature) {
        if (!verifySignature(req, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        log.info("收到出勤回流: scheduleId={}, classroomId={}, 学生数={}",
                req.getScheduleId(), req.getClassroomId(),
                req.getItems() != null ? req.getItems().size() : 0);
        // TODO 阶段3：更新课次出勤记录（AppointmentService.updateAttendance）
        return Result.success();
    }

    /**
     * 接收 classroom-service 的课堂事件（签到/退出/迟到/点名等）。
     */
    @PostMapping("/events")
    public Result<Void> receiveEvent(
            @RequestBody ClassroomEventCallbackReq req,
            @RequestHeader("X-Hmac-Signature") String signature) {
        if (!verifySignature(req, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        log.info("收到课堂事件: eventId={}, scheduleId={}, type={}, userId={}",
                req.getEventId(), req.getScheduleId(), req.getEventType(), req.getUserId());
        return Result.success();
    }

    /**
     * 接收 classroom-service 的异常告警。
     */
    @PostMapping("/alerts")
    public Result<Void> receiveAlert(
            @RequestBody AlertCallbackReq req,
            @RequestHeader("X-Hmac-Signature") String signature) {
        if (!verifySignature(req, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        log.warn("收到课堂告警: alertId={}, scheduleId={}, level={}, type={}, msg={}",
                req.getAlertId(), req.getScheduleId(), req.getLevel(), req.getAlertType(), req.getMessage());
        return Result.success();
    }

    /**
     * 接收 classroom-service 的日终对账报告。
     */
    @PostMapping("/reconcile")
    public Result<Void> receiveReconcile(
            @RequestBody ReconcileCallbackReq req,
            @RequestHeader("X-Hmac-Signature") String signature) {
        if (!verifySignature(req, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        log.info("收到对账报告: date={}, tenantId={}, scheduled={}, completed={}, cancelled={}",
                req.getReconcileDate(), req.getTenantId(),
                req.getTotalScheduled(), req.getTotalCompleted(), req.getTotalCancelled());
        return Result.success();
    }

    /**
     * HMAC 签名验证：将请求体序列化为 JSON 后与签名比对。
     */
    private boolean verifySignature(Object req, String signature) {
        try {
            String payload = objectMapper.writeValueAsString(req);
            return hmacVerifier.verify(payload, signature);
        } catch (Exception e) {
            log.warn("签名验证异常: {}", e.getMessage());
            return false;
        }
    }
}