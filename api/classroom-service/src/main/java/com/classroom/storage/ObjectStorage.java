package com.classroom.storage;

import java.io.InputStream;

/**
 * 对象存储 SPI。
 *
 * <p>业务只依赖这个接口：讲稿、学生作品、录制文件三类都用同一套 key 规则与签名访问，
 * 换云厂商 = 新写一个实现类并按 {@code classroom.storage.type} 装配。
 *
 * <p><b>key 规则</b>（由 {@link StorageService} 生成，实现不得自行改写）：
 * {@code <purpose>/<scheduleId>/<uuid>.<ext>}，purpose ∈ material|submission|recording。
 */
public interface ObjectStorage {

    String type();

    boolean available();

    /** 覆盖写（同 key 覆盖）。实现必须保证「要么完整写入，要么不留半截文件」 */
    void put(String key, byte[] data);

    /** 追加写（分片合并用）。key 不存在时等价 put */
    void append(String key, byte[] data);

    InputStream openStream(String key);

    long size(String key);

    boolean exists(String key);

    void delete(String key);

    /**
     * 本地文件绝对路径（供 HTTP 层做 Range 分段响应）。
     * 云存储实现返回 null，此时 HTTP 层退化为整文件流式输出。
     */
    String localPath(String key);
}
