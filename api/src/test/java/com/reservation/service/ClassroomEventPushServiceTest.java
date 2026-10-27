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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
import java.util.List;

import static org.mockito.Mockito.*;

/**
 * ClassroomEventPushService 单元测试。
 *
 * <p>验证核心行为：
 * <ul>
 *   <li>租户未启用课堂时静默跳过（不调用 RestTemplate）</li>
 *   <li>平台管理员（tenantId=0）不推送</li>
 *   <li>null scheduleId 不推送</li>
 * </ul>
 *
 * <p>不验证实际 HTTP 调用（需要 mock RestTemplate + server，留集成测试）。
 */
class ClassroomEventPushServiceTest {

    private ClassroomEventPushService service;
    private EclassroomService eclassroomService;
    private JwtUtil jwtUtil;
    private CourseScheduleMapper scheduleMapper;
    private CourseMapper courseMapper;
    private UserMapper userMapper;
    private BookingMapper bookingMapper;

    @BeforeEach
    void setUp() throws Exception {
        service = new ClassroomEventPushService();
        eclassroomService = mock(EclassroomService.class);
        jwtUtil = mock(JwtUtil.class);
        scheduleMapper = mock(CourseScheduleMapper.class);
        courseMapper = mock(CourseMapper.class);
        userMapper = mock(UserMapper.class);
        bookingMapper = mock(BookingMapper.class);

        inject("eclassroomService", eclassroomService);
        inject("jwtUtil", jwtUtil);
        inject("scheduleMapper", scheduleMapper);
        inject("courseMapper", courseMapper);
        inject("userMapper", userMapper);
        inject("bookingMapper", bookingMapper);
        inject("defaultBaseUrl", "http://localhost:8092");

        // init RestTemplate
        java.lang.reflect.Method init = ClassroomEventPushService.class.getDeclaredMethod("init");
        init.setAccessible(true);
        init.invoke(service);
    }

    private void inject(String fieldName, Object value) throws Exception {
        java.lang.reflect.Field f = ClassroomEventPushService.class.getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(service, value);
    }

    @Test
    @DisplayName("租户未启用课堂时 getTenantClassroomApiBaseUrl 返回 null，推送应静默跳过")
    void push_should_skip_when_classroom_not_enabled() {
        when(eclassroomService.getTenantClassroomApiBaseUrl(1001L)).thenReturn(null);
        // 直接调用 doPush 等价路径：pushAfterCommit 在无事务上下文时同步执行
        service.pushAfterCommit(1001L, "sch-123", "created");
        // 不应有任何 mapper 调用
        verifyNoInteractions(scheduleMapper, courseMapper, userMapper, bookingMapper);
    }

    @Test
    @DisplayName("平台管理员 tenantId=0 不推送")
    void push_should_skip_for_platform_admin() {
        service.pushAfterCommit(0L, "sch-123", "created");
        verifyNoInteractions(eclassroomService, scheduleMapper);
    }

    @Test
    @DisplayName("null scheduleId 不推送")
    void push_should_skip_for_null_schedule_id() {
        service.pushAfterCommit(1001L, null, "created");
        verifyNoInteractions(eclassroomService, scheduleMapper);
    }

    @Test
    @DisplayName("null tenantId 不推送")
    void push_should_skip_for_null_tenant_id() {
        service.pushAfterCommit(null, "sch-123", "created");
        verifyNoInteractions(eclassroomService, scheduleMapper);
    }
}