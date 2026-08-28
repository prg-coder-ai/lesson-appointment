package com.reservation.utils;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.Mac;

/**
 * 字段级加密工具：AES-GCM-256 加解密 + HMAC-SHA256 搜索索引
 *
 * 存储格式（复合格式）：<HMAC-SHA256(明文)十六进制> : <Base64(IV || 密文 || GCM-Tag)>
 * - 精确检索：用 HMAC 前缀匹配 WHERE field LIKE 'hmac:%'
 * - 模糊匹配：在 Java 内存中解密后 contains 过滤
 */
@Component
public class CryptoUtil {

    private static final String AES_GCM = "AES/GCM/NoPadding";
    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final int IV_LENGTH = 12;   // GCM 推荐 12 字节 nonce
    private static final int TAG_LENGTH = 16;  // GCM 认证标签 128 位
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
        if (aesBytes.length != 32) {
            throw new IllegalArgumentException("crypto.aes-key 解码后必须为 32 字节（AES-256）");
        }
        byte[] hmacBytes = Base64.getDecoder().decode(hmacKeyBase64);
        this.aesKey = new SecretKeySpec(aesBytes, "AES");
        this.hmacKey = new SecretKeySpec(hmacBytes, HMAC_SHA256);
    }

    /** AES-GCM 加密，返回 Base64(IV || 密文 || Tag) */
    public String encrypt(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_LENGTH];
            java.security.SecureRandom.getInstanceStrong().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(AES_GCM);
            cipher.init(Cipher.ENCRYPT_MODE, aesKey, new GCMParameterSpec(TAG_LENGTH * 8, iv));
            byte[] cipherText = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("AES-GCM 加密失败", e);
        }
    }

    /** AES-GCM 解密 */
    public String decrypt(String stored) {
        if (stored == null || stored.isEmpty()) {
            return stored;
        }
        String cipherPart = stripIndex(stored);
        if (cipherPart == null || cipherPart.isEmpty()) {
            return stored;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(cipherPart);
            if (combined.length <= IV_LENGTH) {
                return stored;
            }
            byte[] iv = new byte[IV_LENGTH];
            byte[] cipherText = new byte[combined.length - IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
            System.arraycopy(combined, IV_LENGTH, cipherText, 0, cipherText.length);
            Cipher cipher = Cipher.getInstance(AES_GCM);
            cipher.init(Cipher.DECRYPT_MODE, aesKey, new GCMParameterSpec(TAG_LENGTH * 8, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("AES-GCM 解密失败", e);
        }
    }

    /** HMAC-SHA256(明文) 十六进制 */
    public String searchIndex(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(hmacKey);
            byte[] raw = mac.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(raw);
        } catch (Exception e) {
            throw new RuntimeException("HMAC 计算失败", e);
        }
    }

    /** 生成复合格式：hmac:ciphertext */
    public String encryptWithIndex(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        return searchIndex(plaintext) + SEPARATOR + encrypt(plaintext);
    }

    /** 从复合格式中提取 HMAC 索引部分 */
    public static String extractIndex(String stored) {
        if (stored == null) {
            return null;
        }
        int idx = stored.indexOf(SEPARATOR);
        return idx > 0 ? stored.substring(0, idx) : null;
    }

    /** 从复合格式中提取密文部分 */
    public static String stripIndex(String stored) {
        if (stored == null) {
            return null;
        }
        int idx = stored.indexOf(SEPARATOR);
        return idx >= 0 ? stored.substring(idx + 1) : stored;
    }

    /** 判断字段是否为加密格式（含分隔符） */
    public static boolean isEncrypted(String stored) {
        return stored != null && stored.indexOf(SEPARATOR) > 0;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }
}