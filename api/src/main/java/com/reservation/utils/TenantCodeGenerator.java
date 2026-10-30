package com.reservation.utils;

import java.security.SecureRandom;
import java.util.Set;

/**
 * 租户编码生成器（8 字符短码，便于传播/分享/手输）。
 *
 * <p><b>组合数要按 29 而不是 54 来算</b>：库的排序规则是 {@code utf8mb4_general_ci}
 * （大小写不敏感），{@code K} 与 {@code k} 视为同一字符。字符集 54 个里大小写一一对应，
 * 等价后有效字符 = 8 个数字 + 21 个字母 = 29 个，即 {@code 29^8 ≈ 5.0×10^11} 种。
 * （早前方案写作 {@code 54^8 ≈ 7.2×10^13}，高估约 144 倍。）
 * 结论不变：1 万租户时碰撞概率约 1×10^-4，重试 10 次后可忽略。
 *
 * <p>去掉了易混淆字符 {@code 0/O}、{@code 1/I/l}。
 */
public final class TenantCodeGenerator {

    /** 去除 0/O、1/I/l 后的字符集。 */
    private static final char[] CHARS =
            "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ".toCharArray();

    private static final int DEFAULT_LENGTH = 8;

    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * 保留字：这些值有特殊语义，绝不能被随机生成出来当租户编码。
     * {@code platform} 尤其关键 —— {@code UserService.fillOrgName} 靠
     * {@code tenant_code = 'platform'} 定位平台自身行（真库 id=11），
     * 一旦被覆盖，平台管理员的「所属公司」映射就会失效。
     */
    public static final Set<String> RESERVED = Set.of("platform", "default");

    private TenantCodeGenerator() {
    }

    public static String generate() {
        return generate(DEFAULT_LENGTH);
    }

    public static String generate(int length) {
        int n = length <= 0 ? DEFAULT_LENGTH : length;
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(CHARS[RANDOM.nextInt(CHARS.length)]);
        }
        return sb.toString();
    }

    /** 是否撞保留字（大小写不敏感）。 */
    public static boolean isReserved(String code) {
        return code != null && RESERVED.contains(code.toLowerCase());
    }
}
