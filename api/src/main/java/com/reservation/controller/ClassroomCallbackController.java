package com.reservation.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.common.Result;
import com.reservation.dto.AlertCallbackReq;
import com.reservation.dto.AttendanceCallbackReq;
import com.reservation.dto.ClassroomEventCallbackReq;
import com.reservation.dto.ReconcileCallbackReq;
import com.reservation.service.LessonAttendanceService;
import com.reservation.service.LessonSettlementService;
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
    private final LessonSettlementService settlementService;

    public ClassroomCallbackController(HmacVerifier hmacVerifier,
                                       ObjectMapper objectMapper,
                                       LessonAttendanceService lessonAttendanceService,
                                       LessonSettlementService settlementService) {
        this.hmacVerifier = hmacVerifier;
        this.objectMapper = objectMapper;
        this.lessonAttendanceService = lessonAttendanceService;
        this.settlementService = settlementService;
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

        // 落库之后紧接着结算：扣课时 + 推进课次状态（completed/absent）。
        // 顺序不能反：状态一旦落终态就再也不会被兜底任务扫到，先改状态后扣减一旦扣失败就是永久漏扣。
        SettlementTally tally = settleAll(req);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("received", true);
        data.put("scheduleId", req.getScheduleId());
        data.put("consumptionVersion", req.getConsumptionVersion());
        data.put("inserted", result.inserted);
        data.put("updated", result.updated);
        data.put("stale", result.stale);
        data.put("invalid", result.invalid);
        data.put("deducted", tally.deducted);
        data.put("exempt", tally.exempt);
        data.put("duplicate", tally.duplicate);
        data.put("skipped", tally.skipped);
        log.info("出勤回流已接收: scheduleId={}, 学生数={}, 落库={}, 扣减={}, 免扣={}, 幂等={}, 跳过={}",
                req.getScheduleId(), req.getItems() == null ? 0 : req.getItems().size(), result.affected(),
                tally.deducted, tally.exempt, tally.duplicate, tally.skipped);
        return Result.success(data, "出勤回流已接收");
    }

    /**
     * 逐条结算，并汇总结果供响应体与日志。
     *
     * <p>单条失败不阻断其余学生：一个学生归户失败（预订被删）不该让整堂课的扣减全丢，
     * 失败的那条由兜底任务下次补上，其余照常落账。
     */
    private SettlementTally settleAll(AttendanceCallbackReq req) {
        SettlementTally tally = new SettlementTally();
        if (req.getItems() == null || req.getItems().isEmpty()) {
            return tally;
        }
        for (AttendanceCallbackReq.AttendanceItem item : req.getItems()) {
            if (item == null || item.getUserId() == null || item.getUserId().trim().isEmpty()) {
                tally.skipped++;
                continue;
            }
            try {
                // 出席判定：进过课堂即有 checkInAt。**这只是状态判据，不影响扣多少**
                // （扣减只判请假与否，见 AppointmentStatus#isLessonExempt）。
                boolean attended = item.getCheckInAt() != null;
                LessonSettlementService.Outcome out = settlementService.settle(
                        req.getScheduleId(), item.getUserId().trim(), null, attended, "classroom");
                if (out.skipped()) {
                    tally.skipped++;
                } else if (out.exempt) {
                    tally.exempt++;
                } else if (out.duplicate) {
                    tally.duplicate++;
                } else if (out.deducted) {
                    tally.deducted++;
                }
            } catch (Exception e) {
                tally.skipped++;
                log.warn("课次结算失败(该学生待兜底任务补算): scheduleId={}, userId={}, err={}",
                        req.getScheduleId(), item.getUserId(), e.getMessage());
            }
        }
        return tally;
    }

    /** 结算汇总计数 */
    private static class SettlementTally {
        int deducted;
        int exempt;
        int duplicate;
        int skipped;
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

        // 签到事件：把课次置为 checked-in（**只记出席现状，不产生任何费用动作**）。
        // 其余事件（leave/late/kick/rollcall）仍只留痕——它们是过程事实，落库口径未定，
        // 且终态由课堂收尾的出勤回流统一裁定，中途写状态会互相打架。
        if ("join".equalsIgnoreCase(req.getEventType())
                && req.getScheduleId() != null && req.getUserId() != null) {
            try {
                boolean changed = settlementService.markCheckedIn(req.getScheduleId(), req.getUserId());
                if (changed) {
                    log.info("课次已置为已签到: scheduleId={}, userId={}", req.getScheduleId(), req.getUserId());
                }
            } catch (Exception e) {
                // 签到标记失败不影响课堂侧事件上报（对方会重试，且这只是展示态）
                log.warn("签到状态标记失败(已忽略): scheduleId={}, userId={}, err={}",
                        req.getScheduleId(), req.getUserId(), e.getMessage());
            }
        }
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
