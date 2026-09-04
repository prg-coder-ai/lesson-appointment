// AI生成
import java.util.HashSet;
import java.util.Set;

/**
 * TimeUuidShortId 演示与基准测试。
 *
 * 运行：javac TimeUuidShortId.java TimeUuidShortIdDemo.java && java TimeUuidShortIdDemo
 */
public class TimeUuidShortIdDemo {

    public static void main(String[] args) {
        System.out.println("===== 1. 基本生成与验证 =====");
        for (int i = 0; i < 5; i++) {
            String id = TimeUuidShortId.generate();
            boolean ok = TimeUuidShortId.verify(id);
            System.out.printf("  ID=%s  verify=%s  len=%d%n", id, ok, id.length());
        }

        System.out.println();
        System.out.println("===== 2. 不带校验位 =====");
        String idNoCs = TimeUuidShortId.generate(false);
        System.out.println("  ID(无校验)=" + idNoCs + "  len=" + idNoCs.length());

        System.out.println();
        System.out.println("===== 3. 大写模式 =====");
        String idUpper = TimeUuidShortId.generate(true, true);
        System.out.println("  ID(大写)=" + idUpper + "  verify=" + TimeUuidShortId.verify(idUpper));

        System.out.println();
        System.out.println("===== 4. 篡改检测 =====");
        String original = TimeUuidShortId.generate();
        System.out.println("  原始: " + original + "  verify=" + TimeUuidShortId.verify(original));
        // 篡改最后一个字符（校验位）
        char[] tampered = original.toCharArray();
        tampered[tampered.length - 1] = (char) (tampered[tampered.length - 1] == '0' ? '1' : '0');
        String tamperedStr = new String(tampered);
        System.out.println("  篡改: " + tamperedStr + "  verify=" + TimeUuidShortId.verify(tamperedStr));

        System.out.println();
        System.out.println("===== 5. CRC-8 校验演示 =====");
        byte[] payload = TimeUuidShortId.generatePayloadBytes();
        byte xorCs = TimeUuidShortId.xorChecksum(payload);
        byte crcCs = TimeUuidShortId.crc8Checksum(payload);
        System.out.printf("  payload=%s  XOR=0x%02X  CRC8=0x%02X%n",
                TimeUuidShortId.encodeHex(payload, false),
                xorCs & 0xFF, crcCs & 0xFF);

        System.out.println();
        System.out.println("===== 6. 重复概率基准测试 =====");
        collisionBenchmark(100_000);
        collisionBenchmark(1_000_000);
    }

    /**
     * 碰撞检测基准：生成 N 个 ID，统计重复数。
     */
    private static void collisionBenchmark(int n) {
        Set<String> seen = new HashSet<>(n * 2);
        int collisions = 0;
        long start = System.nanoTime();
        for (int i = 0; i < n; i++) {
            String id = TimeUuidShortId.generate(false); // 不带校验，纯 8 字节
            if (!seen.add(id)) {
                collisions++;
            }
        }
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        System.out.printf("  N=%,d  collisions=%d  time=%dms  unique=%,d%n",
                n, collisions, elapsedMs, seen.size());
    }
}
