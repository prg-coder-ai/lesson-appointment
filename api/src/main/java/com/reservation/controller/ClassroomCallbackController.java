package com.reservation.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.common.Result;
import com.reservation.dto.AlertCallbackReq;
import com.reservation.dto.AttendanceCallbackReq;
import com.reservation.dto.ClassroomEventCallbackReq;
import com.reservation.dto.ReconcileCallbackReq;
import com.reservation.service.LessonAttendanceService;
import com.reservation.utils.HmacVerifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * classroom-service 回调接收控制器（出向回调的落点）。
 *
 * <p>课堂服务在课堂关闭/事件发生/告警/对账时，经 HMAC 签名回调本控制器，把课堂运行数据
 * 回流预约系统。对应需求 F2-06 / F7-02 / F7-03 / F7-05。
 *
 * <p><b>路径为什么是 /classroom-callback 而不是 /classrooms</b>：
 * 前端访问课堂服务的路径是 {@code /api/v1/classrooms/**}，nginx 按最长前缀把它整体
 * 转发到 8092。若回调也挂在同名前缀下，经公网域名访问回调会被打到课堂服务并 404，
 * 而本地直连 8081 调试又是通的——属于「本地全绿、上线全挂」的典型。
 * 因此回调独占 {@code /api/v1/classroom-callback/**}，与前端路由彻底解耦。
 *
 * <p><b>鉴权</b>：不使用 JWT（回调方是服务，不是用户），改校验
 * {@code X-Hmac-Signature}（HMAC-SHA256，与课堂服务共享 crypto.hmac-key）。
 * 端点已在 SecurityConfig / JwtAuthenticationFilter / WebMvcConfig / authz 守卫四处白名单同步放行。
 *
 * <p><b>验签必须用原始报文</b>：签名是课堂服务对「它自己序列化出的那串 JSON」算的。
 * 若先反序列化成本地 DTO 再重新序列化来验签，字段增减、字段顺序、null 处理、
 * 时间格式任何一处差异都会让签名恒不匹配（旧实现即栽在此处，表现为回调恒 403）。
 */
@RestController
@RequestMapping("/api/v1/classroom-callback")
public class ClassroomCallbackController {

    private static final Logger log = LoggerFactory.getLogger(ClassroomCallbackController.class);

    private final HmacVerifier hmacVerifier;
    private final ObjectMapper objectMapper;
    private final LessonAttendanceService lessonAttendanceService;

    public ClassroomCallbackController(HmacVerifier hmacVerifier,
                                       ObjectMapper objectMapper,
                                       LessonAttendanceService lessonAttendanceService) {
        this.hmacVerifier = hmacVerifier;
        this.objectMapper = objectMapper;
        this.lessonAttendanceService = lessonAttendanceService;
    }

    /**
     * 接收出勤回流：课堂关闭后，课堂服务把学生维度出勤与课时消耗推过来，此处落库。
     *
     * <p>响应体带上落库统计（新增/更新/版本过旧），让课堂服务侧能对账；
     * 版本过旧不算失败——那是乱序投递的正常结果。
     */
    @PostMapping("/attendance")
    public Result<Map<String, Object>> receiveAttendance(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Hmac-Signature", required = false) String signature) {
        if (!verifyRawSignature(rawBody, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        AttendanceCallbackReq req = parse(rawBody, AttendanceCallbackReq.class);
        if (req == null) {
            return Result.fail(400, "报文格式错误");
        }

        LessonAttendanceService.WritebackResult result;
        try {
            result = lessonAttendanceService.writeback(req);
        } catch (IllegalArgumentException e) {
            log.warn("出勤回流被拒绝: {}", e.getMessage());
            return Result.fail(404, e.getMessage());
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("received", true);
        data.put("scheduleId", req.getScheduleId());
        data.put("consumptionVersion", req.getConsumptionVersion());
        data.put("inserted", result.inserted);
        data.put("updated", result.updated);
        data.put("stale", result.stale);
        data.put("invalid", result.invalid);
        log.info("出勤回流已接收: scheduleId={}, 学生数={}, 落库={}",
                req.getScheduleId(), req.getItems() == null ? 0 : req.getItems().size(), result.affected());
        return Result.success(data, "出勤回流已接收");
    }

    /**
     * 接收课堂事件（签到/退出/迟到/移出）。
     *
     * <p>目前只做验签与留痕：这些事件在课堂侧已是真相源，预约系统侧的落库用途
     * （F7-04 学情报表）存储口径尚未定义，故不做半截写入——先保证链路可通、可观测。
     */
    @PostMapping("/events")
    public Result<Void> receiveEvent(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Hmac-Signature", required = false) String signature) {
        if (!verifyRawSignature(rawBody, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        ClassroomEventCallbackReq req = parse(rawBody, ClassroomEventCallbackReq.class);
        if (req == null) {
            return Result.fail(400, "报文格式错误");
        }
        log.info("收到课堂事件: eventId={}, scheduleId={}, type={}, userId={}",
                req.getEventId(), req.getScheduleId(), req.getEventType(), req.getUserId());
        return Result.success();
    }

    /**
     * 接收异常告警（教师未到、课堂中断、大面积掉线）。
     *
     * <p>以 WARN 级别落日志，便于接入既有日志告警规则；独立告警工单表待字段口径确认后再建。
     */
    @PostMapping("/alerts")
    public Result<Void> receiveAlert(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Hmac-Signature", required = false) String signature) {
        if (!verifyRawSignature(rawBody, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        AlertCallbackReq req = parse(rawBody, AlertCallbackReq.class);
        if (req == null) {
            return Result.fail(400, "报文格式错误");
        }
        log.warn("收到课堂告警: scheduleId={}, courseId={}, severity={}, type={}, msg={}, occurredAt={}",
                req.getScheduleId(), req.getCourseId(), req.getSeverity(),
                req.getAlertType(), req.getMessage(), req.getOccurredAt());
        return Result.success();
    }

    /**
     * 接收日终对账报告。
     *
     * <p>当前只留痕：差异补偿依赖「双边都能查」的对账能力（F8-05 契约控制台）尚未实现，
     * 此处先保证报告能到、能被日志检索。
     */
    @PostMapping("/reconcile")
    public Result<Void> receiveReconcile(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Hmac-Signature", required = false) String signature) {
        if (!verifyRawSignature(rawBody, signature)) {
            return Result.fail(403, "签名验证失败");
        }
        ReconcileCallbackReq req = parse(rawBody, ReconcileCallbackReq.class);
        if (req == null) {
            return Result.fail(400, "报文格式错误");
        }
        log.info("收到对账报告: date={}, tenantId={}, scheduled={}, completed={}, cancelled={}",
                req.getReconcileDate(), req.getTenantId(),
                req.getTotalScheduled(), req.getTotalCompleted(), req.getTotalCancelled());
        return Result.success();
    }

    /**
     * 对<b>原始报文</b>验签（不做任何反序列化/再序列化）。
     *
     * <p>{@code signature} 允许缺失——缺失时直接判失败返回 403，而不是抛
     * MissingRequestHeaderException 变成 400，避免调用方误判为「报文格式问题」。
     */
    private boolean verifyRawSignature(String rawBody, String signature) {
        if (rawBody == null) return false;
        return hmacVerifier.verify(rawBody, signature);
    }

    private <T> T parse(String rawBody, Class<T> type) {
        try {
            return objectMapper.readValue(rawBody, type);
        } catch (Exception e) {
            log.warn("回调报文解析失败: type={}, err={}", type.getSimpleName(), e.getMessage());
            return null;
        }
    }
}
