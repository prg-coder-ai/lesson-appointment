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
        // 会话 key 只按 userId（2026-10-12 修正）：此处原先取「当前令牌租户」，而推送侧取的是
        // 「消息的发送方租户」（msg.getTenantId()），平台方发出（tenant_id=0）的消息算出的 key
        // 与租户用户注册的 key 不同 → 推送静默丢失。userId 全局唯一，租户不参与路由。
        String uid = MessageAuthContext.currentUserId();
        SseEmitter em = ssePushService.connect(uid);
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
