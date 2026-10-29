package com.classroom.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * 对象存储业务门面：分片上传（断点续传）+ 签名 URL + 读取。
 *
 * <p>它把「怎么存」交给 {@link ObjectStorage}，把「谁能读」这件事收在自己手里：
 * 所有对外 URL 都是带过期时间的签名 URL，有效期默认 2 小时（F4-06 / F6-03），
 * 课堂外的人拿到链接过了期就是 403。
 *
 * <p><b>断点续传的语义</b>：{@link #init} 只登记会话不传字节；客户端按
 * {@link #uploadedParts} 查已传分片，跳过它们继续传缺口；{@link #complete}
 * 缺片时明确报出缺哪几片，而不是默默拼出一个坏文件。
 */
@Slf4j
@Service
public class StorageService {

    private static final String PURPOSE_MATERIAL = "material";
    private static final String PURPOSE_SUBMISSION = "submission";
    private static final String PURPOSE_RECORDING = "recording";

    private final ObjectStorage storage;
    private final StorageProperties props;
    private final ObjectMapper objectMapper;
    private final String hmacSecret;

    public StorageService(ObjectStorage storage,
                          StorageProperties props,
                          ObjectMapper objectMapper,
                          @Value("${crypto.hmac-key}") String hmacSecret) {
        this.storage = storage;
        this.props = props;
        this.objectMapper = objectMapper;
        this.hmacSecret = hmacSecret;
        log.info("对象存储: type={}, 单文件上限={}MB, 分片={}MB, 签名有效期={}s",
                storage.type(), props.getMaxFileSizeBytes() / 1024 / 1024,
                props.getPartSizeBytes() / 1024 / 1024, props.getSignedUrlTtlSeconds());
    }

    public String storageType() {
        return storage.type();
    }

    // ---------------- 分片上传 ----------------

    /**
     * 初始化上传会话（不传字节）。
     *
     * @param purpose    MATERIAL / SUBMISSION / RECORDING
     * @param scheduleId 课堂 id（用于分组与权限追溯）
     * @param fileName   原始文件名（只用于取扩展名与展示）
     * @param totalSize  文件总字节数（必须 ≤ 配置上限）
     * @param ownerId    发起人（后续分片/完成都校验这个身份）
     */
    public UploadSession init(String purpose, String scheduleId, String fileName,
                              long totalSize, String ownerId) {
        String p = normalizePurpose(purpose);
        if (totalSize <= 0) {
            throw new IllegalArgumentException("文件大小必须大于 0");
        }
        if (totalSize > props.getMaxFileSizeBytes()) {
            throw new IllegalArgumentException("文件超过上限 "
                    + (props.getMaxFileSizeBytes() / 1024 / 1024) + "MB");
        }
        int partSize = Math.max(1024 * 512, props.getPartSizeBytes());
        int partCount = (int) ((totalSize + partSize - 1) / partSize);

        String uploadId = UUID.randomUUID().toString().replace("-", "");
        String key = p + "/" + safeSegment(scheduleId) + "/" + uploadId + ext(fileName);

        UploadSession s = new UploadSession();
        s.setUploadId(uploadId);
        s.setKey(key);
        s.setPurpose(p);
        s.setScheduleId(scheduleId);
        s.setOwnerId(ownerId);
        s.setFileName(fileName);
        s.setTotalSize(totalSize);
        s.setPartSize(partSize);
        s.setPartCount(partCount);
        s.setCreatedAt(Instant.now().getEpochSecond());
        s.setStatus("UPLOADING");
        saveSession(s);
        log.info("上传会话创建: uploadId={}, key={}, size={}, parts={}", uploadId, key, totalSize, partCount);
        return s;
    }

    public UploadSession session(String uploadId) {
        UploadSession s = loadSession(uploadId);
        if (s == null) {
            throw new IllegalArgumentException("上传会话不存在或已过期: " + uploadId);
        }
        return s;
    }

    /** 上传一个分片（幂等覆盖：同一 partNumber 重复上传以最后一次为准） */
    public void uploadPart(String uploadId, int partNumber, byte[] data, String userId) {
        UploadSession s = session(uploadId);
        assertOwner(s, userId);
        if (partNumber < 1 || partNumber > s.getPartCount()) {
            throw new IllegalArgumentException("分片序号越界: " + partNumber + "/" + s.getPartCount());
        }
        if (data == null || data.length == 0) {
            throw new IllegalArgumentException("分片内容为空");
        }
        if (data.length > s.getPartSize()) {
            throw new IllegalArgumentException("分片超过约定大小 " + s.getPartSize());
        }
        Path dir = tmpDir(uploadId);
        try {
            Files.createDirectories(dir);
            Path tmp = dir.resolve(partNumber + ".part.tmp");
            Files.write(tmp, data);
            Files.move(tmp, dir.resolve(partNumber + ".part"),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("写入分片失败: " + partNumber, e);
        }
    }

    /** 已上传分片序号（升序），客户端据此续传 */
    public List<Integer> uploadedParts(String uploadId) {
        Path dir = tmpDir(uploadId);
        List<Integer> list = new ArrayList<>();
        if (!Files.isDirectory(dir)) return list;
        try (Stream<Path> files = Files.list(dir)) {
            files.map(p -> p.getFileName().toString())
                    .filter(n -> n.endsWith(".part"))
                    .forEach(n -> {
                        try {
                            list.add(Integer.parseInt(n.substring(0, n.length() - 5)));
                        } catch (NumberFormatException ignore) {
                            // 非分片文件（meta.json 等）直接跳过
                        }
                    });
        } catch (IOException e) {
            log.warn("列举分片失败: {}", uploadId, e);
        }
        list.sort(Integer::compareTo);
        return list;
    }

    /**
     * 合并分片落成最终对象，返回 key。
     *
     * <p>缺片时抛异常并带上缺失序号——「静默拼出一个少了中间 5MB 的文件」
     * 是最难查的一类事故：文件能打开、页码能翻、内容缺一段。
     */
    public String complete(String uploadId, String userId) {
        UploadSession s = session(uploadId);
        assertOwner(s, userId);
        if ("COMPLETED".equals(s.getStatus())) {
            return s.getKey();
        }

        List<Integer> uploaded = uploadedParts(uploadId);
        List<Integer> missing = new ArrayList<>();
        for (int i = 1; i <= s.getPartCount(); i++) {
            if (!uploaded.contains(i)) missing.add(i);
        }
        if (!missing.isEmpty()) {
            throw new IllegalStateException("分片缺失，无法合并: " + missing);
        }

        Path dir = tmpDir(uploadId);
        boolean first = true;
        for (int i = 1; i <= s.getPartCount(); i++) {
            byte[] chunk;
            try {
                chunk = Files.readAllBytes(dir.resolve(i + ".part"));
            } catch (IOException e) {
                throw new IllegalStateException("读取分片失败: " + i, e);
            }
            if (first) {
                storage.put(s.getKey(), chunk);
                first = false;
            } else {
                storage.append(s.getKey(), chunk);
            }
        }
        long actual = storage.size(s.getKey());
        if (actual != s.getTotalSize()) {
            // 大小不符说明客户端少传/多传了字节，宁可报错也不要留一个坏对象
            storage.delete(s.getKey());
            throw new IllegalStateException("合并后大小不符: 期望 " + s.getTotalSize() + "，实际 " + actual);
        }

        s.setStatus("COMPLETED");
        saveSession(s);
        cleanupPartFiles(uploadId);
        log.info("上传完成: uploadId={}, key={}, size={}", uploadId, s.getKey(), actual);
        return s.getKey();
    }

    public void abort(String uploadId, String userId) {
        UploadSession s = session(uploadId);
        assertOwner(s, userId);
        s.setStatus("ABORTED");
        saveSession(s);
        cleanupPartFiles(uploadId);
        log.info("上传已取消: uploadId={}", uploadId);
    }

    /** 直传（小文件/一次性字节）：跳过会话，直接落一个对象 */
    public String putDirect(String purpose, String scheduleId, String fileName, byte[] data) {
        String p = normalizePurpose(purpose);
        if (data == null || data.length == 0) throw new IllegalArgumentException("文件内容为空");
        if (data.length > props.getMaxFileSizeBytes()) {
            throw new IllegalArgumentException("文件超过上限");
        }
        String key = p + "/" + safeSegment(scheduleId) + "/"
                + UUID.randomUUID().toString().replace("-", "") + ext(fileName);
        storage.put(key, data);
        log.info("直传完成: key={}, size={}", key, data.length);
        return key;
    }

    // ---------------- 读取与签名 ----------------

    /**
     * 生成签名 URL。签名覆盖 {@code key + "\n" + exp}，改 key 或改 exp 都验不过。
     */
    public String signedUrl(String key) {
        if (key == null || key.isBlank()) return null;
        long exp = Instant.now().getEpochSecond() + props.getSignedUrlTtlSeconds();
        String token = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(key.getBytes(StandardCharsets.UTF_8));
        return base() + "/api/v1/files/" + token + "?exp=" + exp + "&sig=" + sign(key, exp);
    }

    public boolean verify(String key, long exp, String sig) {
        if (key == null || sig == null) return false;
        if (Instant.now().getEpochSecond() > exp) return false;
        String expected = sign(key, exp);
        return constantTimeEquals(expected, sig);
    }

    public InputStream open(String key) {
        return storage.openStream(key);
    }

    public long size(String key) {
        return storage.size(key);
    }

    public String localPath(String key) {
        return storage.localPath(key);
    }

    public String keyFromToken(String token) {
        try {
            return new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public void delete(String key) {
        storage.delete(key);
    }

    // ---------------- 内部 ----------------

    private String base() {
        String b = props.getPublicBaseUrl();
        return b == null ? "" : b.replaceAll("/+$", "");
    }

    private String sign(String key, long exp) {
        byte[] raw = hmac(key + "\n" + exp);
        StringBuilder sb = new StringBuilder(raw.length * 2);
        for (byte b : raw) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private byte[] hmac(String content) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("签名失败", e);
        }
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }

    private String normalizePurpose(String purpose) {
        String p = purpose == null ? "" : purpose.trim().toLowerCase(Locale.ROOT);
        if (PURPOSE_MATERIAL.equals(p) || PURPOSE_SUBMISSION.equals(p) || PURPOSE_RECORDING.equals(p)) {
            return p;
        }
        throw new IllegalArgumentException("非法用途: " + purpose + "（仅 material/submission/recording）");
    }

    /** scheduleId 参与路径，必须净化：只留字母数字与 -_ */
    private String safeSegment(String s) {
        String v = (s == null ? "unknown" : s).replaceAll("[^A-Za-z0-9_-]", "");
        return v.isEmpty() ? "unknown" : v;
    }

    private String ext(String fileName) {
        if (fileName == null) return "";
        int i = fileName.lastIndexOf('.');
        if (i < 0 || i == fileName.length() - 1) return "";
        String e = fileName.substring(i + 1).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        return e.isEmpty() ? "" : "." + e;
    }

    private void assertOwner(UploadSession s, String userId) {
        if (s.getOwnerId() != null && userId != null && !s.getOwnerId().equals(userId)) {
            throw new IllegalStateException("该上传会话不属于当前用户");
        }
    }

    private Path tmpDir(String uploadId) {
        if (storage instanceof LocalFsObjectStorage local) {
            return local.tmpDir(uploadId);
        }
        throw new IllegalStateException("当前存储实现不支持分片上传: " + storage.type());
    }

    /**
     * 只清分片文件，保留 meta.json —— 这样重复调用 complete 仍能拿到同一个 key
     * （网络抖动导致客户端重试是常态，不能第二次就报「会话不存在」）。
     */
    private void cleanupPartFiles(String uploadId) {
        Path dir = tmpDir(uploadId);
        if (!Files.isDirectory(dir)) return;
        try (Stream<Path> files = Files.list(dir)) {
            files.filter(p -> p.getFileName().toString().endsWith(".part"))
                    .forEach(p -> {
                        try { Files.deleteIfExists(p); } catch (IOException ignore) { /* 清理失败不影响主流程 */ }
                    });
        } catch (IOException e) {
            log.warn("清理分片失败: {}", uploadId, e);
        }
    }

    private void saveSession(UploadSession s) {
        Path dir = tmpDir(s.getUploadId());
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve("meta.json"), objectMapper.writeValueAsBytes(s));
        } catch (IOException e) {
            throw new IllegalStateException("保存上传会话失败", e);
        }
    }

    private UploadSession loadSession(String uploadId) {
        if (uploadId == null || !uploadId.matches("[a-f0-9]{32}")) return null;
        if (!(storage instanceof LocalFsObjectStorage local)) return null;
        Path p = local.tmpDir(uploadId).resolve("meta.json");
        if (!Files.exists(p)) return null;
        try {
            return objectMapper.readValue(Files.readAllBytes(p), UploadSession.class);
        } catch (IOException e) {
            log.warn("读取上传会话失败: {}", uploadId, e);
            return null;
        }
    }

    /** 上传会话（分片续传的元数据） */
    @Data
    public static class UploadSession {
        private String uploadId;
        private String key;
        private String purpose;
        private String scheduleId;
        private String ownerId;
        private String fileName;
        private long totalSize;
        private int partSize;
        private int partCount;
        private long createdAt;
        private String status;
    }
}
