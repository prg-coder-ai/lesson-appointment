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
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(token);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

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
        payload.put("startTime", schedule.getStartTime());
        payload.put("endTime", schedule.getEndTime());
        payload.put("version", 1);
        return payload;
    }
}