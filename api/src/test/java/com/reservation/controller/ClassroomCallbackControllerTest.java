package com.reservation.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.reservation.common.Result;
import com.reservation.dto.AttendanceCallbackReq;
import com.reservation.dto.AlertCallbackReq;
import com.reservation.utils.HmacVerifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.Arrays;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * ClassroomCallbackController 单元测试。
 *
 * <p>验证 HMAC 签名验证逻辑：
 * <ul>
 *   <li>有效签名 → 返回 code=200</li>
 *   <li>无效签名 → 返回 code=403</li>
 * </ul>
 */
class ClassroomCallbackControllerTest {

    private ClassroomCallbackController controller;
    private HmacVerifier hmacVerifier;
    private ObjectMapper objectMapper;
    private String testKeyBase64 = "Ip0fg8W0iUXc9Iuw/rcsL+DQ3UkJklcATNqjAtwZmMA=";

    @BeforeEach
    void setUp() throws Exception {
        controller = new ClassroomCallbackController();
        hmacVerifier = new HmacVerifier();
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        // 注入 HmacVerifier 密钥
        Field keyField = HmacVerifier.class.getDeclaredField("hmacKey");
        keyField.setAccessible(true);
        keyField.set(hmacVerifier, new SecretKeySpec(Base64.getDecoder().decode(testKeyBase64), "HmacSHA256"));

        // 注入依赖
        Field hvField = ClassroomCallbackController.class.getDeclaredField("hmacVerifier");
        hvField.setAccessible(true);
        hvField.set(controller, hmacVerifier);

        Field omField = ClassroomCallbackController.class.getDeclaredField("objectMapper");
        omField.setAccessible(true);
        omField.set(controller, objectMapper);
    }

    @Test
    @DisplayName("出勤回流：有效签名应返回 200")
    void receiveAttendance_should_return_200_for_valid_signature() throws Exception {
        AttendanceCallbackReq req = new AttendanceCallbackReq();
        req.setScheduleId("sch-123");
        req.setClassroomId("cls-456");
        req.setStartTime(LocalDateTime.of(2026, 10, 28, 10, 0));
        req.setEndTime(LocalDateTime.of(2026, 10, 28, 11, 0));

        String payload = objectMapper.writeValueAsString(req);
        String signature = hmacVerifier.sign(payload);

        Result<Void> result = controller.receiveAttendance(req, signature);
        assertEquals(200, result.getCode());
    }

    @Test
    @DisplayName("出勤回流：无效签名应返回 403")
    void receiveAttendance_should_return_403_for_invalid_signature() {
        AttendanceCallbackReq req = new AttendanceCallbackReq();
        req.setScheduleId("sch-123");

        Result<Void> result = controller.receiveAttendance(req, "invalid-signature");
        assertEquals(403, result.getCode());
        assertEquals("签名验证失败", result.getMessage());
    }

    @Test
    @DisplayName("告警回调：有效签名应返回 200")
    void receiveAlert_should_return_200_for_valid_signature() throws Exception {
        AlertCallbackReq req = new AlertCallbackReq();
        req.setAlertId("alert-1");
        req.setScheduleId("sch-123");
        req.setLevel("warning");
        req.setAlertType("device_failure");
        req.setMessage("摄像头离线");
        req.setAlertTime(LocalDateTime.now());

        String payload = objectMapper.writeValueAsString(req);
        String signature = hmacVerifier.sign(payload);

        Result<Void> result = controller.receiveAlert(req, signature);
        assertEquals(200, result.getCode());
    }

    @Test
    @DisplayName("告警回调：无效签名应返回 403")
    void receiveAlert_should_return_403_for_invalid_signature() {
        AlertCallbackReq req = new AlertCallbackReq();
        req.setAlertId("alert-1");

        Result<Void> result = controller.receiveAlert(req, "tampered");
        assertEquals(403, result.getCode());
    }
}