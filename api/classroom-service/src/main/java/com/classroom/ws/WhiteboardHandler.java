package com.classroom.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 白板协作信令处理器（F4-07~10）。
 *
 * <p><b>房间隔离</b>：修复前是「全局 sessions 转发」——所有课堂的笔迹互相串台，
 * A 课堂的板书会画到 B 课堂学生的屏幕上。现按 {@code scheduleId} 分组，
 * 只在本课堂内广播。scheduleId 由握手拦截器写入 session 属性（已鉴权）。
 *
 * <p><b>发送串行化</b>：Spring 的 {@code WebSocketSession} 不是线程安全的，
 * 多线程并发 {@code sendMessage} 会抛 {@code TEXT_PARTIAL_WRITING}。
 * 这里用 {@code synchronized (session)} 保护，单课堂 10 人规模足够。
 */
@Slf4j
@Component
public class WhiteboardHandler extends TextWebSocketHandler {

    /** scheduleId -> sessions */
    private final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String scheduleId = roomOf(session);
        if (scheduleId == null) {
            closeQuietly(session);
            return;
        }
        rooms.computeIfAbsent(scheduleId, k -> ConcurrentHashMap.newKeySet()).add(session);
        log.info("白板连接建立: scheduleId={}, sessionId={}, 房间人数={}",
                scheduleId, session.getId(), rooms.get(scheduleId).size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String scheduleId = roomOf(session);
        if (scheduleId == null) return;
        Set<WebSocketSession> peers = rooms.get(scheduleId);
        if (peers == null || peers.isEmpty()) return;

        for (WebSocketSession s : peers) {
            if (!s.isOpen() || s.getId().equals(session.getId())) continue;
            try {
                synchronized (s) {
                    s.sendMessage(message);
                }
            } catch (Exception e) {
                log.debug("白板信令转发失败: scheduleId={}, target={}, err={}", scheduleId, s.getId(), e.getMessage());
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String scheduleId = roomOf(session);
        if (scheduleId != null) {
            Set<WebSocketSession> peers = rooms.get(scheduleId);
            if (peers != null) {
                peers.remove(session);
                if (peers.isEmpty()) rooms.remove(scheduleId);
            }
        }
        log.info("白板连接关闭: scheduleId={}, sessionId={}, status={}", scheduleId, session.getId(), status);
    }

    private String roomOf(WebSocketSession session) {
        Object v = session.getAttributes().get(WsHandshakeAuthInterceptor.ATTR_SCHEDULE_ID);
        return v == null ? null : v.toString();
    }

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close(CloseStatus.NOT_ACCEPTABLE);
        } catch (Exception e) {
            log.debug("关闭无房间归属的 WS 连接失败: {}", e.getMessage());
        }
    }
}
