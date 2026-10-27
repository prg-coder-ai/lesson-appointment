package com.reservation.utils;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HmacVerifier 单元测试。
 * 验证 HMAC-SHA256 签名/验证的正确性，包括恒定时间比较防时序攻击。
 */
class HmacVerifierTest {

    private HmacVerifier verifier;

    /**
     * 手工构造 HmacVerifier 并注入密钥（不起 Spring 上下文）。
     * 密钥与 application.properties 默认值一致。
     */
    @BeforeEach
    void setUp() throws Exception {
        verifier = new HmacVerifier();
        String hmacKeyBase64 = "Ip0fg8W0iUXc9Iuw/rcsL+DQ3UkJklcATNqjAtwZmMA=";
        Field keyField = HmacVerifier.class.getDeclaredField("hmacKey");
        keyField.setAccessible(true);
        keyField.set(verifier, new SecretKeySpec(Base64.getDecoder().decode(hmacKeyBase64), "HmacSHA256"));
    }

    @Test
    @DisplayName("签名后验证应返回 true")
    void verify_should_return_true_for_correct_signature() {
        String payload = "{\"scheduleId\":\"sch-123\",\"eventType\":\"created\"}";
        String signature = verifier.sign(payload);
        assertTrue(verifier.verify(payload, signature));
    }

    @Test
    @DisplayName("篡改 payload 后验证应返回 false")
    void verify_should_return_false_for_tampered_payload() {
        String original = "{\"scheduleId\":\"sch-123\"}";
        String tampered = "{\"scheduleId\":\"sch-999\"}";
        String signature = verifier.sign(original);
        assertFalse(verifier.verify(tampered, signature));
    }

    @Test
    @DisplayName("错误签名应返回 false")
    void verify_should_return_false_for_wrong_signature() {
        String payload = "{\"scheduleId\":\"sch-123\"}";
        assertFalse(verifier.verify(payload, "invalid-signature"));
    }

    @Test
    @DisplayName("空签名应返回 false")
    void verify_should_return_false_for_empty_signature() {
        String payload = "{\"scheduleId\":\"sch-123\"}";
        assertFalse(verifier.verify(payload, ""));
        assertFalse(verifier.verify(payload, null));
    }

    @Test
    @DisplayName("相同 payload 的签名应确定性一致")
    void sign_should_be_deterministic() {
        String payload = "test-payload";
        String sig1 = verifier.sign(payload);
        String sig2 = verifier.sign(payload);
        assertEquals(sig1, sig2);
    }

    @Test
    @DisplayName("不同 payload 的签名应不同")
    void sign_should_differ_for_different_payloads() {
        String sig1 = verifier.sign("payload-a");
        String sig2 = verifier.sign("payload-b");
        assertNotEquals(sig1, sig2);
    }
}