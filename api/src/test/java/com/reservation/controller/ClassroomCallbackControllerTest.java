package com.reservation.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.reservation.common.Result;
import com.reservation.dto.AlertCallbackReq;
import com.reservation.dto.AttendanceCallbackReq;
import com.reservation.service.LessonAttendanceService;
import com.reservation.service.LessonSettlementService;
import com.reservation.utils.HmacVerifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import javax.crypto.spec.SecretKeySpec;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ClassroomCallbackController 单元测试：HMAC 原文验签 + 报文解析 + 落库委派。
 *
 * <p>重点回归「验签必须基于原始报文」这一条：旧实现先反序列化成 DTO 再重新序列化来验签，
 * 只要对方序列化的字段顺序/格式与本地 DTO 不同，签名就恒不匹配（线上表现是回调恒 403）。
 * 见 {@link #receiveAttendance_should_accept_raw_body_with_different_field_order()}。
 */
class ClassroomCallbackControllerTest {

    private ClassroomCallbackController controller;
    private HmacVerifier hmacVerifier;
    private ObjectMapper objectMapper;
    private LessonAttendanceService lessonAttendanceService;
    private LessonSettlementService settlementService;
    private final String testKeyBase64 = "Ip0fg8W0iUXc9Iuw/rcsL+DQ3UkJklcATNqjAtwZmMA=";

    @BeforeEach
    void setUp() throws Exception {
        hmacVerifier = new HmacVerifier();
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        lessonAttendanceService = mock(LessonAttendanceService.class);
        settlementService = mock(LessonSettlementService.class);
        // 结算编排在 S3 接入：这里只要不返回 null，控制器就会把它汇总进响应；
        // 扣减与状态推进的真实行为由 LessonDeductionServiceTest / 端到端冒烟覆盖。
        when(settlementService.settle(any(), any(), any(), anyBoolean(), any()))
                .thenAnswer(inv -> new LessonSettlementService.Outcome());

        controller = new ClassroomCallbackController(hmacVerifier, objectMapper, lessonAttendanceService, settlementService);

        Field keyField = HmacVerifier.class.getDeclaredField("hmacKey");
        keyField.setAccessible(true);
        keyField.set(hmacVerifier, new SecretKeySpec(Base64.getDecoder().decode(testKeyBase64), "HmacSHA256"));
    }

    private String attendanceJson() {
        return "{\"scheduleId\":\"sch-123\",\"courseId\":\"crs-456\",\"classroomStatus\":\"CLOSED\","
                + "\"actualStart\":\"2026-10-28T10:00:05\",\"actualEnd\":\"2026-10-28T11:00:02\","
                + "\"items\":[{\"userId\":\"s1\",\"role\":\"student\",\"attendanceStatus\":\"present\","
                + "\"checkInAt\":\"2026-10-28T10:00:10\",\"checkOutAt\":\"2026-10-28T11:00:02\","
                + "\"effectiveMinutes\":59}],\"consumptionVersion\":3}";
    }

    @Test
    @DisplayName("出勤回流：有效签名 → 200，且委派落库")
    void receiveAttendance_should_return_200_for_valid_signature() {
        String payload = attendanceJson();
        LessonAttendanceService.WritebackResult stats = new LessonAttendanceService.WritebackResult();
        stats.inserted = 1;
        when(lessonAttendanceService.writeback(any(AttendanceCallbackReq.class))).thenReturn(stats);

        Result<Map<String, Object>> result = controller.receiveAttendance(payload, hmacVerifier.sign(payload));

        assertEquals(200, result.getCode());
        assertNotNull(result.getData());
        assertEquals(1, result.getData().get("inserted"));
        assertEquals(true, result.getData().get("received"));
        verify(lessonAttendanceService).writeback(any(AttendanceCallbackReq.class));
    }

    @Test
    @DisplayName("出勤回流：字段顺序与本地 DTO 不同也必须验签通过（原始报文验签回归）")
    void receiveAttendance_should_accept_raw_body_with_different_field_order() {
        // 故意把键序打乱成与 DTO 声明顺序无关的形态；旧实现（反序列化后重序列化验签）在此必失败
        String payload = "{\"consumptionVersion\":1,\"items\":[],\"actualEnd\":\"2026-10-28T11:00:02\","
                + "\"scheduleId\":\"sch-123\",\"courseId\":\"crs-456\",\"classroomStatus\":\"CLOSED\","
                + "\"actualStart\":\"2026-10-28T10:00:05\"}";
        when(lessonAttendanceService.writeback(any(AttendanceCallbackReq.class)))
                .thenReturn(new LessonAttendanceService.WritebackResult());

        Result<Map<String, Object>> result = controller.receiveAttendance(payload, hmacVerifier.sign(payload));

        assertEquals(200, result.getCode(), "键序不同不应影响验签");
    }

    @Test
    @DisplayName("出勤回流：无效签名 → 403，且不得触达落库")
    void receiveAttendance_should_return_403_for_invalid_signature() {
        Result<Map<String, Object>> result = controller.receiveAttendance(attendanceJson(), "invalid-signature");

        assertEquals(403, result.getCode());
        assertEquals("签名验证失败", result.getMessage());
        verify(lessonAttendanceService, never()).writeback(any());
    }

    @Test
    @DisplayName("出勤回流：缺失签名头 → 403（而非 400 缺参）")
    void receiveAttendance_should_return_403_when_signature_missing() {
        Result<Map<String, Object>> result = controller.receiveAttendance(attendanceJson(), null);
        assertEquals(403, result.getCode());
        verify(lessonAttendanceService, never()).writeback(any());
    }

    @Test
    @DisplayName("出勤回流：签名正确但报文非法 → 400")
    void receiveAttendance_should_return_400_for_malformed_body() {
        String payload = "{not-a-json";
        Result<Map<String, Object>> result = controller.receiveAttendance(payload, hmacVerifier.sign(payload));
        assertEquals(400, result.getCode());
    }

    @Test
    @DisplayName("出勤回流：排期不存在 → 404（交由调用方重试/告警）")
    void receiveAttendance_should_return_404_when_schedule_missing() {
        String payload = attendanceJson();
        when(lessonAttendanceService.writeback(any(AttendanceCallbackReq.class)))
                .thenThrow(new IllegalArgumentException("排期不存在"));

        Result<Map<String, Object>> result = controller.receiveAttendance(payload, hmacVerifier.sign(payload));

        assertEquals(404, result.getCode());
        assertTrue(result.getMessage().contains("排期不存在"));
    }

    @Test
    @DisplayName("告警回调：有效签名 → 200")
    void receiveAlert_should_return_200_for_valid_signature() {
        AlertCallbackReq req = new AlertCallbackReq();
        req.setScheduleId("sch-123");
        req.setCourseId("crs-456");
        req.setSeverity("warning");
        req.setAlertType("teacher_absent");
        req.setMessage("教师未到");

        String payload;
        try {
            payload = objectMapper.writeValueAsString(req);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }

        Result<Void> result = controller.receiveAlert(payload, hmacVerifier.sign(payload));
        assertEquals(200, result.getCode());
    }

    @Test
    @DisplayName("告警回调：无效签名 → 403")
    void receiveAlert_should_return_403_for_invalid_signature() {
        Result<Void> result = controller.receiveAlert("{\"alertId\":\"alert-1\"}", "tampered");
        assertEquals(403, result.getCode());
    }
}
