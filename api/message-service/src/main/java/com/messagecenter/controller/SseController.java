package com.messagecenter.controller;

import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.SsePushService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * SSE 实时推送：用户建立长连接订阅；发送方通过 SsePushService 向在线接收者推送。
 */
@RestController
@RequestMapping("/api/v1/sse")
public class SseController {

    private final SsePushService ssePushService;

    public SseController(SsePushService ssePushService) { this.ssePushService = ssePushService; }

    /** 建立 SSE 连接（鉴权通过 access_token 或 Authorization 头） */
    @GetMapping(value = "/connect", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter connect() {
        Long tenant = MessageAuthContext.currentTenantId();
        String uid = MessageAuthContext.currentUserId();
        if (tenant == null) tenant = 0L;
        SseEmitter em = ssePushService.connect(tenant, uid);
        // 连接即发送一条 ready 心跳
        try {
            em.send(SseEmitter.event().name("ready").data(Map.of("online", ssePushService.onlineCount())));
        } catch (Exception ignored) {}
        return em;
    }

    /** 在线会话数（运维/测试） */
    @GetMapping("/online-count")
    public Map<String, Object> online() {
        return Map.of("online", ssePushService.onlineCount());
    }
}
