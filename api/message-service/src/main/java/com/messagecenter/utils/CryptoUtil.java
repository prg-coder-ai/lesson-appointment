package com.messagecenter.utils;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * AES-256-GCM 字段加密 + HMAC-SHA256 搜索索引（与主系统同算法同密钥，可互通）。
 * 存储格式：<hmac(64hex)>:<Base64(IV||密文||Tag)>
 */
@Slf4j
@Component
public class CryptoUtil {

    private static final String AES_GCM = "AES/GCM/NoPadding";
    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH = 16;
    private static final String SEPARATOR = ":";

    @Value("${crypto.aes-key}")
    private String aesKeyBase64;
    @Value("${crypto.hmac-key}")
    private String hmacKeyBase64;

    private SecretKeySpec aesKey;
    private SecretKeySpec hmacKey;

    @PostConstruct
    public void init() {
        byte[] aesBytes = Base64.getDecoder().decode(aesKeyBase64);
        if (aesBytes.length != 32) throw new IllegalArgumentException("crypto.aes-key 解码后必须为 32 字节");
        this.aesKey = new SecretKeySpec(aesBytes, "AES");
        this.hmacKey = new SecretKeySpec(Base64.getDecoder().decode(hmacKeyBase64), HMAC_SHA256);
    }

    public String encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_LENGTH];
            java.security.SecureRandom.getInstanceStrong().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(AES_GCM);
            cipher.init(Cipher.ENCRYPT_MODE, aesKey, new GCMParameterSpec(TAG_LENGTH * 8, iv));
            byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ct, 0, combined, iv.length, ct.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("AES-GCM 加密失败", e);
        }
    }

    public String decrypt(String stored) {
        if (stored == null || stored.isEmpty()) return stored;
        if (!isEncryptedFormat(stored)) return stored;
        try {
            byte[] combined = Base64.getDecoder().decode(stripIndex(stored));
            if (combined.length <= IV_LENGTH) return stored;
            byte[] iv = new byte[IV_LENGTH];
            byte[] ct = new byte[combined.length - IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
            System.arraycopy(combined, IV_LENGTH, ct, 0, ct.length);
            Cipher cipher = Cipher.getInstance(AES_GCM);
            cipher.init(Cipher.DECRYPT_MODE, aesKey, new GCMParameterSpec(TAG_LENGTH * 8, iv));
            return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("AES-GCM 解密失败，降级返回原值: {}", e.getMessage());
            return stored;
        }
    }

    public String searchIndex(String plaintext) {
        if (plaintext == null) return null;
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(hmacKey);
            return bytesToHex(mac.doFinal(plaintext.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException("HMAC 计算失败", e);
        }
    }

    public String encryptWithIndex(String plaintext) {
        if (plaintext == null) return null;
        return searchIndex(plaintext) + SEPARATOR + encrypt(plaintext);
    }

    private static boolean isEncryptedFormat(String stored) {
        if (stored == null) return false;
        int idx = stored.indexOf(SEPARATOR);
        if (idx <= 0) return false;
        String h = stored.substring(0, idx);
        if (h.length() != 64) return false;
        for (int i = 0; i < h.length(); i++) {
            char c = h.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
        }
        try { return Base64.getDecoder().decode(stored.substring(idx + 1)).length > IV_LENGTH; }
        catch (Exception e) { return false; }
    }

    public static String stripIndex(String stored) {
        if (stored == null) return null;
        int idx = stored.indexOf(SEPARATOR);
        return idx >= 0 ? stored.substring(idx + 1) : stored;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b & 0xff));
        return sb.toString();
    }
}
