package com.reservation.service;

import com.reservation.common.ScheduleInstances;
import com.reservation.dto.ScheduleVO;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.User;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.JwtUtil;
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
 * <p><b>按课次推送</b>（2026-10-28）：一个排期会按重复规则展开成 N 个课次，
 * 课堂也必须按课次建（{@code scheduleId~classIndex}）。否则一个每周排期只有 1 个课堂、
 * 1 条出勤，第 3 次与第 8 次无法区分，扣课时必然重复或漏扣。
 * 本服务对 {@code created}/{@code updated} 逐课次发一条事件，事件里带
 * {@code classIndex} 与**该课次自己的**起止时间；{@code cancelled} 只发一条且不带 classIndex，
 * 语义是「整个排期的所有课次都取消」（课堂侧据此批量取消，见 {@code ScheduleEventConsumer}）。
 *
 * <p><b>动态服务发现</b>：classroom-service 地址从 sys_tenant_eclassroom 表动态查询，
 * 不硬编码。租户未启用课堂时静默跳过（best-effort）。
 *
 * <p><b>事务安全</b>：{@link #pushAfterCommit} 在事务提交后才触发推送，
 * 避免 classroom-service 收到事件但读不到落库数据。
 *
 * <p><b>鉴权</b>：JWT（共享 jwt.secret，system 身份）+ 报文 HMAC 签名。
 *
 * <p><b>失败策略</b>：best-effort，失败仅记日志不抛异常（不阻塞主业务流程）。
 */
@Service
public class ClassroomEventPushService {

    private static final Logger log = LoggerFactory.getLogger(ClassroomEventPushService.class);
    private static final String SYSTEM_PRINCIPAL = "system";
    /** 事件载荷的时间格式：ISO-8601（对端用 LocalDateTime 接收，只认带 T 的形态） */
    private static final DateTimeFormatter ISO_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

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

            CourseSchedule schedule = scheduleMapper.selectById(scheduleId);

            String token = jwtUtil.generateToken(tenantId, SYSTEM_PRINCIPAL, SYSTEM_PRINCIPAL);

            // 取消：只发一条、不带 classIndex = 「该排期所有课次一并取消」。
            // 若也逐个课次发，就得依赖「本侧算出的课次数 == 课堂侧已建课次数」，
            // 而排期规则一改（例如从 10 周改成 5 周）两者必然不等，
            // 多出来的课堂将永远取消不掉——孤儿课堂会一直挂在监控列表里。
            if ("cancelled".equals(eventType)) {
                // 取消**不能依赖排期行**：deleteById / deleteByCourseId 都是「先删行、事务提交后再推取消」，
                // 等推的时候行已经没了。若此处因查不到排期就 return，删除排期将永远取消不掉课堂——
                // 而「删排期」恰恰是最该取消课堂的场景（课堂留在监控列表里没人管）。
                // 行在就用完整载荷（便于对账），行不在就退到最小载荷（只要 scheduleId + tenantId）。
                Map<String, Object> base = schedule == null ? null : buildEventPayload(tenantId, schedule, eventType);
                if (base == null) {
                    base = minimalCancelPayload(tenantId, scheduleId);
                }
                sendOne(apiBaseUrl, token, base, null, null, null, null);
                return;
            }

            if (schedule == null) {
                log.warn("排期不存在，跳过课堂事件推送: scheduleId={}", scheduleId);
                return;
            }

            Map<String, Object> base = buildEventPayload(tenantId, schedule, eventType);
            if (base == null) return;

            int duration = ScheduleInstances.durationMinutes(schedule);
            List<ScheduleVO> instances = ScheduleInstances.expand(schedule);
            if (instances.isEmpty()) {
                // 规则不完整/解析失败：回落为「单次课」。宁可只建第 1 个课堂，
                // 也不能因为算不出课次就把整条排期的课堂全丢掉。
                String start = toIsoDateTime(schedule.getStartTime());
                String end = toIsoDateTime(schedule.getEndTime());
                sendOne(apiBaseUrl, token, base, 1, start,
                        end == null ? start : end, 1);
                log.info("排期事件按单次课推送(课次展开为空): scheduleId={}, type={}", scheduleId, eventType);
                return;
            }

            int total = instances.size();
            int sent = 0;
            for (int i = 0; i < total; i++) {
                LocalDateTime startAt;
                try {
                    startAt = ScheduleInstances.localDateTime(instances.get(i));
                } catch (Exception ex) {
                    // 单个课次时间非法只跳过这一条，不拖垮同一排期的其余课次
                    log.warn("课次时间非法，跳过该课次推送: scheduleId={}, classIndex={}, err={}",
                            scheduleId, i + 1, ex.getMessage());
                    continue;
                }
                String start = startAt.format(ISO_DT);
                String end = startAt.plusMinutes(duration).format(ISO_DT);
                // classCount 一并下发：课堂侧据此清理「课次数变少」后多出来的课堂
                if (sendOne(apiBaseUrl, token, base, i + 1, start, end, total)) sent++;
            }
            log.info("排期事件多课次推送完成: scheduleId={}, type={}, 课次={}, 成功={}, 单课时长={}min",
                    scheduleId, eventType, total, sent, duration);
        } catch (Exception e) {
            log.warn("排期事件推送失败(已忽略): scheduleId={}, type={}, err={}", scheduleId, eventType, e.getMessage());
        }
    }

    /**
     * 投递一条事件。
     *
     * @param classIndex 课次序号；null 表示「不指定课次」（仅 cancelled 使用）
     * @param classCount 该排期的课次总数；null 表示不告知
     * @return 是否 2xx 成功
     */
    private boolean sendOne(String apiBaseUrl, String token, Map<String, Object> base,
                            Integer classIndex, String startTime, String endTime, Integer classCount) {
        try {
            Map<String, Object> payload = new HashMap<>(base);
            // eventId 必须逐课次唯一，否则课堂侧的幂等守卫（Redis eventId）会把第 2..N 课次当成重复事件丢掉
            payload.put("eventId", base.get("eventId") + (classIndex == null ? "" : "-c" + classIndex));
            if (classIndex != null) payload.put("classIndex", classIndex);
            if (startTime != null) payload.put("startTime", startTime);
            if (endTime != null) payload.put("endTime", endTime);
            if (classCount != null) payload.put("classCount", classCount);

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
                log.debug("排期事件投递成功: classIndex={}, url={}", classIndex, eventUrl);
                return true;
            }
            log.warn("排期事件投递返回非2xx: classIndex={}, status={}", classIndex, resp.getStatusCode());
            return false;
        } catch (Exception e) {
            log.warn("排期事件投递失败: classIndex={}, err={}", classIndex, e.getMessage());
            return false;
        }
    }

    /**
     * 构建事件载荷的公共部分（与 classroom-service ScheduleEventReq 对齐）。
     * 起止时间与 classIndex 由 {@link #sendOne} 按课次补入。
     */
    private Map<String, Object> buildEventPayload(Long tenantId, CourseSchedule schedule, String eventType) {
        String scheduleId = schedule.getScheduleId();

        Course course = courseMapper.selectById(schedule.getCourseId());
        if (course == null) {
            log.warn("课程不存在，跳过课堂事件推送: scheduleId={}, courseId={}", scheduleId, schedule.getCourseId());
            return null;
        }

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

        // 事件 ID 前缀（幂等键）：逐课次在 sendOne 里加 -cN 后缀
        String eventId = "evt-" + scheduleId + "-" + eventType + "-" + System.currentTimeMillis();

        Map<String, Object> payload = new HashMap<>();
        payload.put("eventId", eventId);
        payload.put("eventType", eventType);
        payload.put("scheduleId", scheduleId);
        // 租户必须随事件下发：修复前课堂侧写死 tenantId=0，租户管理员按租户查监控列表恒空，
        // 且课堂归属校验没有依据（A 租户 token 可读 B 租户课堂）。租户以排期行反查的为准。
        payload.put("tenantId", schedule.getTenantId() != null ? schedule.getTenantId() : tenantId);
        payload.put("courseId", schedule.getCourseId());
        payload.put("courseName", courseName);
        payload.put("teacher", teacher);
        payload.put("students", students);
        // duration 之前漏发，对端只能回落默认 60 分钟，导致 30 分钟的课被按 60 分钟封顶核算。
        // 现在取 class_duration（单课时长）；拿不到时按当天时刻差推算。
        payload.put("duration", ScheduleInstances.durationMinutes(schedule));
        // version 之前硬编码 1：对端的「按 version 丢弃旧事件」永远不生效（乱序必被覆盖）。
        // 用 epoch 秒作单调版本号（INT 列上限 2.1e9，1.79e9 安全），同秒内并发改期视为同版本。
        payload.put("version", (int) (System.currentTimeMillis() / 1000L));
        return payload;
    }

    /**
     * 最小取消载荷（排期行已删时）。
     *
     * <p>整排期取消在课堂侧只需要 {@code scheduleId} 与 {@code tenantId}；
     * 课程、教师、起止时间都不参与 {@code handleCancelled} 的判定。
     * 对端按 {@code CancelGroup} 校验，这几个字段缺失不会被拒。
     */
    private Map<String, Object> minimalCancelPayload(Long tenantId, String scheduleId) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("eventId", "evt-" + scheduleId + "-cancelled-" + System.currentTimeMillis());
        payload.put("eventType", "cancelled");
        payload.put("scheduleId", scheduleId);
        payload.put("tenantId", tenantId);
        payload.put("version", (int) (System.currentTimeMillis() / 1000L));
        return payload;
    }

    /**
     * 把库里的 {@code yyyy-MM-dd HH:mm:ss} 归一为 {@code yyyy-MM-dd'T'HH:mm:ss}（ISO-8601）。
     * 已含 T 或带时区偏移的原样返回；null/空返回 null。
     */
    private String toIsoDateTime(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;
        if (s.indexOf('T') > 0 || s.endsWith("Z") || s.matches(".*[+-]\\d{2}:?\\d{2}$")) return s;
        s = s.replace(' ', 'T');
        if (s.length() == 16) s = s + ":00";
        return s;
    }
}
