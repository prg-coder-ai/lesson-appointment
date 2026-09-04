// AI生成
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;
import java.util.UUID;

/**
 * 工业级 8 字节短标识符生成器 —— UUID + 服务器时间混合方案。
 *
 * <h2>设计原理</h2>
 * <pre>
 *   UUID v4 (122 bit 随机)  ─┐
 *   服务器时间 (毫秒+纳秒)  ─┤→ 拼接 24 字节 → SHA-256 → 取前 8 字节 → 可选附加 1 字节校验
 *   SecureRandom (补充熵)   ─┘
 * </pre>
 *
 * <h2>输出格式</h2>
 * <ul>
 *   <li>8 字节载荷 → 16 个十六进制字符</li>
 *   <li>8 字节载荷 + 1 字节校验 → 18 个十六进制字符</li>
 * </ul>
 *
 * <h2>线程安全</h2>
 * MessageDigest 使用 ThreadLocal 隔离；SecureRandom 本身线程安全。
 *
 * @author OfficeAce
 */
public final class TimeUuidShortId {

    /** 载荷字节数 */
    public static final int PAYLOAD_SIZE = 8;
    /** 校验字节数 */
    public static final int CHECKSUM_SIZE = 1;
    /** 总字节数（含校验） */
    public static final int TOTAL_SIZE = PAYLOAD_SIZE + CHECKSUM_SIZE;

    // 十六进制查表，避免每次 Character.digit 调用开销
    private static final char[] HEX_UPPER = "0123456789ABCDEF".toCharArray();
    private static final char[] HEX_LOWER = "0123456789abcdef".toCharArray();

    // ThreadLocal MessageDigest —— SHA-256 实例不可跨线程共享
    private static final ThreadLocal<MessageDigest> SHA256_TL =
            ThreadLocal.withInitial(() -> {
                try {
                    return MessageDigest.getInstance("SHA-256");
                } catch (NoSuchAlgorithmException e) {
                    // SHA-256 是 JCE 必备算法，理论上不会缺失
                    throw new IllegalStateException("SHA-256 algorithm not available", e);
                }
            });

    private TimeUuidShortId() {
        // 工具类，禁止实例化
    }

    // ==================== 生成 ====================

    /**
     * 生成带校验位的短 ID（18 个十六进制字符）。
     *
     * @return 18 字符的十六进制字符串，前 16 字符为载荷，后 2 字符为 XOR 校验
     */
    public static String generate() {
        return generate(true, false);
    }

    /**
     * 生成短 ID。
     *
     * @param withChecksum 是否附加 1 字节校验
     * @return 16 或 18 个十六进制字符
     */
    public static String generate(boolean withChecksum) {
        return generate(withChecksum, false);
    }

    /**
     * 生成短 ID（可指定大/小写）。
     *
     * @param withChecksum 是否附加校验位
     * @param uppercase    true=大写十六进制，false=小写
     * @return 十六进制字符串
     */
    public static String generate(boolean withChecksum, boolean uppercase) {
        byte[] payload = generatePayloadBytes();
        if (!withChecksum) {
            return encodeHex(payload, uppercase);
        }
        byte[] full = new byte[TOTAL_SIZE];
        System.arraycopy(payload, 0, full, 0, PAYLOAD_SIZE);
        full[PAYLOAD_SIZE] = xorChecksum(payload);
        return encodeHex(full, uppercase);
    }

    /**
     * 生成 8 字节原始载荷（不含校验）。
     *
     * @return 长度恒为 8 的字节数组
     */
    public static byte[] generatePayloadBytes() {
        // ---- 1. 采集服务器时间 ----
        long epochMillis = System.currentTimeMillis();   // 墙钟时间（毫秒）
        long nanoTime    = System.nanoTime();             // 高精度单调时钟（纳秒）

        // ---- 2. 生成 UUID v4 ----
        UUID uuid = UUID.randomUUID();
        long uuidMsb = uuid.getMostSignificantBits();
        long uuidLsb = uuid.getLeastSignificantBits();

        // ---- 3. 拼接 24 字节输入缓冲区 ----
        //   [0..7]   = UUID 高 64 bit
        //   [8..15]  = UUID 低 64 bit
        //   [16..23] = epochMillis ^ nanoTime（混合两个时间源）
        byte[] input = new byte[24];
        longToBytes(uuidMsb, input, 0);
        longToBytes(uuidLsb, input, 8);
        longToBytes(epochMillis ^ nanoTime, input, 16);

        // ---- 4. SHA-256 摘要，取前 8 字节 ----
        MessageDigest md = SHA256_TL.get();
        md.reset();
        byte[] digest = md.digest(input);

        byte[] payload = new byte[PAYLOAD_SIZE];
        System.arraycopy(digest, 0, payload, 0, PAYLOAD_SIZE);
        return payload;
    }

    // ==================== 校验 ====================

    /**
     * 验证带校验位的短 ID 是否合法。
     *
     * @param id 18 字符十六进制字符串
     * @return true=校验通过，false=校验失败或格式非法
     */
    public static boolean verify(String id) {
        Objects.requireNonNull(id, "id must not be null");
        byte[] bytes;
        try {
            bytes = decodeHex(id);
        } catch (IllegalArgumentException e) {
            return false;
        }
        if (bytes.length != TOTAL_SIZE) {
            return false;
        }
        byte[] payload = new byte[PAYLOAD_SIZE];
        System.arraycopy(bytes, 0, payload, 0, PAYLOAD_SIZE);
        return xorChecksum(payload) == bytes[PAYLOAD_SIZE];
    }

    /**
     * 从短 ID 中提取 8 字节载荷。
     *
     * @param id 16 或 18 字符十六进制字符串
     * @return 8 字节载荷
     * @throws IllegalArgumentException 格式非法时抛出
     */
    public static byte[] extractPayload(String id) {
        Objects.requireNonNull(id, "id must not be null");
        byte[] bytes = decodeHex(id);
        if (bytes.length != PAYLOAD_SIZE && bytes.length != TOTAL_SIZE) {
            throw new IllegalArgumentException(
                    "id length must be " + (PAYLOAD_SIZE * 2)
                            + " or " + (TOTAL_SIZE * 2)
                            + " hex chars, but got " + id.length());
        }
        byte[] payload = new byte[PAYLOAD_SIZE];
        System.arraycopy(bytes, 0, payload, 0, PAYLOAD_SIZE);
        return payload;
    }

    // ==================== 校验和计算 ====================

    /**
     * 计算 XOR 校验和（1 字节）。
     * <p>特性：检测任意单字节错误（100%）；检测随机多字节错误的概率 ≈ 99.6% (255/256)。
     *
     * @param payload 8 字节载荷
     * @return 校验字节
     */
    public static byte xorChecksum(byte[] payload) {
        Objects.requireNonNull(payload, "payload must not be null");
        if (payload.length != PAYLOAD_SIZE) {
            throw new IllegalArgumentException(
                    "payload must be " + PAYLOAD_SIZE + " bytes, got " + payload.length);
        }
        byte cs = 0;
        for (byte b : payload) {
            cs ^= b;
        }
        return cs;
    }

    /**
     * 计算 CRC-8 校验和（ATM 多项式 x⁸+x²+x+1，0x07）。
     * <p>比 XOR 更强：可检测所有 ≤8 bit 的突发错误（burst error）。
     *
     * @param payload 8 字节载荷
     * @return CRC-8 校验字节
     */
    public static byte crc8Checksum(byte[] payload) {
        Objects.requireNonNull(payload, "payload must not be null");
        if (payload.length != PAYLOAD_SIZE) {
            throw new IllegalArgumentException(
                    "payload must be " + PAYLOAD_SIZE + " bytes, got " + payload.length);
        }
        int crc = 0x00;
        for (byte b : payload) {
            crc ^= (b & 0xFF);
            for (int i = 0; i < 8; i++) {
                if ((crc & 0x80) != 0) {
                    crc = ((crc << 1) ^ 0x07) & 0xFF;
                } else {
                    crc = (crc << 1) & 0xFF;
                }
            }
        }
        return (byte) crc;
    }

    // ==================== 十六进制编解码 ====================

    /**
     * 字节数组 → 十六进制字符串。
     */
    public static String encodeHex(byte[] bytes, boolean uppercase) {
        char[] table = uppercase ? HEX_UPPER : HEX_LOWER;
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int v = bytes[i] & 0xFF;
            out[i * 2]     = table[v >>> 4];
            out[i * 2 + 1] = table[v & 0x0F];
        }
        return new String(out);
    }

    /**
     * 十六进制字符串 → 字节数组。
     *
     * @throws IllegalArgumentException 含非法字符或长度为奇数时抛出
     */
    public static byte[] decodeHex(String hex) {
        Objects.requireNonNull(hex, "hex string must not be null");
        int len = hex.length();
        if (len % 2 != 0) {
            throw new IllegalArgumentException("hex string must have even length, got " + len);
        }
        byte[] out = new byte[len / 2];
        for (int i = 0; i < out.length; i++) {
            int hi = hexCharToNibble(hex.charAt(i * 2));
            int lo = hexCharToNibble(hex.charAt(i * 2 + 1));
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }

    private static int hexCharToNibble(char c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        throw new IllegalArgumentException("invalid hex character: '" + c + "'");
    }

    // ==================== 工具方法 ====================

    /**
     * long → 8 字节（大端序），写入指定偏移。
     */
    private static void longToBytes(long value, byte[] buf, int offset) {
        buf[offset]     = (byte) (value >>> 56);
        buf[offset + 1] = (byte) (value >>> 48);
        buf[offset + 2] = (byte) (value >>> 40);
        buf[offset + 3] = (byte) (value >>> 32);
        buf[offset + 4] = (byte) (value >>> 24);
        buf[offset + 5] = (byte) (value >>> 16);
        buf[offset + 6] = (byte) (value >>> 8);
        buf[offset + 7] = (byte) value;
    }
}
