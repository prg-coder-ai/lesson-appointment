package com.classroom.controller;

import com.classroom.storage.StorageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;
import java.util.Locale;

/**
 * 签名 URL 文件访问（讲稿预览 / 作品回放 / 录制回放）。
 *
 * <p><b>为什么不走登录态</b>：{@code <video src>}、{@code <iframe src>}、{@code <img src>}
 * 没法带 Authorization 头。所以这里用「短时签名 URL」替代：URL 带 {@code exp} 与
 * {@code sig}（HMAC-SHA256 覆盖 key+exp），过期或篡改直接 403。默认 2 小时，
 * 与需求 F4-06「仅成员访问 + 2h 有效」对齐。
 *
 * <p><b>Range 支持是必须的</b>（F6-04 回放拖动/倍速）：视频/音频没有 Range 就只能从头播，
 * 拖进度条会整段重下。这里实现单区间 206。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/files")
public class FileAccessController {

    private final StorageService storageService;

    public FileAccessController(StorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/{token}")
    public ResponseEntity<StreamingResponseBody> get(@PathVariable String token,
                                                     @RequestParam long exp,
                                                     @RequestParam String sig,
                                                     @RequestHeader(value = "Range", required = false) String range) {
        String key = storageService.keyFromToken(token);
        if (key == null || !storageService.verify(key, exp, sig)) {
            log.warn("文件访问签名无效: key={}, exp={}", key, exp);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        long total = storageService.size(key);
        if (total <= 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        long start = 0;
        long end = total - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=")) {
            String spec = range.substring("bytes=".length()).split(",")[0].trim();
            int dash = spec.indexOf('-');
            try {
                if (dash > 0) {
                    start = Long.parseLong(spec.substring(0, dash));
                    String tail = spec.substring(dash + 1);
                    if (!tail.isEmpty()) end = Math.min(Long.parseLong(tail), total - 1);
                } else if (dash == 0 && spec.length() > 1) {
                    // bytes=-N 语义：最后 N 字节
                    long n = Long.parseLong(spec.substring(1));
                    start = Math.max(0, total - n);
                }
                if (start > end || start >= total) {
                    return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                            .header("Content-Range", "bytes */" + total)
                            .build();
                }
                partial = true;
            } catch (NumberFormatException e) {
                // Range 写坏就当整文件请求处理，不因一个头把播放器打死
                start = 0;
                end = total - 1;
                partial = false;
            }
        }

        final long from = start;
        final long length = end - start + 1;
        StreamingResponseBody body = out -> {
            try (InputStream in = storageService.open(key)) {
                long skipped = 0;
                while (skipped < from) {
                    long n = in.skip(from - skipped);
                    if (n <= 0) break;
                    skipped += n;
                }
                byte[] buf = new byte[64 * 1024];
                long remaining = length;
                while (remaining > 0) {
                    int read = in.read(buf, 0, (int) Math.min(buf.length, remaining));
                    if (read < 0) break;
                    out.write(buf, 0, read);
                    remaining -= read;
                }
                out.flush();
            }
        };

        ResponseEntity.BodyBuilder builder = ResponseEntity.status(partial ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK)
                .header("Accept-Ranges", "bytes")
                .header("Content-Type", contentTypeOf(key))
                .header("Content-Length", String.valueOf(length))
                .header("Cache-Control", "private, max-age=3600");
        if (partial) {
            builder.header("Content-Range", "bytes " + from + "-" + end + "/" + total);
        }
        return builder.body(body);
    }

    private String contentTypeOf(String key) {
        String k = key.toLowerCase(Locale.ROOT);
        if (k.endsWith(".pdf")) return "application/pdf";
        if (k.endsWith(".png")) return "image/png";
        if (k.endsWith(".jpg") || k.endsWith(".jpeg")) return "image/jpeg";
        if (k.endsWith(".gif")) return "image/gif";
        if (k.endsWith(".webp")) return "image/webp";
        if (k.endsWith(".mp4")) return "video/mp4";
        if (k.endsWith(".webm")) return "video/webm";
        if (k.endsWith(".m4a") || k.endsWith(".aac")) return "audio/aac";
        if (k.endsWith(".mp3")) return "audio/mpeg";
        if (k.endsWith(".wav")) return "audio/wav";
        if (k.endsWith(".ogg")) return "audio/ogg";
        if (k.endsWith(".txt")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }
}
