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
        SseEmitter old = emitters.put(key, em);
        if (old != null) {
            // 同一用户重复连接（前端 EventSource 自动重连、开多个标签页）时必须显式结束旧 emitter：
            // 它已不在 map 里（后续推送碰不到），又因 0L=永不超时而不会自己退出，
            // 会一直挂在容器的异步请求上，直到 TCP 层报错为止。
            try {
                old.complete();
            } catch (Exception ignored) {
                // 已完成/已失效都会抛，忽略
            }
        }
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
            // 客户端已断开（浏览器刷新/切页/断网）。移除 emitter 即可 —— 业务不受影响。
            // 但要注意：Spring 的 ResponseBodyEmitter 会把这次失败保存在 emitter 上，并在
            // 该 SSE 请求的异步收尾阶段重放同一个异常，所以 GlobalExceptionHandler 依然会
            // 看到它（堆栈里还带着 pushToUser 这一帧，极易被误判成"catch 没生效"）。
            // 不刷 ERROR 日志靠的是 GlobalExceptionHandler 对「响应已提交」的静默分支。
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
