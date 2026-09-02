// AI生成
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

/**
 * ShortIdGenerator — 基于 UUID v4 + 服务器时间戳生成 8 字节（64 bit）唯一标识符。
 *
 * <p>核心思路：
 * <pre>
 *   UUID(128 bit) ──XOR折叠──▶ 64 bit ──XOR timestamp──▶ 64 bit ──fmix64雪崩──▶ 8 字节 ID
 * </pre>
 *
 * <p>可选附加 1 字节 XOR 校验位（第 9 字节），用于传输/存储时的完整性检测。
 *
 * <h2>线程安全</h2>
 * 所有方法无共享可变状态，可安全并发调用。
 *
 * <h2>编码方案</h2>
 * <ul>
 *   <li>8 字节 ID → Base64Url 无填充 = 11 字符</li>
 *   <li>9 字节（含校验）→ Base64Url 无填充 = 12 字符</li>
 * </ul>
 *
 * @author OfficeAce
 */
public final class ShortIdGenerator {

    private ShortIdGenerator() {}

    // ────────────────── MurmurHash3 Finalizer 常量 ──────────────────
    private static final long FMIX_C1 = 0xff51afd7ed558ccdL;
    private static final long FMIX_C2 = 0xc4ceb9fe1a85ec53L;

    /**
     * MurmurHash3 64-bit finalizer（雪崩函数）。
     * <p>将输入每一位的变化均匀扩散到输出所有 64 位，消除 XOR 折叠后可能残留的结构性偏差。
     * 该函数是双射（可逆），不损失熵。
     */
    private static long fmix64(long h) {
        h ^= h >>> 33;
        h *= FMIX_C1;
        h ^= h >>> 33;
        h *= FMIX_C2;
        h ^= h >>> 33;
        return h;
    }

    // ═══════════════════════ 核心生成 ═══════════════════════

    /**
     * 生成 8 字节原始 ID（64 bit）。
     *
     * <p><b>算法步骤：</b>
     * <ol>
     *   <li>取 UUID v4 的 MSB ⊕ LSB，将 128 bit 随机性折叠为 64 bit</li>
     *   <li>异或当前毫秒时间戳，混入时序信息（约 41 bit 有效位）</li>
     *   <li>经 MurmurHash3 finalizer 雪崩扩散，输出均匀分布的 64 bit</li>
     * </ol>
     *
     * @return 8 字节数组（Big-Endian）
     */
    public static byte[] generate8Bytes() {
        UUID uuid = UUID.randomUUID();
        // 128→64 折叠：XOR 两半，保留 64 bit 熵
        long uuid64 = uuid.getMostSignificantBits() ^ uuid.getLeastSignificantBits();
        // 混入时间戳
        long timestamp = System.currentTimeMillis();
        long raw = uuid64 ^ timestamp;
        // 雪崩扩散
        long id = fmix64(raw);

        ByteBuffer bb = ByteBuffer.allocate(8);
        bb.putLong(id);
        return bb.array();
    }

    /**
     * 生成 9 字节 = 8 字节 ID + 1 字节 XOR 校验。
     *
     * @return 9 字节数组；前 8 字节为 ID，第 9 字节为校验
     */
    public static byte[] generate9Bytes() {
        byte[] id8 = generate8Bytes();
        byte checksum = xorChecksum(id8);
        byte[] result = new byte[9];
        System.arraycopy(id8, 0, result, 0, 8);
        result[8] = checksum;
        return result;
    }

    // ═══════════════════════ 校验 ═══════════════════════

    /**
     * XOR 校验：对全部字节做异或，输出 1 字节。
     * <p>性质：可检测任意奇数个比特翻转（单比特错误、奇数个字节损坏）。
     * 漏检率：偶数个比特错误时 1/256 ≈ 0.39%。
     *
     * @param data 待校验数据
     * @return 1 字节校验值
     */
    public static byte xorChecksum(byte[] data) {
        byte cs = 0;
        for (byte b : data) {
            cs ^= b;
        }
        return cs;
    }

    /**
     * 验证 9 字节数据的校验位是否正确。
     *
     * @param data9 9 字节数组（前 8 字节 ID + 第 9 字节校验）
     * @return {@code true} 表示校验通过
     */
    public static boolean verify(byte[] data9) {
        if (data9 == null || data9.length != 9) {
            return false;
        }
        byte expected = xorChecksum(Arrays.copyOf(data9, 8));
        return expected == data9[8];
    }

    // ═══════════════════════ 字符串编码 ═══════════════════════

    /**
     * 生成 Base64Url 编码的 8 字节 ID 字符串（无填充，11 字符）。
     * <p>URL 安全：仅含 [A-Za-z0-9_-]，无 '+' '/' '='。
     *
     * @return 11 字符的 Base64Url 字符串
     */
    public static String generateIdBase64() {
        byte[] id8 = generate8Bytes();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(id8);
    }

    /**
     * 生成带校验的 Base64Url 编码字符串（9 字节 → 12 字符，无填充）。
     *
     * @return 12 字符的 Base64Url 字符串（末尾隐含校验信息）
     */
    public static String generateIdWithChecksumBase64() {
        byte[] id9 = generate9Bytes();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(id9);
    }

    /**
     * 验证 Base64Url 编码的带校验 ID 字符串。
     *
     * @param encoded Base64Url 编码字符串
     * @return {@code true} 表示校验通过
     */
    public static boolean verifyBase64(String encoded) {
        if (encoded == null || encoded.isEmpty()) {
            return false;
        }
        byte[] decoded;
        try {
            decoded = Base64.getUrlDecoder().decode(encoded);
        } catch (IllegalArgumentException e) {
            return false;
        }
        return verify(decoded);
    }

    // ═══════════════════════ 提取子串 ═══════════════════════

    /**
     * 从 9 字节数据中提取 8 字节 ID 子串（去掉校验字节）。
     *
     * @param data9 9 字节数组
     * @return 8 字节 ID 子串；若输入非法则返回 null
     */
    public static byte[] extractId(byte[] data9) {
        if (data9 == null || data9.length != 9) {
            return null;
        }
        return Arrays.copyOf(data9, 8);
    }

    /**
     * 从带校验的 Base64Url 字符串中提取 ID 部分（前 8 字节重新编码）。
     *
     * @param encodedWithChecksum 12 字符 Base64Url 字符串
     * @return 11 字符的 ID Base64Url 字符串；若输入非法则返回 null
     */
    public static String extractIdBase64(String encodedWithChecksum) {
        if (encodedWithChecksum == null || encodedWithChecksum.isEmpty()) {
            return null;
        }
        byte[] decoded;
        try {
            decoded = Base64.getUrlDecoder().decode(encodedWithChecksum);
        } catch (IllegalArgumentException e) {
            return null;
        }
        byte[] id8 = extractId(decoded);
        if (id8 == null) {
            return null;
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(id8);
    }

    // ═══════════════════════ 演示 ═══════════════════════

    public static void main(String[] args) {
        System.out.println("════════ ShortIdGenerator 演示 ════════");

        // 1) 纯 8 字节 ID
        byte[] id8 = generate8Bytes();
        String idStr = generateIdBase64();
        System.out.println("8 字节 ID (hex)   : " + bytesToHex(id8));
        System.out.println("8 字节 ID (Base64): " + idStr);

        // 2) 带校验的 9 字节
        byte[] id9 = generate9Bytes();
        String id9Str = generateIdWithChecksumBase64();
        System.out.println("9 字节 ID (hex)   : " + bytesToHex(id9));
        System.out.println("9 字节 ID (Base64): " + id9Str);

        // 3) 验证
        System.out.println("验证 (正确数据)   : " + verify(id9));
        System.out.println("验证 (Base64)     : " + verifyBase64(id9Str));

        // 4) 篡改检测
        byte[] tampered = id9.clone();
        tampered[3] ^= 0x01; // 翻转 1 个比特
        System.out.println("验证 (篡改 1 bit) : " + verify(tampered));

        // 5) 子串提取
        byte[] extracted = extractId(id9);
        System.out.println("提取 ID 子串 (hex): " + bytesToHex(extracted));
        System.out.println("提取 ID (Base64)  : " + extractIdBase64(id9Str));

        // 6) 批量生成演示
        System.out.println("\n── 批量生成 5 个 ID ──");
        for (int i = 0; i < 5; i++) {
            System.out.println("  " + generateIdWithChecksumBase64());
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xFF));
        }
        return sb.toString();
    }
}
