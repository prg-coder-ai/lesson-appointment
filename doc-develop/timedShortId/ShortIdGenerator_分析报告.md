# 基于 UUID + 服务器时间的 8 字节 ID 生成方案

> 生成 8 字节（64 bit）唯一标识符，可选附加 1 字节 XOR 校验。  
> 包含子串产生、验证的工业级 Java 编码及重复概率分析。

---

## 一、算法设计

### 1.1 流水线

```
UUID v4 (128 bit) ──XOR折叠──▶ 64 bit ──XOR timestamp──▶ 64 bit ──fmix64雪崩──▶ 8 字节 ID
                                                                              │
                                                                     [+1 字节 XOR 校验] ──▶ 9 字节
```

### 1.2 步骤说明

| 步骤 | 操作 | 作用 |
|------|------|------|
| ① XOR 折叠 | `uuid.MSB ⊕ uuid.LSB` | 128→64 bit，保留 64 bit 随机熵 |
| ② 混入时间戳 | `⊕ System.currentTimeMillis()` | 加入时序信息，防止同毫秒内 UUID 弱随机时退化 |
| ③ 雪崩扩散 | MurmurHash3 finalizer | 消除残留结构，输出均匀分布；双射不丢熵 |
| ④ XOR 校验 | 8 字节逐字节异或 → 1 字节 | 检测传输/存储中的奇数比特翻转 |

### 1.3 编码方案

| 数据 | 编码 | 字符数 |
|------|------|--------|
| 8 字节 ID | Base64Url 无填充 | 11 字符 |
| 9 字节（含校验） | Base64Url 无填充 | 12 字符 |

Base64Url 仅含 `[A-Za-z0-9_-]`，无 `+` `/` `=`，URL/文件名安全。

---

## 二、工业级 Java 代码

```java
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
 * @author OfficeAce
 */
public final class ShortIdGenerator {

    private ShortIdGenerator() {}

    // ────────────────── MurmurHash3 Finalizer 常量 ──────────────────
    private static final long FMIX_C1 = 0xff51afd7ed558ccdL;
    private static final long FMIX_C2 = 0xc4ceb9fe1a85ec53L;

    /**
     * MurmurHash3 64-bit finalizer（雪崩函数）。
     * 将输入每一位的变化均匀扩散到输出所有 64 位，消除 XOR 折叠后可能残留的结构性偏差。
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
     * URL 安全：仅含 [A-Za-z0-9_-]，无 '+' '/' '='。
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
```

### API 一览

| 方法 | 功能 |
|------|------|
| `generate8Bytes()` | 生成 8 字节原始 ID |
| `generate9Bytes()` | 生成 9 字节（含 XOR 校验） |
| `xorChecksum(byte[])` | 计算 XOR 校验字节 |
| `verify(byte[])` | 验证 9 字节数据校验位 |
| `generateIdBase64()` | 生成 11 字符 Base64Url 字符串 |
| `generateIdWithChecksumBase64()` | 生成 12 字符带校验 Base64Url |
| `verifyBase64(String)` | 验证 Base64Url 编码的带校验 ID |
| `extractId(byte[])` | 从 9 字节提取 8 字节 ID 子串 |
| `extractIdBase64(String)` | 从带校验字符串提取 ID 子串 |

---

## 三、重复概率分析

### 3.1 输出空间

8 字节 = **64 bit**，输出空间大小 = $2^{64} \approx 1.844 \times 10^{19}$。

### 3.2 有效熵

| 来源 | 原始熵 | 折叠后 |
|------|--------|--------|
| UUID v4 随机位 | 122 bit | XOR 折叠后保留 **64 bit** |
| 时间戳（毫秒） | ~41 bit | XOR 混入不增加独立熵，但提供退化保护 |
| fmix64 | — | 双射变换，熵守恒 |
| **总有效熵** | | **64 bit** |

> **关键**：XOR 时间戳不增加独立熵（它是可预测的常量），但若 UUID 的 PRNG 退化（如种子弱），时间戳可作为兜底熵源。

### 3.3 生日悖论碰撞概率

生成 $n$ 个 ID 后，至少发生一次碰撞的概率：

$$P(n) \approx 1 - e^{-n^2 / (2 \times 2^{64})}$$

| 生成量 $n$ | 碰撞概率 $P$ | 评价 |
|------------|-------------|------|
| 1,000 | $2.7 \times 10^{-14}$ | 可忽略 |
| 100 万 | $2.7 \times 10^{-8}$ | 极低 |
| 1,000 万 | $2.7 \times 10^{-6}$ | 很低 |
| 1 亿 | $2.7 \times 10^{-4}$（0.027%） | 安全 |
| **10 亿** | **2.7%** | 可接受 |
| $2^{32} \approx$ 43 亿 | **39%** | 临界点 |
| $2^{32.5} \approx$ 61 亿 | **50%** | 生日边界 |
| 100 亿 | 93% | 高风险 |

### 3.4 校验字节的作用

校验字节是前 8 字节的确定性函数，**不增加熵**，因此不改变碰撞概率。其价值在于：

- **检错**：可检测任意奇数个比特翻转（单比特错误必检出）
- **漏检率**：偶数个比特错误时为 $1/256 \approx 0.39\%$
- **场景**：传输损坏、存储介质错误、人工录入校验

### 3.5 时间戳的实际意义

XOR 混入时间戳后，两个 ID 碰撞的条件为 $u_1 \oplus u_2 = t_1 \oplus t_2$。由于 $u_1, u_2$ 独立随机，$u_1 \oplus u_2$ 均匀分布于 $2^{64}$，因此**任意时间对碰撞概率仍为 $1/2^{64}$**——时间戳不改变理论碰撞率。

但实际工程价值在于：

1. UUID PRNG 退化时的兜底
2. 序列非连续，抗猜测
3. 不同时间生成的 ID 在 fmix 前必然不同（除非 UUID 差恰好抵消时间差）

### 3.6 与其他方案对比

| 方案 | 输出长度 | 有效熵 | 50% 碰撞边界 | 适用场景 |
|------|---------|--------|-------------|---------|
| 4 字节（32 bit） | 4B | 32 bit | 65,536 | 小规模临时 ID |
| **本方案（8 字节）** | **8B** | **64 bit** | **~43 亿** | **中大规模业务 ID** |
| 12 字节（96 bit） | 12B | 96 bit | ~$6 \times 10^{13}$ | 大规模分布式 |
| 完整 UUID（128 bit） | 16B | 122 bit | ~$5 \times 10^{18}$ | 几乎不碰撞 |

### 3.7 工程建议

- **生成量 < 1 亿**：8 字节方案完全安全（碰撞概率 < 0.03%）
- **生成量 1~10 亿**：可用但建议监控碰撞；或升至 12 字节
- **生成量 > 43 亿**：必须升级到 128 bit UUID 或雪花算法
- 校验字节建议在**跨网络传输 / 持久化前附加**，本地内存传递可省略

---

## 四、运行示例

编译运行 `main()` 方法后预期输出：

```
════════ ShortIdGenerator 演示 ════════
8 字节 ID (hex)   : a3f2b1c84e7d9012
8 字节 ID (Base64): o_K3KE53kBI
9 字节 ID (hex)   : 5b8e1a3f0c72d49e21
9 字节 ID (Base64): W44aPwxy1J4h
验证 (正确数据)   : true
验证 (Base64)     : true
验证 (篡改 1 bit) : false
提取 ID 子串 (hex): 5b8e1a3f0c72d49e
提取 ID (Base64)  : W44aPwxy1J4
── 批量生成 5 个 ID ──
  rT9x_mQKpL2n
  fE4wA7bR3sVx
  kM1nT6cY8dZp
  hL2oP5gW9eXr
  qN3vB8jS4tUw
```

> 注：每次运行结果不同（随机生成），以上为示意。

---

*生成时间：2026-09-01 | 作者：OfficeAce*
