package com.reservation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.User;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.UserMapper;
import com.reservation.utils.HmacVerifier;
import com.reservation.utils.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 多课次事件推送回归测试（2026-10-28）。
 *
 * <p>钉住三件一旦漂移就会「静默错账」的事：
 * <ol>
 *   <li>一个重复排期必须推 <b>N 条</b>事件（每课次一条），而不是只推第 1 课次——
 *       否则课堂侧只有 1 个课堂、1 条出勤，第 3 次与第 8 次无法区分，扣课时必然重复或漏扣。</li>
 *   <li>每条事件带<b>自己那一课次</b>的起止时间，且 eventId 逐课次唯一
 *       （课堂侧按 eventId 做幂等，同 id 的第 2..N 条会被当重复事件丢掉）。</li>
 *   <li>{@code cancelled} 只推 1 条且<b>不带</b> classIndex —— 语义是「整个排期全部取消」，
 *       课堂侧据此按前缀批量取消；逐课次发会让「改短后排期」多出来的课堂永远取消不掉。</li>
 * </ol>
 */
class ClassroomEventPushMultiInstanceTest {

    private ClassroomEventPushService service;
    private RestTemplate restTemplate;
    private CourseScheduleMapper scheduleMapper;

    /** 每周二 10:00，2026-11-03 ~ 11-17 → 3 个课次，单课 45 分钟 */
    private static CourseSchedule weekly() {
        CourseSchedule cs = new CourseSchedule();
        cs.setScheduleId("SCH-MULTI-0001");
        cs.setCourseId("COURSE-MULTI");
        cs.setTenantId(1001L);
        cs.setStartTime("2026-11-03 10:00:00");
        cs.setEndTime("2026-11-17 10:45:00");
        cs.setRepeatType(2);
        cs.setRepeatInterval(1);
        cs.setRepeatDays("2");
        cs.setTimeZone("Asia/Shanghai");
        cs.setClassDuration(45);
        return cs;
    }

    @BeforeEach
    void setUp() throws Exception {
        service = new ClassroomEventPushService();

        EclassroomService eclassroomService = mock(EclassroomService.class);
        JwtUtil jwtUtil = mock(JwtUtil.class);
        scheduleMapper = mock(CourseScheduleMapper.class);
        CourseMapper courseMapper = mock(CourseMapper.class);
        UserMapper userMapper = mock(UserMapper.class);
        BookingMapper bookingMapper = mock(BookingMapper.class);
        HmacVerifier hmacVerifier = mock(HmacVerifier.class);

        when(eclassroomService.getTenantClassroomApiBaseUrl(1001L)).thenReturn("http://classroom.test");
        when(jwtUtil.generateToken(anyLong(), anyString(), anyString())).thenReturn("tok");
        when(scheduleMapper.selectById("SCH-MULTI-0001")).thenReturn(weekly());

        Course course = new Course();
        course.setCourseId("COURSE-MULTI");
        course.setCourseName("英语口语");
        course.setTeacherId("T-1");
        when(courseMapper.selectById("COURSE-MULTI")).thenReturn(course);

        User teacher = new User();
        teacher.setUserId("T-1");
        teacher.setName("张老师");
        when(userMapper.getByUserIdNoTenant("T-1")).thenReturn(teacher);

        User stu = new User();
        stu.setUserId("S-1");
        stu.setName("李同学");
        when(userMapper.listByIdsIgnoreTenant(anyList())).thenReturn(List.of(stu));

        Booking b = new Booking();
        b.setScheduleId("SCH-MULTI-0001");
        b.setStudentId("S-1");
        when(bookingMapper.selectList(any())).thenReturn(List.of(b));

        when(hmacVerifier.sign(anyString())).thenReturn("sig");

        inject("eclassroomService", eclassroomService);
        inject("jwtUtil", jwtUtil);
        inject("scheduleMapper", scheduleMapper);
        inject("courseMapper", courseMapper);
        inject("userMapper", userMapper);
        inject("bookingMapper", bookingMapper);
        inject("hmacVerifier", hmacVerifier);
        inject("objectMapper", new ObjectMapper());
        inject("defaultBaseUrl", "http://classroom.test");

        java.lang.reflect.Method init = ClassroomEventPushService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(service);

        // RestTemplate 在 init() 里 new 出来，必须在 init 之后再换成 mock，
        // 否则「注入早于 init」会被覆盖，断言打在真 Http 连接上（本机没服务 → 全静默失败）。
        restTemplate = mock(RestTemplate.class);
        inject("restTemplate", restTemplate);
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(ResponseEntity.ok(new HashMap<String, Object>()));
    }

    private void inject(String fieldName, Object value) throws Exception {
        java.lang.reflect.Field f = ClassroomEventPushService.class.getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(service, value);
    }

    /** 抓下所有实际发出的报文体 */
    private List<JsonNode> captureBodies() throws Exception {
        ArgumentCaptor<HttpEntity> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate, atLeastOnce()).postForEntity(anyString(), captor.capture(), eq(Map.class));
        ObjectMapper om = new ObjectMapper();
        List<JsonNode> out = new ArrayList<>();
        for (HttpEntity<?> e : captor.getAllValues()) {
            out.add(om.readTree(String.valueOf(e.getBody())));
        }
        return out;
    }

    @Test
    @DisplayName("每周排期 created → 逐课次推 3 条，各带自己的起止时间与唯一 eventId")
    void createdPushesEveryInstance() throws Exception {
        service.pushAfterCommit(1001L, "SCH-MULTI-0001", "created");

        List<JsonNode> bodies = captureBodies();
        assertEquals(3, bodies.size(), "3 个课次 → 3 条事件，不能只推第 1 课次");

        String[] expectStart = {"2026-11-03T10:00:00", "2026-11-10T10:00:00", "2026-11-17T10:00:00"};
        String[] expectEnd = {"2026-11-03T10:45:00", "2026-11-10T10:45:00", "2026-11-17T10:45:00"};
        List<String> eventIds = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            JsonNode n = bodies.get(i);
            assertEquals(i + 1, n.get("classIndex").asInt(), "classIndex 从 1 递增");
            assertEquals(expectStart[i], n.get("startTime").asText(), "第" + (i + 1) + "课次开始时间");
            assertEquals(expectEnd[i], n.get("endTime").asText(), "第" + (i + 1) + "课次结束时间 = 开始 + duration");
            assertEquals(45, n.get("duration").asInt(), "单课时长随事件下发，别让对端回落 60");
            assertEquals(3, n.get("classCount").asInt(), "课次总数下发，供对端清理变少后多出来的课堂");
            assertEquals("SCH-MULTI-0001", n.get("scheduleId").asText());
            assertEquals(1001, n.get("tenantId").asInt(), "租户随事件下发，课堂侧不能再写死 0");
            assertEquals("英语口语", n.get("courseName").asText());
            assertEquals(1, n.get("students").size());
            eventIds.add(n.get("eventId").asText());
        }
        assertEquals(3, new java.util.HashSet<>(eventIds).size(),
                "eventId 必须逐课次唯一，否则对端幂等守卫会把第 2..N 课次当重复事件丢掉");
        for (int i = 0; i < 3; i++) {
            assertTrue(eventIds.get(i).endsWith("-c" + (i + 1)), "eventId 带课次后缀: " + eventIds.get(i));
        }
    }

    @Test
    @DisplayName("cancelled 只推 1 条且不带 classIndex（语义=整个排期全部取消）")
    void cancelledPushesOneWithoutClassIndex() throws Exception {
        service.pushAfterCommit(1001L, "SCH-MULTI-0001", "cancelled");

        List<JsonNode> bodies = captureBodies();
        assertEquals(1, bodies.size(), "整排期取消只发一条，按前缀批量取消");
        JsonNode n = bodies.get(0);
        assertTrue(n.get("classIndex") == null || n.get("classIndex").isNull(), "不带 classIndex");
        assertTrue(n.get("classCount") == null || n.get("classCount").isNull(), "取消事件不下发课次总数");
        assertEquals("cancelled", n.get("eventType").asText());
        assertEquals("SCH-MULTI-0001", n.get("scheduleId").asText());
    }

    @Test
    @DisplayName("排期行已删（deleteById 先删行后推取消）→ 取消事件仍要发出，否则课堂永久残留")
    void cancelledStillPushesWhenScheduleRowAlreadyDeleted() throws Exception {
        // deleteById / deleteByCourseId 都是「先删排期行，事务提交后再推 cancelled」，
        // 推的时候 selectById 必然为 null。此处若就此 return，删排期将永远取消不掉课堂——
        // 而删排期恰恰是最该取消课堂的场景。
        when(scheduleMapper.selectById("SCH-MULTI-0001")).thenReturn(null);

        service.pushAfterCommit(1001L, "SCH-MULTI-0001", "cancelled");

        List<JsonNode> bodies = captureBodies();
        assertEquals(1, bodies.size(), "排期行不在也必须把取消推出去");
        JsonNode n = bodies.get(0);
        assertEquals("cancelled", n.get("eventType").asText());
        assertEquals("SCH-MULTI-0001", n.get("scheduleId").asText());
        assertEquals(1001, n.get("tenantId").asInt(), "租户不能丢，课堂侧靠它定位归属");
        assertTrue(n.get("classIndex") == null || n.get("classIndex").isNull());
    }

    @Test
    @DisplayName("排期行已删时 created/updated 仍应跳过（拿不到课次信息，推了也是错的）")
    void createdSkippedWhenScheduleRowMissing() throws Exception {
        when(scheduleMapper.selectById("SCH-MULTI-0001")).thenReturn(null);

        service.pushAfterCommit(1001L, "SCH-MULTI-0001", "created");

        verifyNoInteractions(restTemplate);
    }

    @Test
    @DisplayName("排期改短（3 课次 → 2 课次）后 updated 事件带 classCount=2，供对端清理第 3 课次")
    void updatedCarriesNewClassCount() throws Exception {
        CourseSchedule shorter = weekly();
        shorter.setEndTime("2026-11-10 10:45:00");
        when(scheduleMapper.selectById("SCH-MULTI-0001")).thenReturn(shorter);

        service.pushAfterCommit(1001L, "SCH-MULTI-0001", "updated");

        List<JsonNode> bodies = captureBodies();
        assertEquals(2, bodies.size(), "改短后只剩 2 个课次");
        for (JsonNode n : bodies) {
            assertEquals(2, n.get("classCount").asInt(), "classCount 必须是新的 2，对端据此取消第 3 课次");
        }
        assertEquals("2026-11-10T10:00:00", bodies.get(1).get("startTime").asText());
    }

    @Test
    @DisplayName("课次展开失败（规则脏）→ 回落单次课，只推 1 条，不整批丢弃")
    void fallsBackToSingleWhenExpansionEmpty() throws Exception {
        CourseSchedule broken = weekly();
        broken.setStartTime(null);
        when(scheduleMapper.selectById("SCH-MULTI-0001")).thenReturn(broken);

        service.pushAfterCommit(1001L, "SCH-MULTI-0001", "created");

        List<JsonNode> bodies = captureBodies();
        assertEquals(1, bodies.size(), "算不出课次时至少保住第 1 个课堂");
        assertEquals(1, bodies.get(0).get("classIndex").asInt());
    }
}
