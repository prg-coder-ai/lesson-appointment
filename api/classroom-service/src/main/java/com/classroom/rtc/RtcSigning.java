package com.classroom.rtc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * RTC 凭证签名工具（各 provider 共用）。
 *
 * <p>只做纯算法，不碰配置、不碰网络——便于单测与复用。
 */
final class RtcSigning {

    private RtcSigning() {}

    static byte[] hmac(String algorithm, String secret, String content) {
        try {
            Mac mac = Mac.getInstance(algorithm);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), algorithm));
            return mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("签名失败: " + algorithm, e);
        }
    }

    static byte[] hmacSha256(String secret, String content) {
        return hmac("HmacSHA256", secret, content);
    }

    static byte[] hmacSha1(String secret, String content) {
        return hmac("HmacSHA1", secret, content);
    }

    static String base64(byte[] raw) {
        return Base64.getEncoder().encodeToString(raw);
    }

    /** JWT 用的 base64url（无 padding） */
    static String base64Url(byte[] raw) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    static String base64Url(String text) {
        return base64Url(text.getBytes(StandardCharsets.UTF_8));
    }
}
