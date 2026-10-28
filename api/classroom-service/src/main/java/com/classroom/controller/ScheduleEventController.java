package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.ScheduleEventReq;
import com.classroom.entity.Classroom;
import com.classroom.event.EventIdempotentGuard;
import com.classroom.event.ScheduleEventConsumer;
import com.classroom.security.HmacSigner;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 入向接口：接收排期事件（F1-01）。
 *
 * <p>预约系统通过 REST 推送 created/updated/cancelled 事件到本服务。
 *
 * <p><b>为什么必须验 HMAC</b>：本端点不走 JWT（它是服务间调用，没有用户上下文），
 * 修复前它在 {@code WebMvcConfig} 的免登录白名单里**且没有任何替代校验**——
 * 任何人 POST 一个 JSON 就能创建/篡改/取消任意课堂（含伪造师生名单）。
 * 需求 4.4 第 3 条、9.4 第 3 条要求服务间调用「HMAC 签名 + 时间戳」，
 * 这里按该口径校验 {@code X-Hmac-Signature}（与出向回调同一把 crypto.hmac-key）。
 *
 * <p><b>为什么收原始报文</b>：签名是发送方对它自己序列化出的那串 JSON 算的。
 * 反序列化再序列化来验签会因字段顺序/格式差异恒失败（预约系统侧已踩过同一坑）。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleEventController {

    private final ScheduleEventConsumer eventConsumer;
    private final EventIdempotentGuard idempotentGuard;
    private final HmacSigner hmacSigner;
    private final ObjectMapper objectMapper;
    private final Validator validator;

    public ScheduleEventController(ScheduleEventConsumer eventConsumer,
                                   EventIdempotentGuard idempotentGuard,
                                   HmacSigner hmacSigner,
                                   ObjectMapper objectMapper,
                                   Validator validator) {
        this.eventConsumer = eventConsumer;
        this.idempotentGuard = idempotentGuard;
        this.hmacSigner = hmacSigner;
        this.objectMapper = objectMapper;
        this.validator = validator;
    }

    /**
     * 接收排期事件（created/updated/cancelled）。
     *
     * <p><b>重复投递返回 200 而非 409</b>：需求 8.2 明确「接收成功返回 200 + {received:true}；
     * 重复事件同样返回 200」。返回 409 会让预约系统把「幂等去重」当成失败而重试/告警。
     * 这里用 {@code received=false, duplicate=true} 表达「收到但不重复处理」。
     */
    @PostMapping("/events")
    public Result<Map<String, Object>> receiveEvent(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Hmac-Signature", required = false) String signature) {

        if (!hmacSigner.verify(rawBody, signature)) {
            log.warn("排期事件验签失败，已拒绝: signaturePresent={}, bodyLength={}",
                    signature != null, rawBody == null ? 0 : rawBody.length());
            return Result.fail(403, "签名验证失败");
        }

        ScheduleEventReq req;
        try {
            req = objectMapper.readValue(rawBody, ScheduleEventReq.class);
        } catch (Exception e) {
            log.warn("排期事件报文解析失败: {}", e.getMessage());
            return Result.fail(400, "请求体格式错误");
        }

        // @Valid 在「手工反序列化」路径上不会自动触发，需显式校验，否则必填缺失会一路带到业务层。
        // 取消事件走 CancelGroup：删排期时行已不在，课程/教师/时间拿不到（见 ScheduleEventReq#CancelGroup），
        // 若按 created/updated 的全量必填报 400，删除排期就永远取消不掉课堂。
        boolean cancelEvent = "cancelled".equals(req.getEventType());
        Set<ConstraintViolation<ScheduleEventReq>> violations = cancelEvent
                ? validator.validate(req, ScheduleEventReq.CancelGroup.class)
                : validator.validate(req);
        if (!violations.isEmpty()) {
            String msg = violations.stream()
                    .map(v -> v.getPropertyPath() + " " + v.getMessage())
                    .collect(Collectors.joining("; "));
            log.warn("排期事件参数校验失败: {}", msg);
            return Result.fail(400, "参数校验失败：" + msg);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("received", true);
        data.put("eventId", req.getEventId());

        if (!idempotentGuard.tryAcquire(req.getEventId())) {
            data.put("received", false);
            data.put("duplicate", true);
            log.info("重复事件已忽略: eventId={}, scheduleId={}", req.getEventId(), req.getScheduleId());
            return Result.success(data, "重复事件已忽略");
        }
        eventConsumer.consume(req);
        return Result.ok(data);
    }

    /**
     * 补偿拉取单个课堂：预约系统对账时确认某排期是否已在课堂侧建好。
     * 该端点仍走 JWT（不在免登录白名单），调用方用系统令牌。
     */
    @GetMapping("/{scheduleId}")
    public Result<Classroom> getSchedule(@PathVariable String scheduleId) {
        return Result.ok(eventConsumer.getSchedule(scheduleId));
    }
}
