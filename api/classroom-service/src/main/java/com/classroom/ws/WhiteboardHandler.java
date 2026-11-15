package com.classroom.ws;

import com.classroom.service.ClassroomLiveState;
import com.classroom.service.ClassroomPublishGuard;
import com.classroom.metrics.BizMetrics;
import com.classroom.service.TeachingSessionService;
import com.classroom.web.TraceContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 *   <li><b>撤回（最近 5 步，仅撤自己的）</b>：每条 op 带 {@code opId}（一次落笔唯一）与 {@code by}（作者）。
 *       收到 {@code op:'undo'} 时校验作者归属，按 opId 从内存序列移除整次落笔并<b>强制落盘</b>，
 *       再广播给全房间；否则刷新 / 重连的 {@code wb:init} 会把已撤回的笔迹重新复活。</li>
 * </ol>
 *
 * <p><b>为什么 shape / text 必须纳入 modifies</b>：修复前形状笔迹（{@code op:'shape'}）只广播不落盘，
 * 重连回放必丢，且无法撤回。撤回功能依赖 opId 随 op 持久化，故 shape 与新增的文字
 * （{@code op:'text'}，含 text/font/fontSize/baseH/color）一并补齐落盘。
 */
@Slf4j
@Component
public class WhiteboardHandler extends TextWebSocketHandler {

    private final WsRoomRegistry registry;
    private final ClassroomLiveState liveState;
    private final TeachingSessionService teachingSession;
    private final ObjectMapper objectMapper;
    private final BizMetrics metrics;
    private final ClassroomPublishGuard publishGuard;

    /** scheduleId -> 白板操作序列（JSON 字符串列表，用于重连下发与落盘） */
    private final Map<String, List<String>> wbOps = new ConcurrentHashMap<>();
    /** scheduleId -> 已加载 DB 快照标记（避免每次连接重复读库） */
    private final Set<String> loaded = ConcurrentHashMap.newKeySet();
    /** scheduleId -> 上次落盘时间戳(ms) */
    private final Map<String, Long> lastFlush = new ConcurrentHashMap<>();

    private static final long FLUSH_INTERVAL_MS = 2000;

    public WhiteboardHandler(WsRoomRegistry registry, ClassroomLiveState liveState,
                            TeachingSessionService teachingSession, ObjectMapper objectMapper,
                            BizMetrics metrics, ClassroomPublishGuard publishGuard) {
        this.registry = registry;
        this.liveState = liveState;
        this.teachingSession = teachingSession;
        this.objectMapper = objectMapper;
        this.metrics = metrics;
        this.publishGuard = publishGuard;
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

        // 课堂发布门禁（服务端权威）：非「进行中」时学生不得画；PAUSED 时教师也不得画。
        // 白板是独立 WS 通道，signal 通道的拦截覆盖不到，必须在这里同样前置拦一次。
        // wb:save 属控制类（教师保存板书），由 guard 例外放行。
        if (!publishGuard.allows(scheduleId, role, op)) {
            String st = publishGuard.statusOf(scheduleId);
            send(session, "{\"type\":\"wb:rejected\",\"reason\":\"CLASS_NOT_PUBLISHABLE\","
                    + "\"status\":\"" + (st == null ? "" : st) + "\"}");
            metrics.whiteboardDenied();
            return;
        }

        if ("wb:save".equals(op) && isTeacherOrManager(role)) {
            flush(scheduleId, true);
            registry.broadcastWhiteboard(scheduleId, "{\"type\":\"wb:snapshot:saved\"}");
            return;
        }

        boolean modifies = "draw".equals(op) || "stroke".equals(op) || "erase".equals(op)
                || "shape".equals(op) || "text".equals(op) || "clear".equals(op);

        // 撤回：仅撤自己的。归属以 WS 握手身份为准，逐条比对持久化序列里的 by（由 withAuthor 注入），
        // 任一条不属于本人即拒绝；防止越权删他人板书。
        if ("undo".equals(op)) {
            if (!liveState.canEditWhiteboard(scheduleId, userId, isTeacherOrManager(role))) {
                metrics.whiteboardDenied();
                send(session, "{\"type\":\"wb:denied\"}");
                return;
            }
            String undoOpId = node.path("opId").asText(null);
            // 归属完全以 WS 握手身份（JWT sub）为准，客户端报文里的 by 一律不参与判定：
            //   ① 不可信（可伪造）；② 前端 ctx.userId 可能是数字而 JWT sub 是字符串，强比会误拒。
            // op 的 by 已由 withAuthor() 在落盘时注入为握手身份，故此处比对是权威的。
            if (undoOpId == null || undoOpId.isEmpty() || userId == null) {
                metrics.whiteboardDenied();
                send(session, "{\"type\":\"wb:denied\"}");
                return;
            }
            List<String> seq = wbOps.get(scheduleId);
            boolean owned = true;
            if (seq != null) {
                for (String p : seq) {
                    if (undoOpId.equals(jsonField(p, "opId"))
                            && !userId.equals(String.valueOf(jsonField(p, "by")))) {
                        owned = false;
                        break;
                    }
                }
            }
            if (!owned) {
                metrics.whiteboardDenied();
                send(session, "{\"type\":\"wb:denied\"}");
                return;
            }
            if (seq != null) seq.removeIf(p -> undoOpId.equals(jsonField(p, "opId")));
            // 广播给全房间（含发起者，客户端按 opId 幂等），并强制落盘避免节流窗口内重连复活
            registry.broadcastWhiteboard(scheduleId, payload);
            flush(scheduleId, true);
            return;
        }

        String outbound = payload;
        if (modifies) {
            if (!liveState.canEditWhiteboard(scheduleId, userId, isTeacherOrManager(role))) {
                metrics.whiteboardDenied();
                send(session, "{\"type\":\"wb:denied\"}");
                return;
            }
            if ("clear".equals(op)) {
                wbOps.computeIfAbsent(scheduleId, k -> new java.util.concurrent.CopyOnWriteArrayList<>()).clear();
            } else {
                // 作者身份以 WS 握手（JWT sub）为准，覆盖客户端自报的 by —— 撤回归属校验的根基
                outbound = withAuthor(node, userId, payload);
                wbOps.computeIfAbsent(scheduleId, k -> new java.util.concurrent.CopyOnWriteArrayList<>()).add(outbound);
            }
        }
        // 广播给本房间其他白板通道 session（含 modify/cursor 等非 modify 操作）
        registry.broadcastWhiteboard(scheduleId, outbound);
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

    /**
     * 用 WS 握手身份（JWT sub）覆盖 op 的 by 字段后再落盘 / 广播。
     * 客户端自报的 by 不可信：若不覆盖，伪造 by 即可绕过「仅撤自己的」归属校验。
     * 非对象 JSON 或序列化异常时退回原报文，不阻断绘制。
     */
    private String withAuthor(JsonNode node, String userId, String raw) {
        if (node instanceof ObjectNode && userId != null) {
            try {
                ((ObjectNode) node).put("by", userId);
                return objectMapper.writeValueAsString(node);
            } catch (Exception e) {
                log.debug("白板 op 作者注入失败，使用原报文: {}", e.getMessage());
            }
        }
        return raw;
    }

    /** 从已持久化的 op payload 里读字段（撤回归属校验用）；非 JSON / 异常一律返回 null，不抛给调用方 */
    private String jsonField(String payload, String field) {
        if (payload == null) return null;
        try {
            return objectMapper.readTree(payload).path(field).asText(null);
        } catch (Exception e) {
            return null;
        }
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
