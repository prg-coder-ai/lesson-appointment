package com.classroom.util;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 对象存储客户端（讲稿/学生作品/录制文件）。
 * M1 阶段为 stub 实现，后续对接具体 OSS/COS SDK。
 */
@Slf4j
@Component
public class OssClient {

    @Value("${oss.endpoint:}")
    private String endpoint;

    @Value("${oss.bucket:}")
    private String bucket;

    @Value("${oss.access-key:}")
    private String accessKey;

    @Value("${oss.secret-key:}")
    private String secretKey;

    @Value("${oss.signed-url-expire-hours:2}")
    private int signedUrlExpireHours;

    private HttpClient httpClient;

    @PostConstruct
    public void init() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        log.info("OssClient initialized: endpoint={}, bucket={}", endpoint, bucket);
    }

    public String upload(byte[] data, String objectKey) {
        log.info("OSS upload stub: bucket={}, key={}, size={}", bucket, objectKey, data.length);
        return objectKey;
    }

    public byte[] download(String objectKey) {
        log.info("OSS download stub: bucket={}, key={}", bucket, objectKey);
        return new byte[0];
    }

    public String generateSignedUrl(String objectKey) {
        return endpoint + "/" + bucket + "/" + objectKey + "?expire=" + signedUrlExpireHours + "h";
    }

    public void delete(String objectKey) {
        log.info("OSS delete stub: bucket={}, key={}", bucket, objectKey);
    }
}