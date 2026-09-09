package com.messagecenter.service;

import com.messagecenter.entity.Message;
import com.messagecenter.utils.CryptoUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SSE 实时推送：维护 租户+userId -> SseEmitter 在线会话。
 * 发送消息后，向在线接收者推送下行通知（含解密后的标题）。
 */
@Slf4j
@Service
public class SsePushService {

    private final CryptoUtil crypto;
    /** key = tenantId + ":" + userId */
    private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();

    public SsePushService(CryptoUtil crypto) { this.crypto = crypto; }

    /** 注册在线会话 */
    public SseEmitter connect(Long tenantId, String userId) {
        String key = key(tenantId, userId);
        SseEmitter em = new SseEmitter(0L); // 不自动超时
        emitters.put(key, em);
        em.onCompletion(() -> emitters.remove(key, em));
        em.onTimeout(() -> emitters.remove(key, em));
        em.onError(e -> emitters.remove(key, em));
        return em;
    }

    public int onlineCount() { return emitters.size(); }

    /** 向指定用户列表推送 */
    public void pushToUsers(List<String> userIds, Message msg) {
        if (userIds == null) return;
        for (String uid : userIds) {
            pushToUser(msg.getTenantId(), uid, msg);
        }
    }

    public void pushToUser(Long tenantId, String userId, Message msg) {
        String key = key(tenantId, userId);
        SseEmitter em = emitters.get(key);
        if (em == null) return;
        try {
            Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("type", "new_message");
            payload.put("messageId", msg.getMessageId());
            payload.put("title", msg.getTitle() == null ? null : crypto.decrypt(msg.getTitle()));
            payload.put("priority", msg.getPriority());
            payload.put("categoryCode", msg.getCategoryCode());
            payload.put("sendTime", msg.getSendTime() == null ? null : msg.getSendTime().toString());
            em.send(SseEmitter.event().name("message").data(payload));
        } catch (IOException | IllegalStateException e) {
            emitters.remove(key);
        }
    }

    private String key(Long tenantId, String userId) {
        return (tenantId == null ? "0" : tenantId) + ":" + userId;
    }

    /** 撤回事件：通知未读接收方某条消息已被收回 */
    public void pushRecall(Long tenantId, List<String> userIds, Long messageId) {
        if (userIds == null) return;
        for (String uid : userIds) {
            String key = key(tenantId, uid);
            SseEmitter em = emitters.get(key);
            if (em == null) continue;
            try {
                Map<String, Object> payload = new java.util.HashMap<>();
                payload.put("type", "message_recalled");
                payload.put("messageId", messageId);
                em.send(SseEmitter.event().name("message").data(payload));
            } catch (IOException | IllegalStateException e) {
                emitters.remove(key);
            }
        }
    }
}
