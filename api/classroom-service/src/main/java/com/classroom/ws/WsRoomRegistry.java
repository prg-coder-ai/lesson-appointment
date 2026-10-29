package com.classroom.ws;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 课堂 WebSocket 房间注册表（单例）。
 *
 * <p><b>为什么需要它</b>：修复前 {@link ClassroomSignalHandler} 与 {@link WhiteboardHandler}
 * 各自维护私有的 {@code rooms} map，REST 控制器、定时任务、业务 Service 完全无法向某个课堂的
 * 在线成员发起「服务端广播」（点名强提示、全员禁言、批准开麦、摄像头状态、白板重连下发等都依赖它）。
 * 本组件把两个通道的 session 收口到同一张注册表，并提供按 {@code scheduleId} 广播 / 按 {@code userId}
 * 单发的能力，是 P1 教学闭环「服务端信令强控」的地基。</p>
 *
 * <p><b>线程安全</b>：{@link WebSocketSession} 不是线程安全的，所有 {@code sendMessage} 用
 * {@code synchronized (session)} 串行化，避免 {@code TEXT_PARTIAL_WRITING}。</p>
 */
@Component
public class WsRoomRegistry {

    private static final Logger log = LoggerFactory.getLogger(WsRoomRegistry.class);

    /** scheduleId -> 信令通道 sessions */
    private final Map<String, Set<WebSocketSession>> signalRooms = new ConcurrentHashMap<>();
    /** scheduleId -> 白板通道 sessions */
    private final Map<String, Set<WebSocketSession>> wbRooms = new ConcurrentHashMap<>();

    // ------------------------------------------------------------------
    // 注册 / 注销
    // ------------------------------------------------------------------

    public void registerSignal(String scheduleId, WebSocketSession session) {
        signalRooms.computeIfAbsent(scheduleId, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void unregisterSignal(String scheduleId, WebSocketSession session) {
        removeFrom(signalRooms, scheduleId, session);
    }

    public void registerWhiteboard(String scheduleId, WebSocketSession session) {
        wbRooms.computeIfAbsent(scheduleId, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void unregisterWhiteboard(String scheduleId, WebSocketSession session) {
        removeFrom(wbRooms, scheduleId, session);
    }

    private void removeFrom(Map<String, Set<WebSocketSession>> rooms, String scheduleId, WebSocketSession session) {
        Set<WebSocketSession> peers = rooms.get(scheduleId);
        if (peers != null) {
            peers.remove(session);
            if (peers.isEmpty()) rooms.remove(scheduleId);
        }
    }

    public int signalRoomSize(String scheduleId) {
        Set<WebSocketSession> peers = signalRooms.get(scheduleId);
        return peers == null ? 0 : peers.size();
    }

    // ------------------------------------------------------------------
    // 广播 / 单发
    // ------------------------------------------------------------------

    /** 向某课堂全部信令通道 session 广播（含发送者，由客户端按 type 自行幂等） */
    public void broadcastSignal(String scheduleId, String json) {
        broadcast(signalRooms, scheduleId, json, null);
    }

    /** 向某课堂全部信令通道 session 广播，排除指定 sessionId */
    public void broadcastSignalExcept(String scheduleId, String json, String excludeSessionId) {
        broadcast(signalRooms, scheduleId, json, excludeSessionId);
    }

    /** 向某课堂指定 userId 的信令通道 session 单发（同用户多标签会收到多份，前端去重） */
    public void sendSignalToUser(String scheduleId, String userId, String json) {
        Set<WebSocketSession> peers = signalRooms.get(scheduleId);
        if (peers == null) return;
        for (WebSocketSession s : peers) {
            if (!s.isOpen()) continue;
            if (userId.equals(s.getAttributes().get(WsHandshakeAuthInterceptor.ATTR_USER_ID))) {
                send(s, json);
            }
        }
    }

    /** 向某课堂全部白板通道 session 广播（含发送者） */
    public void broadcastWhiteboard(String scheduleId, String json) {
        broadcast(wbRooms, scheduleId, json, null);
    }

    /** 向某课堂指定 userId 的白板通道 session 单发（重连下发当前白板快照用） */
    public void sendWhiteboardToUser(String scheduleId, String userId, String json) {
        Set<WebSocketSession> peers = wbRooms.get(scheduleId);
        if (peers == null) return;
        for (WebSocketSession s : peers) {
            if (!s.isOpen()) continue;
            if (userId.equals(s.getAttributes().get(WsHandshakeAuthInterceptor.ATTR_USER_ID))) {
                send(s, json);
            }
        }
    }

    private void broadcast(Map<String, Set<WebSocketSession>> rooms, String scheduleId, String json, String excludeSessionId) {
        Set<WebSocketSession> peers = rooms.get(scheduleId);
        if (peers == null || peers.isEmpty()) return;
        for (WebSocketSession s : peers) {
            if (!s.isOpen()) continue;
            if (excludeSessionId != null && excludeSessionId.equals(s.getId())) continue;
            send(s, json);
        }
    }

    private void send(WebSocketSession session, String json) {
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (IOException e) {
            log.debug("WS 发送失败: sessionId={}, err={}", session.getId(), e.getMessage());
        }
    }
}
