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
 * 课堂信令广播处理器：点名/成员状态/上下课通知/聊天（F4-11~14, F3-05）。
 *
 * <p><b>房间隔离</b>：与 {@link WhiteboardHandler} 同因——修复前全局广播，
 * 一个课堂的「下课」通知会把别的课堂也关掉。现只在 {@code scheduleId} 房间内转发。
 */
@Slf4j
@Component
public class ClassroomSignalHandler extends TextWebSocketHandler {

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
        log.info("信令连接建立: scheduleId={}, sessionId={}, 房间人数={}",
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
                log.debug("信令广播失败: scheduleId={}, target={}, err={}", scheduleId, s.getId(), e.getMessage());
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
        log.info("信令连接关闭: scheduleId={}, sessionId={}, status={}", scheduleId, session.getId(), status);
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
