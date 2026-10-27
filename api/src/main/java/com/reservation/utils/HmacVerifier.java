package com.reservation.utils;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * HMAC-SHA256 签名验证工具。
 * 用于验证 classroom-service 回调请求的 X-Hmac-Signature 签名头。
 * 与 classroom-service 的 HmacSigner 共享同一 crypto.hmac-key 密钥。
 */
@Component
public class HmacVerifier {

    @Value("${crypto.hmac-key}")
    private String hmacKeyBase64;

    private SecretKeySpec hmacKey;

    @PostConstruct
    public void init() {
        this.hmacKey = new SecretKeySpec(Base64.getDecoder().decode(hmacKeyBase64), "HmacSHA256");
    }

    /**
     * 对 payload 计算 HMAC-SHA256 签名（Base64 编码）。
     */
    public String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(raw);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 签名计算失败", e);
        }
    }

    /**
     * 验证 payload 的签名是否匹配。
     * 使用恒定时间比较防止时序攻击。
     */
    public boolean verify(String payload, String signature) {
        if (signature == null || signature.isEmpty()) return false;
        String expected = sign(payload);
        return constantTimeEquals(expected, signature);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}