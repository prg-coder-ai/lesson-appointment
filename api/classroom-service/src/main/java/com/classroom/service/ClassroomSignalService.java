package com.classroom.service;

import com.classroom.ws.WsRoomRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 课堂信令子类型路由（服务端强控核心）。
 *
 * <p>课堂 WebSocket 的 {@code /signal} 通道原先是「无差别透明转发」，业务语义全在前端，导致
 * 点名/举手批准/全员禁言/摄像头状态/聊天禁言都落不了服务端权威闭环。本服务在
 * {@link com.classroom.ws.ClassroomSignalHandler} 收到消息时按 {@code type} 路由，统一做三件事：
 * <ol>
 *   <li>变更服务端权威态（{@link ClassroomLiveState}）；</li>
 *   <li>向房间广播「权威消息」——客户端只认权威消息，不再依赖各自本地的伪实现；</li>
 *   <li>把事件写入教学环节流水（{@link TeachingSessionService#appendEvent}，F4-18）。</li>
 * </ol>
 *
 * <p>已知类型：hand（举手）/ hand:approve（批准开麦）/ mute-all（全员禁言）/ cam-state（摄像头状态）/
 * chat（聊天，服务端强制禁言拦截）/ wb:grant（白板协作授权）。未知类型由 handler 兜底转发。</p>
 */
@Slf4j
@Service
public class ClassroomSignalService {

    private final WsRoomRegistry registry;
    private final ClassroomLiveState liveState;
    private final TeachingSessionService teachingSession;
    private final ObjectMapper objectMapper;

    public ClassroomSignalService(WsRoomRegistry registry, ClassroomLiveState liveState,
                                 TeachingSessionService teachingSession, ObjectMapper objectMapper) {
        this.registry = registry;
        this.liveState = liveState;
        this.teachingSession = teachingSession;
        this.objectMapper = objectMapper;
    }

    /** 判断该 payload 是否本服务已知业务类型（避免无差别转发已知类型造成双发） */
    public boolean isKnownType(String payload) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            if (!node.isObject()) return false;
            String type = node.path("type").asText(null);
            return type != null && KNOWN.contains(type);
        } catch (Exception e) {
            return false;
        }
    }

    private static final java.util.Set<String> KNOWN = java.util.Set.of(
            "hand", "hand:approve", "mute-all", "cam-state", "chat", "wb:grant");

    public void handleIncoming(String scheduleId, String userId, String role, String payload, String sessionId) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            String type = node.path("type").asText(null);
            if (type == null) return;
            switch (type) {
                case "hand" -> handleHand(scheduleId, userId, node);
                case "hand:approve" -> handleHandApprove(scheduleId, role, node);
                case "mute-all" -> handleMuteAll(scheduleId, role, node);
                case "cam-state" -> handleCamState(scheduleId, userId, node);
                case "chat" -> handleChat(scheduleId, userId, role, node);
                case "wb:grant" -> handleWbGrant(scheduleId, role, node);
                default -> registry.broadcastSignalExcept(scheduleId, payload, sessionId);
            }
        } catch (Exception e) {
            log.warn("信令路由处理异常: scheduleId={}, type=?, err={}", scheduleId, e.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // 各类型处理
    // ------------------------------------------------------------------

    private void handleHand(String scheduleId, String userId, JsonNode node) {
        boolean raised = node.path("raised").asBoolean(false);
        String name = node.path("displayName").asText(userId);
        liveState.setHand(scheduleId, userId, raised);
        String msg = json("hand:state", scheduleId, userId, name, "raised", raised);
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "hand", Map.of("userId", userId, "raised", raised));
    }

    private void handleHandApprove(String scheduleId, String role, JsonNode node) {
        if (!isTeacherOrManager(role)) return;
        String target = node.path("userId").asText(null);
        if (target == null) return;
        String msg = json("mic:grant", scheduleId, target, null, "granted", true);
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "hand_approve", Map.of("userId", target));
    }

    private void handleMuteAll(String scheduleId, String role, JsonNode node) {
        if (!isTeacherOrManager(role)) return;
        boolean muted = node.path("muted").asBoolean(true);
        liveState.setMuted(scheduleId, muted);
        String msg = json("mute:state", scheduleId, null, null, "muted", muted);
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "mute_all", Map.of("muted", muted));
    }

    private void handleCamState(String scheduleId, String userId, JsonNode node) {
        boolean on = node.path("on").asBoolean(true);
        liveState.setCamera(scheduleId, userId, !on);
        String msg = json("cam:state", scheduleId, userId, null, "on", on);
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "camera", Map.of("userId", userId, "on", on));
    }

    private void handleChat(String scheduleId, String userId, String role, JsonNode node) {
        // 服务端强制禁言：被全员禁言且非教师/管理员，直接拦截并回拒
        if (liveState.isMuted(scheduleId) && !isTeacherOrManager(role)) {
            String rejected = "{\"type\":\"chat:rejected\",\"reason\":\"muted\"}";
            registry.sendSignalToUser(scheduleId, userId, rejected);
            teachingSession.appendEvent(scheduleId, "chat_blocked", Map.of("userId", userId));
            return;
        }
        String text = node.path("text").asText("");
        if (text.isBlank()) return;
        String name = node.path("displayName").asText(userId);
        long ts = System.currentTimeMillis();
        String msg = "{\"type\":\"chat:msg\",\"userId\":" + q(userId)
                + ",\"displayName\":" + q(name) + ",\"text\":" + q(text) + ",\"ts\":" + ts + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "chat", Map.of("userId", userId));
    }

    private void handleWbGrant(String scheduleId, String role, JsonNode node) {
        if (!isTeacherOrManager(role)) return;
        String target = node.path("userId").asText(null);
        boolean grant = node.path("grant").asBoolean(true);
        if (target == null) return;
        if (grant) liveState.grantWhiteboard(scheduleId, target);
        else liveState.revokeWhiteboard(scheduleId, target);
        String msg = "{\"type\":\"wb:grant:state\",\"userId\":" + q(target) + ",\"grant\":" + grant + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "wb_grant", Map.of("userId", target, "grant", grant));
    }

    // ------------------------------------------------------------------
    // 工具
    // ------------------------------------------------------------------

    private boolean isTeacherOrManager(String role) {
        return "teacher".equals(role) || "manager".equals(role) || "admin".equals(role);
    }

    private String json(String type, String scheduleId, String userId, String name, String flag, boolean value) {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"type\":").append(q(type));
        if (userId != null) sb.append(",\"userId\":").append(q(userId));
        if (name != null) sb.append(",\"displayName\":").append(q(name));
        if (flag != null) sb.append(",\"").append(flag).append("\":").append(value);
        sb.append("}");
        return sb.toString();
    }

    private String q(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    /**
     * 新成员进房时，把当前服务端权威态推给它——消除「迟到/刷新者收不到禁言/摄像头/举手/授权」的 bug。
     */
    public void pushInitialState(String scheduleId, String userId) {
        liveState.ensureMuteLoaded(scheduleId);
        boolean muted = liveState.isMuted(scheduleId);
        registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"mute:state\",\"muted\":" + muted + "}");
        liveState.cameras(scheduleId).forEach((u, off) ->
                registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"cam:state\",\"userId\":" + q(u) + ",\"on\":" + !off + "}"));
        liveState.hands(scheduleId).forEach((u, raised) ->
                registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"hand:state\",\"userId\":" + q(u) + ",\"raised\":" + raised + "}"));
        boolean granted = liveState.isWhiteboardGranted(scheduleId, userId);
        if (granted) {
            registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"wb:grant:state\",\"userId\":" + q(userId) + ",\"grant\":true}");
        }
    }

    /** 小工具：构造事件 data（避免重复 import Map 写法） */
    private static java.util.Map<String, Object> Map(Object... kv) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
}
