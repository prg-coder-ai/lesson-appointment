package com.reservation.service;

import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.User;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 排期事件推送服务（booking-api → classroom-service）。
 *
 * <p>在排期创建/更新/取消/删除后，异步推送事件到 classroom-service，
 * 由 classroom-service 创建/更新课堂记录与成员关系。
 *
 * <p><b>动态服务发现</b>：classroom-service 地址从 sys_tenant_eclassroom 表动态查询，
 * 不硬编码。租户未启用课堂时静默跳过（best-effort）。
 *
 * <p><b>事务安全</b>：提供 {@link #pushAfterCommit} 方法，在事务提交后才触发推送，
 * 避免 classroom-service 收到事件但读不到落库数据。
 *
 * <p><b>鉴权</b>：使用 JWT（共享 jwt.secret），生成 system 令牌。
 *
 * <p><b>失败策略</b>：best-effort，失败仅记日志不抛异常（不阻塞主业务流程）。
 */
@Service
public class ClassroomEventPushService {

    private static final Logger log = LoggerFactory.getLogger(ClassroomEventPushService.class);
    private static final String SYSTEM_PRINCIPAL = "system";
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    @Resource
    private EclassroomService eclassroomService;
    @Resource
    private JwtUtil jwtUtil;
    @Resource
    private CourseScheduleMapper scheduleMapper;
    @Resource
    private CourseMapper courseMapper;
    @Resource
    private UserMapper userMapper;
    @Resource
    private BookingMapper bookingMapper;
    @Resource
    private com.reservation.utils.HmacVerifier hmacVerifier;
    @Resource
    private com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    @Value("${classroom.service.base-url:http://localhost:8092}")
    private String defaultBaseUrl;

    private RestTemplate restTemplate;

    @PostConstruct
    private void init() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        this.restTemplate = new RestTemplate(factory);
    }

    /**
     * 注册事务后回调：事务提交后推送排期事件。
     * 若当前无事务上下文，则直接同步推送。
     *
     * @param tenantId   租户 ID
     * @param scheduleId 排期 ID
     * @param eventType  事件类型：created / updated / cancelled
     */
    public void pushAfterCommit(Long tenantId, String scheduleId, String eventType) {
        if (scheduleId == null || tenantId == null || tenantId == 0L) return;

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    doPush(tenantId, scheduleId, eventType);
                }
            });
        } else {
            doPush(tenantId, scheduleId, eventType);
        }
    }

    /**
     * 执行事件推送（best-effort）。
     */
    private void doPush(Long tenantId, String scheduleId, String eventType) {
        try {
            String apiBaseUrl = eclassroomService.getTenantClassroomApiBaseUrl(tenantId);
            if (apiBaseUrl == null) {
                log.debug("租户{}未启用课堂，跳过排期事件推送: scheduleId={}, type={}", tenantId, scheduleId, eventType);
                return;
            }

            Map<String, Object> payload = buildEventPayload(tenantId, scheduleId, eventType);
            if (payload == null) {
                log.warn("排期事件载荷构建失败，跳过推送: scheduleId={}", scheduleId);
                return;
            }

            String token = jwtUtil.generateToken(tenantId, SYSTEM_PRINCIPAL, SYSTEM_PRINCIPAL);
            // 序列化只做一次：签名与发送必须用同一个字符串。
            // 若签名用 A 串、发送时 RestTemplate 再序列化出 B 串，对端按原文验签会恒失败。
            String json = objectMapper.writeValueAsString(payload);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(token);
            // 服务间调用鉴权（需求 4.4-3 / 9.4-3）：classroom-service 的 /schedules/events 不走 JWT，
            // 改为校验 HMAC —— 不签名就没法推事件，也挡住了「任意人伪造排期事件建课堂」。
            headers.set("X-Hmac-Signature", hmacVerifier.sign(json));
            HttpEntity<String> entity = new HttpEntity<>(json, headers);

            String eventUrl = apiBaseUrl + "/schedules/events";
            ResponseEntity<Map> resp = restTemplate.postForEntity(eventUrl, entity, Map.class);

            if (resp.getStatusCode().is2xxSuccessful()) {
                log.info("排期事件推送成功: scheduleId={}, type={}, url={}", scheduleId, eventType, eventUrl);
            } else {
                log.warn("排期事件推送返回非2xx: scheduleId={}, type={}, status={}", scheduleId, eventType, resp.getStatusCode());
            }
        } catch (Exception e) {
            log.warn("排期事件推送失败(已忽略): scheduleId={}, type={}, err={}", scheduleId, eventType, e.getMessage());
        }
    }

    /**
     * 构建事件载荷（与 classroom-service ScheduleEventReq 对齐）。
     */
    private Map<String, Object> buildEventPayload(Long tenantId, String scheduleId, String eventType) {
        CourseSchedule schedule = scheduleMapper.selectById(scheduleId);
        if (schedule == null) return null;

        Course course = courseMapper.selectById(schedule.getCourseId());
        if (course == null) return null;

        String teacherId = course.getTeacherId();
        String courseName = course.getCourseName();

        // 教师信息
        Map<String, Object> teacher = new HashMap<>();
        teacher.put("userId", teacherId);
        if (teacherId != null) {
            User teacherUser = userMapper.getByUserIdNoTenant(teacherId);
            if (teacherUser != null) {
                teacher.put("name", teacherUser.getName());
            }
        }

        // 学生列表（从预订表查占位学生）
        List<Booking> bookings = bookingMapper.selectList(
                Wrappers.<Booking>lambdaQuery().eq(Booking::getScheduleId, scheduleId));
        List<String> studentIds = bookings.stream()
                .map(Booking::getStudentId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        List<Map<String, Object>> students = new ArrayList<>();
        if (!studentIds.isEmpty()) {
            List<User> studentUsers = userMapper.listByIdsIgnoreTenant(studentIds);
            for (User u : studentUsers) {
                Map<String, Object> s = new HashMap<>();
                s.put("userId", u.getUserId());
                s.put("name", u.getName());
                students.add(s);
            }
        }

        // 事件 ID（幂等键）
        String eventId = "evt-" + scheduleId + "-" + eventType + "-" + System.currentTimeMillis();

        Map<String, Object> payload = new HashMap<>();
        payload.put("eventId", eventId);
        payload.put("eventType", eventType);
        payload.put("scheduleId", scheduleId);
        payload.put("courseId", schedule.getCourseId());
        payload.put("courseName", courseName);
        payload.put("teacher", teacher);
        payload.put("students", students);
        // 必须发 ISO-8601（带 T）：classroom-service 的 ScheduleEventReq 用 LocalDateTime 接收，
        // Jackson 默认只认 "yyyy-MM-dd'T'HH:mm:ss"。直接发库里的 "yyyy-MM-dd HH:mm:ss"
        // 会在对端解析失败 → 400 请求体格式错误（实测踩过：推送"成功返回非2xx"且课堂状态不动）。
        payload.put("startTime", toIsoDateTime(schedule.getStartTime()));
        payload.put("endTime", toIsoDateTime(schedule.getEndTime()));
        // duration 之前漏发，对端只能回落默认 60 分钟，导致 30 分钟的课被按 60 分钟封顶核算
        payload.put("duration", resolveDurationMinutes(schedule.getStartTime(), schedule.getEndTime()));
        // version 之前硬编码 1：对端的「按 version 丢弃旧事件」永远不生效（乱序必被覆盖）。
        // 用 epoch 秒作单调版本号（INT 列上限 2.1e9，1.79e9 安全），同秒内并发改期视为同版本。
        payload.put("version", (int) (System.currentTimeMillis() / 1000L));
        return payload;
    }

    /**
     * 把库里的 {@code yyyy-MM-dd HH:mm:ss} 归一为 {@code yyyy-MM-dd'T'HH:mm:ss}（ISO-8601）。
     * 已含 T 或带时区偏移的原样返回；null/空返回 null（由对端 @NotNull 校验报错，而不是这里静默造值）。
     */
    private String toIsoDateTime(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;
        if (s.indexOf('T') > 0 || s.endsWith("Z") || s.matches(".*[+-]\\d{2}:?\\d{2}$")) return s;
        s = s.replace(' ', 'T');
        // 只到分钟时补秒，保证两端格式一致
        if (s.length() == 16) s = s + ":00";
        return s;
    }

    /**
     * 课时时长（分钟）：优先由起止时间算，算不出来回落 60。
     * 不用 course_schedule.class_duration 是因为实体未映射该列（读不到），
     * 与其加字段不如按时间差推——排期的起止时间本来就是课时长度的真相。
     */
    private Integer resolveDurationMinutes(String start, String end) {
        try {
            if (start == null || end == null) return 60;
            LocalDateTime s = parseFlexible(start);
            LocalDateTime e = parseFlexible(end);
            if (s == null || e == null) return 60;
            long minutes = java.time.Duration.between(s, e).toMinutes();
            return minutes > 0 ? (int) minutes : 60;
        } catch (Exception ex) {
            return 60;
        }
    }

    private LocalDateTime parseFlexible(String raw) {
        String s = raw.trim();
        try {
            return LocalDateTime.parse(s.replace(' ', 'T'));
        } catch (Exception ignore) {
            try {
                return LocalDateTime.parse(s, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            } catch (Exception e2) {
                return null;
            }
        }
    }
}