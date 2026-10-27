package com.classroom.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 心跳/在线状态处理器（F3-02~04）。
 */
@Slf4j
@Component
public class HeartbeatHandler extends TextWebSocketHandler {

    private final OnlineStateManager onlineStateManager;
    private final Map<String, String> sessionUsers = new ConcurrentHashMap<>();

    public HeartbeatHandler(OnlineStateManager onlineStateManager) {
        this.onlineStateManager = onlineStateManager;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String payload = message.getPayload();
        log.debug("心跳收到: sessionId={}, payload={}", session.getId(), payload);
        String scheduleId = extractPathVariable(session);
        String userId = extractUserId(payload);
        if (userId != null) {
            onlineStateManager.refresh(scheduleId, userId);
            sessionUsers.put(session.getId(), userId);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = sessionUsers.remove(session.getId());
        String scheduleId = extractPathVariable(session);
        if (userId != null) {
            onlineStateManager.setOffline(scheduleId, userId);
        }
        log.info("心跳连接关闭: sessionId={}, userId={}", session.getId(), userId);
    }

    private String extractPathVariable(WebSocketSession session) {
        String path = session.getUri().getPath();
        String[] parts = path.split("/");
        return parts.length > 4 ? parts[4] : "unknown";
    }

    private String extractUserId(String payload) {
        if (payload.contains("\"userId\"")) {
            int start = payload.indexOf("\"userId\"") + 9;
            int colon = payload.indexOf(":", start);
            int quote1 = payload.indexOf("\"", colon);
            int quote2 = payload.indexOf("\"", quote1 + 1);
            if (quote1 > 0 && quote2 > 0) {
                return payload.substring(quote1 + 1, quote2);
            }
        }
        return null;
    }
}