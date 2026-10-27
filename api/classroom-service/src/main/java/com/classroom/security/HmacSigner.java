package com.classroom.security;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 服务间 HMAC-SHA256 签名（回调预约系统时使用）。
 * 与主系统共享 crypto.hmac-key。
 */
@Component
public class HmacSigner {

    @Value("${crypto.hmac-key}")
    private String hmacKeyBase64;

    private SecretKeySpec hmacKey;

    @PostConstruct
    public void init() {
        this.hmacKey = new SecretKeySpec(Base64.getDecoder().decode(hmacKeyBase64), "HmacSHA256");
    }

    public String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(raw);
        } catch (Exception e) {
            throw new RuntimeException("HMAC 签名失败", e);
        }
    }

    public boolean verify(String payload, String signature) {
        String expected = sign(payload);
        return expected.equals(signature);
    }
}