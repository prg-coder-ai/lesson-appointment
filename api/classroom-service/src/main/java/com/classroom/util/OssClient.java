package com.classroom.util;

import com.classroom.storage.ObjectStorage;
import com.classroom.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * 对象存储兼容门面（保留历史方法名）。
 *
 * <p>包3·P2 之前这里是四方法 stub（{@code generateSignedUrl} 甚至拼了个假的
 * {@code ?expire=2h} 地址）。现在全部委托 {@link StorageService} + {@link ObjectStorage}：
 * 落盘是真的、签名是真的、删除是真的。新代码请直接用 {@link StorageService}
 * （支持分片/断点续传），这里只为不破坏既有调用方而保留。
 */
@Slf4j
@Component
public class OssClient {

    private final ObjectStorage storage;
    private final StorageService storageService;

    public OssClient(ObjectStorage storage, StorageService storageService) {
        this.storage = storage;
        this.storageService = storageService;
    }

    /** 覆盖写，返回 key（与历史语义一致） */
    public String upload(byte[] data, String objectKey) {
        storage.put(objectKey, data);
        return objectKey;
    }

    public byte[] download(String objectKey) {
        long size = storage.size(objectKey);
        if (size <= 0) return new byte[0];
        try (InputStream in = storage.openStream(objectKey);
             ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.min(size, 1 << 20))) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } catch (IOException e) {
            log.error("读取对象失败: {}", objectKey, e);
            return new byte[0];
        }
    }

    /** 真实签名 URL（HMAC + 过期时间，默认 2h） */
    public String generateSignedUrl(String objectKey) {
        return storageService.signedUrl(objectKey);
    }

    public void delete(String objectKey) {
        storage.delete(objectKey);
    }

    public boolean exists(String objectKey) {
        return storage.exists(objectKey);
    }
}
