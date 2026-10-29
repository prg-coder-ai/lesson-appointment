package com.classroom.ws;

import com.classroom.service.ClassroomLiveState;
import com.classroom.metrics.BizMetrics;
import com.classroom.service.TeachingSessionService;
import com.classroom.web.TraceContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 白板协作信令处理器（F4-07~10）。
 *
 * <p><b>房间隔离</b>：按 {@code scheduleId} 分组，只在本课堂内广播。
 *
 * <p><b>P1 改造（持久化 + 协作授权 + 快照 + 重连下发）</b>：修复前这里是无差别转发，笔迹刷新即丢、
 * 无协作授权（任何人都能画）、无快照存档。现改为：
 * <ol>
 *   <li><b>重连下发</b>：新连接进房即收到 {@code wb:init}（当前白板操作序列），刷新/迟到者自动恢复板书；</li>
 *   <li><b>协作授权</b>：modify 类操作（draw/stroke/erase/clear）需教师或已被授权学生才能落盘+广播，
 *       未授权者直接丢弃并回 {@code wb:denied}；</li>
 *   <li><b>持久化 + 节流</b>：操作序列写入内存，并按 ≤2s 节流落盘 {@code classroom_session_record.whiteboard_snapshot}
 *       （{@link TeachingSessionService#saveWhiteboardSnapshot}），教师也可发 {@code wb:save} 立即落盘。</li>
 * </ol>
 */
@Slf4j
@Component
public class WhiteboardHandler extends TextWebSocketHandler {

    private final WsRoomRegistry registry;
    private final ClassroomLiveState liveState;
    private final TeachingSessionService teachingSession;
    private final ObjectMapper objectMapper;
    private final BizMetrics metrics;

    /** scheduleId -> 白板操作序列（JSON 字符串列表，用于重连下发与落盘） */
    private final Map<String, List<String>> wbOps = new ConcurrentHashMap<>();
    /** scheduleId -> 已加载 DB 快照标记（避免每次连接重复读库） */
    private final Set<String> loaded = ConcurrentHashMap.newKeySet();
    /** scheduleId -> 上次落盘时间戳(ms) */
    private final Map<String, Long> lastFlush = new ConcurrentHashMap<>();

    private static final long FLUSH_INTERVAL_MS = 2000;

    public WhiteboardHandler(WsRoomRegistry registry, ClassroomLiveState liveState,
                            TeachingSessionService teachingSession, ObjectMapper objectMapper,
                            BizMetrics metrics) {
        this.registry = registry;
        this.liveState = liveState;
        this.teachingSession = teachingSession;
        this.objectMapper = objectMapper;
        this.metrics = metrics;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String scheduleId = roomOf(session);
        if (scheduleId == null) {
            closeQuietly(session);
            return;
        }
        registry.registerWhiteboard(scheduleId, session);
        metrics.wsConnect("whiteboard");
        ensureLoaded(scheduleId);
        // 重连下发当前白板
        List<String> ops = wbOps.get(scheduleId);
        if (ops != null && !ops.isEmpty()) {
            String init = "{\"type\":\"wb:init\",\"ops\":" + toJsonArray(ops) + "}";
            send(session, init);
        }
        log.info("白板连接建立: scheduleId={}, sessionId={}, 房间人数={}, 已有笔迹={}",
                scheduleId, session.getId(), registry.signalRoomSize(scheduleId), ops == null ? 0 : ops.size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String scheduleId = roomOf(session);
        if (scheduleId == null) return;
        String userId = attr(session, WsHandshakeAuthInterceptor.ATTR_USER_ID);
        String role = attr(session, WsHandshakeAuthInterceptor.ATTR_ROLE);
        String payload = message.getPayload();
        // 落盘/授权判定都在这一段里，日志必须能按 traceId 串起来（WS 无过滤器链）
        TraceContext.runWith(attr(session, WsHandshakeAuthInterceptor.ATTR_TRACE_ID),
                () -> handlePayload(session, scheduleId, userId, role, payload));
    }

    private void handlePayload(WebSocketSession session, String scheduleId,
                              String userId, String role, String payload) {
        JsonNode node;
        try {
            node = objectMapper.readTree(payload);
        } catch (Exception e) {
            registry.broadcastWhiteboard(scheduleId, payload); // 非 JSON 原样转发兜底
            return;
        }
        String op = node.path("op").asText(null);

        if ("wb:save".equals(op) && isTeacherOrManager(role)) {
            flush(scheduleId, true);
            registry.broadcastWhiteboard(scheduleId, "{\"type\":\"wb:snapshot:saved\"}");
            return;
        }

        boolean modifies = "draw".equals(op) || "stroke".equals(op) || "erase".equals(op) || "clear".equals(op);
        if (modifies) {
            if (!liveState.canEditWhiteboard(scheduleId, userId, isTeacherOrManager(role))) {
                metrics.whiteboardDenied();
                send(session, "{\"type\":\"wb:denied\"}");
                return;
            }
            if ("clear".equals(op)) {
                wbOps.computeIfAbsent(scheduleId, k -> new java.util.concurrent.CopyOnWriteArrayList<>()).clear();
            } else {
                wbOps.computeIfAbsent(scheduleId, k -> new java.util.concurrent.CopyOnWriteArrayList<>()).add(payload);
            }
        }
        // 广播给本房间其他白板通道 session（含 modify/cursor 等非 modify 操作）
        registry.broadcastWhiteboard(scheduleId, payload);
        if (modifies) maybeFlush(scheduleId);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String scheduleId = roomOf(session);
        if (scheduleId != null) {
            registry.unregisterWhiteboard(scheduleId, session);
            flush(scheduleId, false);
        }
        log.info("白板连接关闭: scheduleId={}, sessionId={}, status={}", scheduleId, session.getId(), status);
    }

    // ------------------------------------------------------------------
    // 持久化 / 加载
    // ------------------------------------------------------------------

    private void ensureLoaded(String scheduleId) {
        if (loaded.contains(scheduleId)) return;
        try {
            String snap = teachingSession.getRecord(scheduleId) == null ? null
                    : teachingSession.getRecord(scheduleId).getWhiteboardSnapshot();
            if (snap != null && !snap.isBlank()) {
                JsonNode arr = objectMapper.readTree(snap);
                if (arr.isArray()) {
                    List<String> list = new java.util.concurrent.CopyOnWriteArrayList<>();
                    arr.forEach(n -> list.add(n.asText()));
                    wbOps.put(scheduleId, list);
                }
            }
        } catch (Exception e) {
            log.debug("白板快照加载失败(忽略): scheduleId={}", scheduleId);
        }
        loaded.add(scheduleId);
    }

    private void maybeFlush(String scheduleId) {
        long now = System.currentTimeMillis();
        Long last = lastFlush.get(scheduleId);
        if (last == null || now - last >= FLUSH_INTERVAL_MS) {
            flush(scheduleId, false);
        }
    }

    private void flush(String scheduleId, boolean force) {
        if (!force) {
            long now = System.currentTimeMillis();
            Long last = lastFlush.get(scheduleId);
            if (last != null && now - last < FLUSH_INTERVAL_MS) return;
            lastFlush.put(scheduleId, now);
        } else {
            lastFlush.put(scheduleId, System.currentTimeMillis());
        }
        List<String> ops = wbOps.get(scheduleId);
        String snap = ops == null ? "[]" : toJsonArray(ops);
        try {
            teachingSession.saveWhiteboardSnapshot(scheduleId, snap);
        } catch (Exception e) {
            log.warn("白板快照落盘失败: scheduleId={}", scheduleId);
        }
    }

    // ------------------------------------------------------------------
    // 工具
    // ------------------------------------------------------------------

    private String toJsonArray(List<String> ops) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < ops.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(ops.get(i));
        }
        sb.append("]");
        return sb.toString();
    }

    private boolean isTeacherOrManager(String role) {
        return "teacher".equals(role) || "manager".equals(role) || "admin".equals(role);
    }

    private String roomOf(WebSocketSession session) {
        Object v = session.getAttributes().get(WsHandshakeAuthInterceptor.ATTR_SCHEDULE_ID);
        return v == null ? null : v.toString();
    }

    private String attr(WebSocketSession session, String key) {
        Object v = session.getAttributes().get(key);
        return v == null ? null : v.toString();
    }

    private void send(WebSocketSession session, String json) {
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (Exception e) {
            log.debug("白板 WS 发送失败: {}", e.getMessage());
        }
    }

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close(CloseStatus.NOT_ACCEPTABLE);
        } catch (Exception e) {
            log.debug("关闭无房间归属的 WS 连接失败: {}", e.getMessage());
        }
    }
}
