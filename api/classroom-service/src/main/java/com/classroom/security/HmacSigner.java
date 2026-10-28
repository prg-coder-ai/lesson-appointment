package com.classroom.security;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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

    /**
     * 校验签名。使用恒定时间比较（{@link MessageDigest#isEqual}）防时序侧信道，
     * 且空签名一律判失败——不要依赖调用方先判空。
     */
    public boolean verify(String payload, String signature) {
        if (payload == null || signature == null || signature.isEmpty()) {
            return false;
        }
        String expected = sign(payload);
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8));
    }
}